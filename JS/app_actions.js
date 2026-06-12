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
    normalizeRow,
    render,
    toggleTodoDone,
    archiveController,
  } = deps;

  function getTodayDateString() {
    return new Date().toISOString().slice(0, 10);
  }

  const DESIGN_CATEGORY_OPTIONS = ['matta', 'colonnade', 'tapestry', 'softAss', 'packaging'];

  function normalizeDesignCategory(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const normalized = raw.toLowerCase().replace(/\s+/g, '');
    return DESIGN_CATEGORY_OPTIONS.find((option) =>
      option.toLowerCase().replace(/\s+/g, '') === normalized
    ) || '';
  }

  function getDropdownOptionLabel(value) {
    return String(value ?? '').toLocaleUpperCase('sv-SE');
  }

  function selectDesignCategoryForPreDesignPromotion() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'overlay-modal';

      const dialog = document.createElement('div');
      dialog.className = 'overlay-modal__dialog';

      const panel = document.createElement('section');
      panel.className = 'side-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Välj kategori');

      const header = document.createElement('div');
      header.className = 'side-panel__header';

      const titleBlock = document.createElement('div');
      titleBlock.className = 'view-card__title-block';

      const title = document.createElement('h2');
      title.className = 'side-panel__title';
      title.textContent = 'Välj kategori';

      const text = document.createElement('p');
      text.className = 'side-panel__text';
      text.textContent = 'Välj kategori för den nya Design-raden.';

      titleBlock.appendChild(title);
      titleBlock.appendChild(text);
      header.appendChild(titleBlock);

      const body = document.createElement('div');
      body.className = 'side-panel__body';

      const field = document.createElement('label');
      field.className = 'detail-field';

      const label = document.createElement('span');
      label.className = 'detail-field__label';
      label.textContent = 'Kategori';

      const select = document.createElement('select');
      select.className = 'detail-field__control';

      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'VÄLJ KATEGORI';
      select.appendChild(empty);

      DESIGN_CATEGORY_OPTIONS.forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = getDropdownOptionLabel(option);
        select.appendChild(opt);
      });

      field.appendChild(label);
      field.appendChild(select);
      body.appendChild(field);

      const footer = document.createElement('div');
      footer.className = 'side-panel__footer';

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'secondary-button';
      cancelButton.textContent = 'Avbryt';

      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'primary-button';
      saveButton.textContent = 'Skapa i Design';

      const cleanup = (value) => {
        overlay.remove();
        resolve(value);
      };

      cancelButton.addEventListener('click', () => cleanup(null));
      saveButton.addEventListener('click', () => {
        const category = normalizeDesignCategory(select.value);
        if (!category) {
          alert('Välj kategori innan raden skapas i Design.');
          select.focus();
          return;
        }
        cleanup(category);
      });

      select.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveButton.click();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cleanup(null);
        }
      });

      footer.appendChild(cancelButton);
      footer.appendChild(saveButton);

      panel.appendChild(header);
      panel.appendChild(body);
      panel.appendChild(footer);
      dialog.appendChild(panel);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      setTimeout(() => select.focus(), 0);
    });
  }

  function trimText(value) {
    return String(value ?? '').trim();
  }

  async function updateNewestMatchingRow({ tableName, field, value, payload, errorMessage }) {
    const tableEntry = tableEntries.find(([name]) => name === tableName);
    const [, tableConfig] = tableEntry || [];
    if (!tableConfig?.dbTable) return false;

    const matchValue = trimText(value);
    if (!matchValue || !payload || !Object.keys(payload).length) return false;

    const { data: matches, error: readError } = await supabase
      .from(tableConfig.dbTable)
      .select('id')
      .eq(field, matchValue)
      .order('created_at', { ascending: false })
      .limit(1);

    if (readError) {
      console.warn(errorMessage, readError.message);
      return false;
    }

    const match = Array.isArray(matches) ? matches[0] : null;
    if (!match?.id) return false;

    const { error: updateError } = await supabase
      .from(tableConfig.dbTable)
      .update(payload)
      .eq('id', match.id);

    if (updateError) {
      console.warn(errorMessage, updateError.message);
      return false;
    }

    return true;
  }

  async function copyPreDevDescriptionToPromotedDesign(row, category) {
    const description = trimText(row?.beskrivning);
    const designName = trimText(row?.utv_ide);
    const payload = {};

    if (description) payload.beskrivning = description;
    if (category) payload.kategori = category;

    if (!designName || !Object.keys(payload).length) return;

    await updateNewestMatchingRow({
      tableName: 'UTVECKLING',
      field: 'produktide',
      value: designName,
      payload,
      errorMessage: 'Could not copy PRE Design description/category to Design:',
    });
  }

  function normalizePreDesignSupplierForDesign(value) {
    const raw = String(value ?? '').trim();
    const normalized = raw.toLocaleLowerCase('sv-SE');
    if (normalized === 'anis' || normalized === 'anisa') return 'Anisa';
    if (normalized === 'dream home') return 'Dream Home';
    if (normalized === 'iera living') return 'Iera Living';
    return raw;
  }

  async function createDesignRowFromPreDesign(row, category) {
    const designEntry = tableEntries.find(([name]) => name === 'UTVECKLING');
    const [, designConfig] = designEntry || [];
    if (!designConfig?.dbTable) {
      throw new Error('Design-tabellen hittades inte.');
    }

    const payload = {
      produktide: trimText(row?.utv_ide),
      kategori: category,
      syfte: normalizePreDesignSupplierForDesign(row?.kategori),
      beskrivning: trimText(row?.beskrivning),
      sample_test: row?.sample_test || 'gray',
      sample_test_datum: row?.sample_test_datum || null,
      sample_test_slut_datum: row?.sample_test_slut_datum || null,
      stort_sample: 'gray',
      q_test: 'gray',
      prissattning: 'gray',
      owner_initials: row?.owner_initials || '',
      is_done: false,
    };

    const { data, error } = await supabase
      .from(designConfig.dbTable)
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message || 'Kunde inte skapa raden i Design.');
    }

    return normalizeRow('UTVECKLING', designConfig, data);
  }

  async function archivePreDesignRowAfterPromotion(row) {
    const preEntry = tableEntries.find(([name]) => name === 'PRE DEV');
    const [, preConfig] = preEntry || [];
    if (!preConfig?.dbTable) {
      throw new Error('PRE Design-tabellen hittades inte.');
    }

    const { error } = await supabase.rpc('planning_archive_row', {
      p_source_table: preConfig.dbTable,
      p_row_id: row.id,
      p_mark_done: true,
      p_archive_reason: 'promoted_to_design',
      p_note: null,
    });

    if (error) {
      throw new Error(error.message || 'Raden skapades i Design men kunde inte arkiveras i PRE Design.');
    }
  }

  async function copyDesignDescriptionToPromotedSaljintro(row) {
    const description = trimText(row?.beskrivning);
    const productName = trimText(row?.produktide);
    if (!description || !productName) return;

    await updateNewestMatchingRow({
      tableName: 'SÄLJINTRO',
      field: 'produkt',
      value: productName,
      payload: { beskrivning_status: description },
      errorMessage: 'Could not copy Design description to SÄLJINTRO:',
    });
  }

  async function updateSaljintroReadyFromDigProd(row) {
    const produktnamn = String(row?.produktnamn || '').trim();
    const kategori = String(row?.kategori || '').trim();

    if (!produktnamn) return;

    let payload = null;
    if (kategori === 'B2B-ready') {
      payload = {
        b2b_ready: 'green',
        b2b_ready_datum: getTodayDateString(),
      };
    } else if (kategori === 'Shopify-ready') {
      payload = {
        shopify_ready: 'green',
        shopify_ready_datum: getTodayDateString(),
      };
    }

    if (!payload) return;

    const { data, error } = await supabase
      .from('saljintro')
      .update(payload)
      .eq('produkt', produktnamn)
      .select('*');

    if (error) {
      throw new Error(error.message || 'Kunde inte uppdatera SÄLJINTRO.');
    }

    const updatedRows = Array.isArray(data) ? data : [];
    if (!updatedRows.length) return;

    const saljintroEntry = tableEntries.find(([name]) => name === 'SÄLJINTRO');
    if (!saljintroEntry) return;

    const [, saljintroConfig] = saljintroEntry;
    const normalizedRows = updatedRows.map((item) => normalizeRow('SÄLJINTRO', saljintroConfig, item));
    const normalizedById = new Map(normalizedRows.map((item) => [String(item.id), item]));

    state.rowsByTable['SÄLJINTRO'] = (state.rowsByTable['SÄLJINTRO'] || []).map((item) =>
      normalizedById.get(String(item.id)) || item
    );
  }

  async function archiveDigProdRow(tableConfig, row) {
    await archiveController.archiveRowDirectly(tableConfig, row, 'archived', null);
  }


  async function archiveRow(tableName, tableConfig, row) {
    const confirmed = window.confirm('Lägg raden i Arkiv?');
    if (!confirmed) return;

    const key = getCellKey(row, UI_OPEN_COLUMN);
    state.savingCell = key;
    render();

    try {
      if (tableName === 'DIG PROD') {
        await archiveDigProdRow(tableConfig, row);
        await updateSaljintroReadyFromDigProd(row);
      } else {
        await archiveController.archiveRowByBestMethod(tableConfig, row, 'archived', null, true);
      }
    } catch (err) {
      state.savingCell = null;
      alert(`Kunde inte arkivera raden: ${err.message}`);
      render();
      return;
    }

    state.savingCell = null;

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
    const category = await selectDesignCategoryForPreDesignPromotion();
    if (!category) return;

    const confirmed = window.confirm(`Lägg raden i Arkiv och skapa en ny rad i Design med kategori ${getDropdownOptionLabel(category)}?`);
    if (!confirmed) return;

    const key = getCellKey(row, UI_OPEN_COLUMN);
    state.savingCell = key;
    render();

    try {
      const createdDesignRow = await createDesignRowFromPreDesign(row, category);
      await archivePreDesignRowAfterPromotion(row);

      state.rowsByTable[tableName] =
        (state.rowsByTable[tableName] || []).filter((item) => item.id !== row.id);

      if (state.detailRowId === row.id) state.detailRowId = null;

      const utvecklingEntry = tableEntries.find(([name]) => name === 'UTVECKLING');
      if (utvecklingEntry) {
        await loadTableRowsFromData(state, 'UTVECKLING', utvecklingEntry[1]);
      } else {
        state.rowsByTable['UTVECKLING'] = [
          createdDesignRow,
          ...(state.rowsByTable['UTVECKLING'] || []),
        ];
      }
    } catch (err) {
      alert(`Kunde inte skapa i Design: ${err.message}`);
    } finally {
      state.savingCell = null;
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

    await copyDesignDescriptionToPromotedSaljintro(row);

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
    return archiveController.deleteRelatedRecordsForSource(tableConfig?.dbTable, row?.id);
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

    try {
      await archiveController.deleteRowDirectly(tableConfig, row, { cleanupRelated: false });
    } catch (err) {
      state.savingCell = null;
      state.editingCell = null;
      alert(`Kunde inte ta bort raden: ${err.message}`);
      render();
      return;
    }

    state.savingCell = null;
    state.editingCell = null;

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
    if (tableName === 'DIG PROD') {
      return {
        primary: { label: 'Klar', action: 'archive' },
        danger: { label: 'Ta bort', action: 'delete' },
      };
    }
    if (tableName === 'INKÖP') {
      return {
        primary: { label: 'Klar', action: 'archive' },
        danger: { label: 'Ta bort', action: 'delete' },
      };
    }
    if (tableName === 'MARKNAD') {
      return {
        primary: { label: 'Klar', action: 'archive' },
        danger: { label: 'Ta bort', action: 'delete' },
      };
    }
    if (tableName === 'SÄLJ') {
      return {
        primary: { label: 'Klar', action: 'archive' },
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
