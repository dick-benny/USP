// Workflow controller for cross-view promote and sync logic.
// Keeps PRE Design -> Design, Design -> Säljintro and Säljintro <-> DIG PROD flows out of app_main.js.

export function createWorkflowController(context) {
  const {
    supabase,
    state,
    tableEntries,
    UI_OPEN_COLUMN,
    getCellKey,
    getInlineActionsColumn,
    normalizeRow,
    normalizeStatusValue,
    normalizeDigProdIntroCategory,
    isLikelySameProductName,
    getCurrentUserInitials,
    render,
    loadArchiveRows,
    deleteRelatedRecordsForSource,
    archiveController,
    loadModalTodoRows,
  } = context;

  async function createDigProdRowsFromSaljintro(saljintroRow) {
    const produkt = String(saljintroRow?.produkt || '').trim();
    if (!produkt) return [];

    const digProdEntry = tableEntries.find(([name]) => name === 'DIG PROD');
    if (!digProdEntry) return [];

    const [, digProdConfig] = digProdEntry;
    const ownerInitials = saljintroRow.owner_initials || getCurrentUserInitials();

    const beskrivning = String(saljintroRow?.beskrivning_status || '').trim();

    const payload = ['B2B-intro', 'B2C-intro'].map((kategori) => ({
      produktnamn: produkt,
      kategori,
      beskrivning,
      p_info: 'gray',
      ai_seo: 'gray',
      metafalt: 'gray',
      copy: 'gray',
      packshot: 'gray',
      kampanj: 'gray',
      mail_notif: 'gray',
      klart: 'gray',
      klart_datum: null,
      owner_initials: ownerInitials,
      is_done: false,
    }));

    const { data, error } = await supabase
      .from(digProdConfig.dbTable)
      .insert(payload)
      .select('*');

    if (error) {
      throw new Error(error.message || 'Kunde inte skapa DIG PROD-rader.');
    }

    const normalizedRows = (Array.isArray(data) ? data : [])
      .map((row) => normalizeRow('DIG PROD', digProdConfig, row));

    state.rowsByTable['DIG PROD'] = [
      ...normalizedRows,
      ...(state.rowsByTable['DIG PROD'] || []),
    ];

    return normalizedRows;
  }


  function getSaljintroReadyFieldsForDigProdCategory(kategori) {
    const normalized = String(kategori || '').trim();
    if (normalized === 'B2B-intro' || normalized === 'B2B-ready') {
      return { statusField: 'b2b_ready', dateField: null };
    }
    if (normalized === 'B2C-intro' || normalized === 'B2C-ready' || normalized === 'Shopify-ready') {
      return { statusField: 'shopify_ready', dateField: null };
    }
    return null;
  }


  async function syncSaljintroReadyFromDigProd(digProdRow) {
    const produkt = String(digProdRow?.produktnamn || '').trim();
    const fields = getSaljintroReadyFieldsForDigProdCategory(digProdRow?.kategori);
    if (!produkt || !fields) return;

    const saljintroEntry = tableEntries.find(([name]) => name === 'SÄLJINTRO');
    if (!saljintroEntry) return;

    const [, saljintroConfig] = saljintroEntry;
    const nextStatus = normalizeStatusValue(digProdRow?.klart || 'gray');

    const payload = { [fields.statusField]: nextStatus };

    const { data, error } = await supabase
      .from(saljintroConfig.dbTable)
      .update(payload)
      .eq('produkt', produkt)
      .select('*');

    if (error) {
      throw new Error(error.message || `Kunde inte spegla ${digProdRow?.kategori} till SÄLJINTRO.`);
    }

    const updatedRows = (Array.isArray(data) ? data : [])
      .map((row) => normalizeRow('SÄLJINTRO', saljintroConfig, row));

    if (!updatedRows.length) return;

    const updatedById = new Map(updatedRows.map((row) => [String(row.id), row]));
    state.rowsByTable['SÄLJINTRO'] = (state.rowsByTable['SÄLJINTRO'] || []).map((row) =>
      updatedById.get(String(row.id)) || row
    );
  }


  async function syncDigProdProductNameFromSaljintro(previousProductName, nextProductName) {
    const previous = String(previousProductName || '').trim();
    const next = String(nextProductName || '').trim();
    if (!previous || !next || previous === next) return;

    const digProdEntry = tableEntries.find(([name]) => name === 'DIG PROD');
    if (!digProdEntry) return;

    const [, digProdConfig] = digProdEntry;
    const { data, error } = await supabase
      .from(digProdConfig.dbTable)
      .update({ produktnamn: next })
      .eq('produktnamn', previous)
      .in('kategori', ['B2B-intro', 'B2C-intro', 'B2B-ready', 'B2C-ready', 'Shopify-ready'])
      .select('*');

    if (error) {
      throw new Error(error.message || 'Kunde inte uppdatera Produktnamn i DIG PROD.');
    }

    const updatedRows = (Array.isArray(data) ? data : [])
      .map((row) => normalizeRow('DIG PROD', digProdConfig, row));

    if (updatedRows.length) {
      const updatedById = new Map(updatedRows.map((row) => [String(row.id), row]));
      state.rowsByTable['DIG PROD'] = (state.rowsByTable['DIG PROD'] || []).map((row) =>
        updatedById.get(String(row.id)) || row
      );
    }

    state.rowsByTable['DIG PROD'] = (state.rowsByTable['DIG PROD'] || []).map((row) => {
      if (String(row?.produktnamn || '').trim() !== previous) return row;
      const kategori = normalizeDigProdIntroCategory(row?.kategori);
      if (kategori !== 'B2B-intro' && kategori !== 'B2C-intro') return row;
      return { ...row, produktnamn: next };
    });
  }


  async function syncDigProdDescriptionFromSaljintro(saljintroRow) {
    const produkt = String(saljintroRow?.produkt || '').trim();
    if (!produkt) return;

    const digProdEntry = tableEntries.find(([name]) => name === 'DIG PROD');
    if (!digProdEntry) return;

    const [, digProdConfig] = digProdEntry;
    const nextDescription = String(saljintroRow?.beskrivning_status || '').trim();

    const { data, error } = await supabase
      .from(digProdConfig.dbTable)
      .update({ beskrivning: nextDescription })
      .eq('produktnamn', produkt)
      .in('kategori', ['B2B-intro', 'B2C-intro', 'B2B-ready', 'B2C-ready', 'Shopify-ready'])
      .select('*');

    if (error) {
      throw new Error(error.message || 'Kunde inte uppdatera Beskrivning i DIG PROD.');
    }

    const updatedRows = (Array.isArray(data) ? data : [])
      .map((row) => normalizeRow('DIG PROD', digProdConfig, row));

    if (!updatedRows.length) return;

    const updatedById = new Map(updatedRows.map((row) => [String(row.id), row]));
    state.rowsByTable['DIG PROD'] = (state.rowsByTable['DIG PROD'] || []).map((row) =>
      updatedById.get(String(row.id)) || row
    );
  }


  function isDigProdIntroCategory(kategori) {
    const normalized = normalizeDigProdIntroCategory(kategori);
    return normalized === 'B2B-intro' || normalized === 'B2C-intro';
  }


  function getDigProdRowsForSaljintroRow(saljintroRow) {
    const produkt = String(saljintroRow?.produkt || '').trim();
    if (!produkt) return [];

    return (state.rowsByTable['DIG PROD'] || []).filter((row) => {
      if (!isDigProdIntroCategory(row?.kategori)) return false;
      return isLikelySameProductName(produkt, row?.produktnamn);
    });
  }


  async function archiveDigProdRowFromSaljintro(digProdConfig, digRow, saljintroRow, archiveReason) {
    await archiveController.archiveRowDirectly(
      digProdConfig,
      digRow,
      archiveReason,
      `Arkiverad automatiskt från SÄLJINTRO: ${saljintroRow?.produkt || ''}`
    );
  }


  async function archiveDigProdRowsForSaljintroRow(saljintroRow, archiveReason = 'saljintro_archived') {
    const digProdEntry = tableEntries.find(([name]) => name === 'DIG PROD');
    if (!digProdEntry) return [];

    const [, digProdConfig] = digProdEntry;
    const rowsToArchive = getDigProdRowsForSaljintroRow(saljintroRow);
    const archivedIds = [];

    for (const digRow of rowsToArchive) {
      if (!digRow?.id) continue;
      await archiveDigProdRowFromSaljintro(digProdConfig, digRow, saljintroRow, archiveReason);
      archivedIds.push(digRow.id);
    }

    if (archivedIds.length) {
      const archivedIdSet = new Set(archivedIds.map((id) => String(id)));
      state.rowsByTable['DIG PROD'] = (state.rowsByTable['DIG PROD'] || [])
        .filter((row) => !archivedIdSet.has(String(row.id)));
    }

    return archivedIds;
  }


  async function archiveSaljintroRowWithDigProd(row) {
    const confirmed = window.confirm('Lägg Säljintro-raden i Arkiv och arkivera kopplade DIG PROD-rader?');
    if (!confirmed) return;

    const saljintroEntry = tableEntries.find(([name]) => name === 'SÄLJINTRO');
    if (!saljintroEntry || !row?.id) return;

    const [, saljintroConfig] = saljintroEntry;
    const key = getCellKey(row, getInlineActionsColumn()) || `saljintro-actions-${row.id}`;
    state.savingCell = key;
    render();

    try {
      await archiveDigProdRowsForSaljintroRow(row, 'saljintro_archived');

      await archiveController.archiveRowByBestMethod(saljintroConfig, row, 'archived', null, true);

      state.rowsByTable['SÄLJINTRO'] = (state.rowsByTable['SÄLJINTRO'] || [])
        .filter((item) => item.id !== row.id);

      if (state.detailRowId === row.id) state.detailRowId = null;

      if (state.archivePanelOpen) {
        void loadArchiveRows('SÄLJINTRO');
      }
    } catch (err) {
      alert(`Kunde inte arkivera Säljintro-raden: ${err.message}`);
    } finally {
      state.savingCell = null;
      render();
    }
  }


  async function deleteDigProdRowsForSaljintroRow(saljintroRow) {
    const digProdEntry = tableEntries.find(([name]) => name === 'DIG PROD');
    if (!digProdEntry) return [];

    const [, digProdConfig] = digProdEntry;
    const rowsToDelete = getDigProdRowsForSaljintroRow(saljintroRow);
    const deletedIds = [];

    for (const digRow of rowsToDelete) {
      if (!digRow?.id) continue;

      await archiveController.deleteRelatedRecordsForSource(digProdConfig.dbTable, digRow.id);

      await archiveController.deleteRowDirectly(digProdConfig, digRow, { cleanupRelated: false });

      deletedIds.push(digRow.id);
    }

    if (deletedIds.length) {
      const deletedIdSet = new Set(deletedIds.map((id) => String(id)));
      state.rowsByTable['DIG PROD'] = (state.rowsByTable['DIG PROD'] || [])
        .filter((row) => !deletedIdSet.has(String(row.id)));
    }

    return deletedIds;
  }


  async function deleteSaljintroRowWithDigProdArchive(row) {
    const confirmed = window.confirm('Ta bort Säljintro-raden permanent och ta bort kopplade DIG PROD-rader?');
    if (!confirmed) return;

    const saljintroEntry = tableEntries.find(([name]) => name === 'SÄLJINTRO');
    if (!saljintroEntry || !row?.id) return;

    const [, saljintroConfig] = saljintroEntry;
    const key = getCellKey(row, getInlineActionsColumn()) || `saljintro-actions-${row.id}`;
    state.savingCell = key;
    render();

    try {
      await deleteDigProdRowsForSaljintroRow(row);
      await archiveController.deleteRelatedRecordsForSource(saljintroConfig.dbTable, row.id);

      await archiveController.deleteRowDirectly(saljintroConfig, row, { cleanupRelated: false });

      await loadModalTodoRows();

      state.rowsByTable['SÄLJINTRO'] = (state.rowsByTable['SÄLJINTRO'] || [])
        .filter((item) => item.id !== row.id);

      if (state.detailRowId === row.id) state.detailRowId = null;
    } catch (err) {
      alert(`Kunde inte ta bort Säljintro-raden: ${err.message}`);
    } finally {
      state.savingCell = null;
      state.editingCell = null;
      render();
    }
  }


  async function syncAllSaljintroReadyFromDigProd() {
    const saljRows = state.rowsByTable['SÄLJINTRO'] || [];
    const digRows = state.rowsByTable['DIG PROD'] || [];
    if (!saljRows.length || !digRows.length) return;

    const saljintroEntry = tableEntries.find(([name]) => name === 'SÄLJINTRO');
    if (!saljintroEntry) return;
    const [, saljintroConfig] = saljintroEntry;

    const saljByProduct = new Map();
    saljRows.forEach((row) => {
      const produkt = String(row?.produkt || '').trim();
      if (produkt) saljByProduct.set(produkt, row);
    });

    const updates = [];
    digRows.forEach((digRow) => {
      const produkt = String(digRow?.produktnamn || '').trim();
      const fields = getSaljintroReadyFieldsForDigProdCategory(digRow?.kategori);
      if (!produkt || !fields) return;
      const saljRow = saljByProduct.get(produkt);
      if (!saljRow?.id) return;

      const nextStatus = normalizeStatusValue(digRow?.klart || 'gray');
      const currentStatus = normalizeStatusValue(saljRow?.[fields.statusField] || 'gray');

      if (currentStatus !== nextStatus) {
        updates.push({ saljRow, fields, nextStatus });
      }
    });

    if (!updates.length) return;

    for (const item of updates) {
      const payload = { [item.fields.statusField]: item.nextStatus };

      const { data, error } = await supabase
        .from(saljintroConfig.dbTable)
        .update(payload)
        .eq('id', item.saljRow.id)
        .select('*')
        .single();

      if (error) {
        console.warn('Could not sync SÄLJINTRO ready status from DIG PROD:', error.message);
        continue;
      }

      const normalized = normalizeRow('SÄLJINTRO', saljintroConfig, data);
      state.rowsByTable['SÄLJINTRO'] = (state.rowsByTable['SÄLJINTRO'] || []).map((row) =>
        String(row.id) === String(normalized.id) ? normalized : row
      );
    }
  }


  async function archiveUtvecklingRowAfterSaljintro(utvecklingRow) {
    if (!utvecklingRow?.id) return;

    const utvecklingEntry = tableEntries.find(([name]) => name === 'UTVECKLING');
    const [, utvecklingConfig] = utvecklingEntry || [];
    const sourceTable = utvecklingConfig?.dbTable || 'utveckling';

    await archiveController.archiveRowByBestMethod(
      { dbTable: sourceTable },
      utvecklingRow,
      'promoted_to_saljintro',
      'Skapad i SÄLJINTRO från Design.',
      true
    );

    state.rowsByTable['UTVECKLING'] = (state.rowsByTable['UTVECKLING'] || [])
      .filter((item) => String(item.id) !== String(utvecklingRow.id));

    if (state.detailRowId && String(state.detailRowId) === String(utvecklingRow.id)) {
      state.detailRowId = null;
    }

    if (state.archivePanelOpen && state.activeTableName === 'UTVECKLING') {
      void loadArchiveRows('UTVECKLING');
    }
  }


  async function createSaljintroFromUtveckling(utvecklingRow) {
    const produkt = String(utvecklingRow?.produktide || '').trim();
    if (!produkt) {
      alert('Produktnamn saknas i Design-raden.');
      return;
    }

    const saljintroEntry = tableEntries.find(([name]) => name === 'SÄLJINTRO');
    if (!saljintroEntry) return;

    const [, saljintroConfig] = saljintroEntry;
    const key = getCellKey(utvecklingRow, UI_OPEN_COLUMN);
    state.savingCell = key;
    render();

    const payload = {
      produkt,
      beskrivning_status: utvecklingRow.beskrivning || '',
      kategori: utvecklingRow.kategori || 'matta',
      koll_q: '--',
      po_beslut: 'gray',
      po_beslut_datum: null,
      b2b_ready: 'gray',
      b2b_ready_datum: null,
      b2b_ready_slut_datum: null,
      shopify_ready: 'gray',
      shopify_ready_datum: null,
      shopify_ready_slut_datum: null,
      b2b_intro: '--',
      drop_vecka: '--',
      owner_initials: utvecklingRow.owner_initials || getCurrentUserInitials(),
      is_done: false,
    };

    const { data, error } = await supabase
      .from(saljintroConfig.dbTable)
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      state.savingCell = null;
      alert(`Kunde inte skapa rad i SÄLJINTRO: ${error.message}`);
      render();
      return;
    }

    const finalRow = normalizeRow('SÄLJINTRO', saljintroConfig, data);

    try {
      await createDigProdRowsFromSaljintro(finalRow);
    } catch (err) {
      alert(`SÄLJINTRO-raden skapades, men DIG PROD-rader kunde inte skapas: ${err.message}`);
    }

    state.rowsByTable['SÄLJINTRO'] = [
      finalRow,
      ...(state.rowsByTable['SÄLJINTRO'] || []),
    ];

    try {
      await archiveUtvecklingRowAfterSaljintro(utvecklingRow);
    } catch (err) {
      alert(`SÄLJINTRO skapades men Design-raden kunde inte arkiveras: ${err.message}`);
    }

    state.savingCell = null;
    state.detailRowId = null;
    render();
  }



  return {
    createDigProdRowsFromSaljintro,
    syncSaljintroReadyFromDigProd,
    syncDigProdProductNameFromSaljintro,
    syncDigProdDescriptionFromSaljintro,
    archiveSaljintroRowWithDigProd,
    deleteSaljintroRowWithDigProdArchive,
    syncAllSaljintroReadyFromDigProd,
    createSaljintroFromUtveckling,
  };
}
