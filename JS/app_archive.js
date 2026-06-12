// Central archive/delete helpers.
// Keeps DB archive/delete mechanics in one place while UI controllers decide when to ask/refresh/render.

export function createArchiveController({ supabase }) {
  function getArchivePayload(tableConfig, row, archiveReason = 'archived', note = null) {
    return {
      source_table: tableConfig.dbTable,
      source_row_id: row.id,
      payload_json: row,
      archive_reason: archiveReason,
      note,
    };
  }

  function shouldUseDirectArchive(tableConfig) {
    const dbTable = String(tableConfig?.dbTable || '').trim().toLowerCase();
    return ['inkop', 'marknad', 'salj', 'dig_prod'].includes(dbTable);
  }

  async function archiveRowDirectly(tableConfig, row, archiveReason = 'archived', note = null) {
    if (!tableConfig?.dbTable || !row?.id) return false;

    const { error: insertError } = await supabase
      .from('planning_archive')
      .insert(getArchivePayload(tableConfig, row, archiveReason, note));

    if (insertError) {
      throw new Error(insertError.message || `Kunde inte lägga ${tableConfig.dbTable}-raden i Arkiv.`);
    }

    const { error: deleteError } = await supabase
      .from(tableConfig.dbTable)
      .delete()
      .eq('id', row.id);

    if (deleteError) {
      throw new Error(deleteError.message || `Kunde inte ta bort ${tableConfig.dbTable}-raden efter arkivering.`);
    }

    return true;
  }

  async function archiveRowViaRpc(tableConfig, row, archiveReason = 'archived', note = null, markDone = true) {
    if (!tableConfig?.dbTable || !row?.id) return false;

    const { error } = await supabase.rpc('planning_archive_row', {
      p_source_table: tableConfig.dbTable,
      p_row_id: row.id,
      p_mark_done: markDone,
      p_archive_reason: archiveReason,
      p_note: note,
    });

    if (error) {
      throw new Error(error.message || `Kunde inte arkivera ${tableConfig.dbTable}-raden.`);
    }

    return true;
  }

  async function archiveRowByBestMethod(tableConfig, row, archiveReason = 'archived', note = null, markDone = true) {
    if (shouldUseDirectArchive(tableConfig)) {
      return archiveRowDirectly(tableConfig, row, archiveReason, note);
    }
    return archiveRowViaRpc(tableConfig, row, archiveReason, note, markDone);
  }

  async function archiveRowSilently(tableConfig, row, archiveReason = 'archived', note = null, markDone = true) {
    if (!row?.id) return false;

    try {
      return await archiveRowByBestMethod(tableConfig, row, archiveReason, note, markDone);
    } catch (err) {
      console.warn(`Could not auto-archive ${tableConfig?.dbTable || 'unknown'} row ${row.id}:`, err.message);
      return false;
    }
  }

  async function deleteRelatedRecordsForSource(sourceTable, sourceRowId) {
    if (!sourceTable || !sourceRowId) return;

    const { data: notesData, error: notesReadError } = await supabase
      .from('planning_notes')
      .select('id')
      .eq('source_table', sourceTable)
      .eq('source_row_id', sourceRowId);

    if (notesReadError) {
      throw new Error(`Kunde inte läsa kopplade notes: ${notesReadError.message}`);
    }

    const noteIds = (Array.isArray(notesData) ? notesData : [])
      .map((item) => item.id)
      .filter(Boolean);

    if (noteIds.length) {
      const { error: noteReadsError } = await supabase
        .from('planning_note_reads')
        .delete()
        .in('note_id', noteIds);

      if (noteReadsError) {
        throw new Error(`Kunde inte ta bort note-läsningar: ${noteReadsError.message}`);
      }
    }

    const { error: notesError } = await supabase
      .from('planning_notes')
      .delete()
      .eq('source_table', sourceTable)
      .eq('source_row_id', sourceRowId);

    if (notesError) {
      throw new Error(`Kunde inte ta bort notes: ${notesError.message}`);
    }

    const { error: todosError } = await supabase
      .from('planning_row_todos')
      .delete()
      .eq('source_table', sourceTable)
      .eq('source_row_id', sourceRowId);

    if (todosError) {
      throw new Error(`Kunde inte ta bort ToDos: ${todosError.message}`);
    }
  }

  async function deleteRowDirectly(tableConfig, row, { cleanupRelated = true } = {}) {
    if (!tableConfig?.dbTable || !row?.id) return false;

    if (cleanupRelated) {
      await deleteRelatedRecordsForSource(tableConfig.dbTable, row.id);
    }

    const { error } = await supabase
      .from(tableConfig.dbTable)
      .delete()
      .eq('id', row.id);

    if (error) {
      throw new Error(error.message || `Kunde inte ta bort ${tableConfig.dbTable}-raden.`);
    }

    return true;
  }

  return {
    getArchivePayload,
    shouldUseDirectArchive,
    archiveRowDirectly,
    archiveRowViaRpc,
    archiveRowByBestMethod,
    archiveRowSilently,
    deleteRelatedRecordsForSource,
    deleteRowDirectly,
  };
}
