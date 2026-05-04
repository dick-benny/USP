export function createActionController(deps) {
  const {
    supabase,
    state,
    tableEntries,
    TODO_TABLE,
    UI_OPEN_COLUMN,
    getCellKey,
    loadArchiveRows,
    loadModalTodoRows,
    loadTableRowsFromData,
    render,
    toggleTodoDone,
  } = deps;

  async function archiveRow(tableName, tableConfig, row) {
    const confirmed = window.confirm('Lägg raden i Arkiv?');
    if (!confirmed) return;

    const key = getCellKey(row, UI_OPEN_COLUMN);
    state.savingCell = key;
    render();

    const { error } = await supabase.rpc('planning_archive_row', {
      p_source_table: tableConfig.dbTable,
      p_row_id: row.id,
      p_mark_done: true,
      p_archive_reason: 'archived',
      p_note: null,
    });

    state.savingCell = null;

    if (error) {
      alert(`Kunde inte arkivera raden: ${error.message}`);
      render();
      return;
    }

    state.rowsByTable[tableName] =
      (state.rowsByTable[tableName] || []).filter((item) => item.id !== row.id);

    if (state.detailRowId === row.id) {
      state.detailRowId = null;
    }

    if (state.archivePanelOpen) {
      void loadArchiveRows(tableName);
    } else {
      render();
    }
  }

  async function archiveAndPromotePreDev(tableName, row) {
    const confirmed = window.confirm('Lägg raden i Arkiv och skapa en ny rad i UTVECKLING?');
    if (!confirmed) return;

    const key = getCellKey(row, UI_OPEN_COLUMN);
    state.savingCell = key;
    render();

    const { error } = await supabase.rpc('planning_archive_and_promote_pre_dev', {
      p_row_id: row.id,
      p_note: null,
    });

    state.savingCell = null;

    if (error) {
      alert(`Kunde inte arkivera och skapa i UTVECKLING: ${error.message}`);
      render();
      return;
    }

    state.rowsByTable[tableName] =
      (state.rowsByTable[tableName] || []).filter((item) => item.id !== row.id);

    if (state.detailRowId === row.id) state.detailRowId = null;

    const utvecklingEntry = tableEntries.find(([name]) => name === 'UTVECKLING');
    if (utvecklingEntry) {
      await loadTableRowsFromData(state, 'UTVECKLING', utvecklingEntry[1]);
    }

    if (state.archivePanelOpen) {
      void loadArchiveRows(tableName);
    } else {
      render();
    }
  }

  async function archiveAndPromoteUtveckling(tableName, row) {
    const confirmed = window.confirm('Lägg raden i Arkiv och skapa en ny rad i SÄLJINTRO?');
    if (!confirmed) return;

    const key = getCellKey(row, UI_OPEN_COLUMN);
    state.savingCell = key;
    render();

    const { error } = await supabase.rpc('planning_archive_and_promote_utveckling', {
      p_row_id: row.id,
      p_note: null,
    });

    state.savingCell = null;

    if (error) {
      alert(`Kunde inte arkivera och skapa i SÄLJINTRO: ${error.message}`);
      render();
      return;
    }

    state.rowsByTable[tableName] =
      (state.rowsByTable[tableName] || []).filter((item) => item.id !== row.id);

    if (state.detailRowId === row.id) state.detailRowId = null;

    const saljintroEntry = tableEntries.find(([name]) => name === 'SÄLJINTRO');
    if (saljintroEntry) {
      await loadTableRowsFromData(state, 'SÄLJINTRO', saljintroEntry[1]);
    }

    if (state.archivePanelOpen) {
      void loadArchiveRows(tableName);
    } else {
      render();
    }
  }

  async function deleteRelatedRecordsForRow(tableConfig, row) {
    if (!tableConfig?.dbTable || !row?.id) return;

    const sourceTable = tableConfig.dbTable;
    const sourceRowId = row.id;

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

  async function deleteRow(tableConfig, row) {
    const confirmed = window.confirm('Ta bort raden permanent?');
    if (!confirmed) {
      state.editingCell = null;
      render();
      return;
    }

    const key = getCellKey(row, UI_OPEN_COLUMN);
    state.savingCell = key;
    render();

    try {
      await deleteRelatedRecordsForRow(tableConfig, row);
    } catch (err) {
      state.savingCell = null;
      state.editingCell = null;
      alert(`Raden togs inte bort eftersom kopplade Notes/ToDos inte kunde städas: ${err.message}`);
      render();
      return;
    }

    const { error } = await supabase
      .from(tableConfig.dbTable)
      .delete()
      .eq('id', row.id);

    state.savingCell = null;
    state.editingCell = null;

    if (error) {
      alert(`Kunde inte ta bort raden: ${error.message}`);
      render();
      return;
    }

    await loadModalTodoRows();

    state.rowsByTable[state.activeTableName] =
      (state.rowsByTable[state.activeTableName] || []).filter((item) => item.id !== row.id);

    if (state.detailRowId === row.id) {
      state.detailRowId = null;
    }

    render();
  }

  function getActionConfig(tableName) {
    if (tableName === 'PRE DEV') {
      return {
        primary: { label: 'Arkivera + skapa i UTVECKLING', action: 'promote_pre_dev' },
        secondary: { label: 'Lägg i Arkiv', action: 'archive' },
        danger: { label: 'Ta bort', action: 'delete' },
      };
    }
    if (tableName === 'UTVECKLING') {
      return {
        primary: { label: 'Arkivera + skapa i SÄLJINTRO', action: 'promote_utveckling' },
        secondary: { label: 'Lägg i Arkiv', action: 'archive' },
        danger: { label: 'Ta bort', action: 'delete' },
      };
    }
    if (tableName === 'SÄLJINTRO') {
      return {
        primary: { label: 'Lägg i Arkiv', action: 'archive' },
        danger: { label: 'Ta bort', action: 'delete' },
      };
    }
    if (tableName === TODO_TABLE) {
      return {
        primary: { label: 'Markera Klar', action: 'complete_todo' },
        danger: { label: 'Ta bort', action: 'delete' },
      };
    }
    return {
      danger: { label: 'Ta bort', action: 'delete' },
    };
  }

  async function runRowAction(tableName, tableConfig, row, actionName) {
    if (actionName === 'archive') {
      await archiveRow(tableName, tableConfig, row);
      return;
    }
    if (actionName === 'promote_pre_dev') {
      await archiveAndPromotePreDev(tableName, row);
      return;
    }
    if (actionName === 'promote_utveckling') {
      await archiveAndPromoteUtveckling(tableName, row);
      return;
    }
    if (actionName === 'complete_todo') {
      await toggleTodoDone(tableName, tableConfig, row);
      return;
    }
    if (actionName === 'delete') {
      await deleteRow(tableConfig, row);
    }
  }

  return {
    getActionConfig,
    runRowAction,
  };
}
