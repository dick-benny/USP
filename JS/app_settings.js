export function createSettingsController({
  supabase,
  state,
  tableEntries,
  isAdmin,
  render,
  loadDocumentLinks,
  loadColumnChecklists,
  loadLinks,
  openLinksPanel,
  getPdfDisplayName,
}) {
  function openStatisticsFromSettings() {
    state.activeTableName = 'STATISTICS';
    state.settingsPanelOpen = false;
    state.settingsView = 'menu';
    state.linksPanelOpen = false;
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    state.detailRowId = null;
    state.newRowDraft = null;
    render();
  }


  function openRutinerFromSettings() {
    state.activeTableName = 'RUTINER';
    state.settingsPanelOpen = false;
    state.settingsView = 'menu';
    state.linksPanelOpen = false;
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    state.detailRowId = null;
    state.newRowDraft = null;
    render();
  }

  
  function openSettingsMenu() {
    state.linksPanelOpen = false;
    state.settingsPanelOpen = true;
    state.settingsView = 'menu';
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    state.detailRowId = null;
    state.newRowDraft = null;
    render();
  }

  
  function openSettingsDocumentLinks() {
    state.settingsPanelOpen = true;
    state.settingsView = 'document_links';
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    state.detailRowId = null;
    state.newRowDraft = null;
    render();
  }

  
  function openSettingsLinks() {
    state.settingsPanelOpen = true;
    state.settingsView = 'links';
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    state.detailRowId = null;
    state.newRowDraft = null;
    render();
  }

  
  function openSettingsChecklists() {
    state.settingsPanelOpen = true;
    state.settingsView = 'checklists';
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    state.detailRowId = null;
    state.newRowDraft = null;
    render();

    void loadColumnChecklists().then(() => {
      if (state.settingsPanelOpen && state.settingsView === 'checklists') {
        render();
      }
    });
  }

  
  const CHECKLIST_VIRTUAL_TABLES = {
    'B2B Intro': { sourceTable: 'DIG PROD', category: 'B2B-intro' },
    'B2C Intro': { sourceTable: 'DIG PROD', category: 'B2C-intro' },
  };

  function getSettingsTableOptions() {
    const names = tableEntries
      .map(([tableName]) => tableName)
      .filter((tableName) => tableName !== 'RUTINER');

    const withVirtualDigprod = [];
    names.forEach((name) => {
      withVirtualDigprod.push(name);
      if (name === 'DIG PROD') {
        withVirtualDigprod.push('B2B Intro', 'B2C Intro');
      }
    });

    return withVirtualDigprod;
  }

  
  function getSettingsColumnOptions(tableName) {
    const virtual = CHECKLIST_VIRTUAL_TABLES[tableName] || null;
    const sourceTableName = virtual?.sourceTable || tableName;
    const active = tableEntries.find(([name]) => name === sourceTableName);
    if (!active) return [];
    const [, tableConfig] = active;

    return tableConfig.columns
      .filter((column) => column.field !== 'id')
      .filter((column) => {
        if (!virtual) return true;
        if (column.hiddenInTable) return false;
        if (column.field === 'kategori') return false;
        const categories = Array.isArray(column.digprodCategories) ? column.digprodCategories : null;
        return !categories || !categories.length || categories.includes(virtual.category);
      })
      .map((column) => ({
        field: column.field,
        name: column.name,
      }));
  }

  
  function getRutinerOptions() {
    return (state.rowsByTable['RUTINER'] || []).map((row) => ({
      id: row.id,
      name: row.rutin || getPdfDisplayName(row.document) || `Dokument ${row.id}`,
      documentName: getPdfDisplayName(row.document) || 'Utan dokument',
    }));
  }

  
  function closeSettingsPanel() {
    state.settingsPanelOpen = false;
    state.settingsView = 'menu';
    render();
  }

  
  async function saveDocumentLinkFromSettings() {
    const tableName = String(state.settingsDraft.tableName || '').trim();
    const columnField = String(state.settingsDraft.columnField || '').trim();
    const rutinerRowId = String(state.settingsDraft.rutinerRowId || '').trim();
    const label = String(state.settingsDraft.label || '').trim();

    if (!tableName) return alert('Välj tabell.');
    if (!columnField) return alert('Välj kolumn.');
    if (!rutinerRowId) return alert('Välj dokument.');

    state.settingsLoading = true;
    render();

    try {
      const payload = {
        table_name: tableName,
        column_field: columnField,
        rutiner_row_id: Number(rutinerRowId),
        label: label || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('planning_document_links')
        .upsert(payload, { onConflict: 'table_name,column_field' });

      if (error) throw error;

      await loadDocumentLinks();
      state.settingsDraft = {
        tableName: '',
        columnField: '',
        rutinerRowId: '',
        label: '',
      };
    } catch (err) {
      alert(`Kunde inte spara dokumentkoppling: ${err.message}`);
    } finally {
      state.settingsLoading = false;
      render();
    }
  }

  
  async function deleteDocumentLinkFromSettings(id) {
    const confirmed = window.confirm('Ta bort denna dokumentkoppling?');
    if (!confirmed) return;

    state.settingsLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_document_links')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadDocumentLinks();
    } catch (err) {
      alert(`Kunde inte ta bort dokumentkoppling: ${err.message}`);
    } finally {
      state.settingsLoading = false;
      render();
    }
  }

  
  async function saveLinkFromSettings() {
    const title = String(state.settingsDraft.linkTitle || '').trim();
    const url = String(state.settingsDraft.linkUrl || '').trim();
    const sortOrder = Number.parseInt(String(state.settingsDraft.linkSortOrder || '100').trim(), 10);
    const isActive = !!state.settingsDraft.linkIsActive;

    if (!title) return alert('Ange länknamn.');
    if (!url) return alert('Ange länkadress.');

    state.settingsLoading = true;
    render();

    try {
      const payload = {
        title,
        url,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
        is_active: isActive,
      };

      const { error } = await supabase
        .from('planning_links')
        .insert(payload);

      if (error) throw error;

      await loadLinks();
      state.settingsDraft.linkTitle = '';
      state.settingsDraft.linkUrl = '';
      state.settingsDraft.linkSortOrder = '100';
      state.settingsDraft.linkIsActive = true;
    } catch (err) {
      alert(`Kunde inte spara länk: ${err.message}`);
    } finally {
      state.settingsLoading = false;
      render();
    }
  }

  
  async function deleteLinkFromSettings(id) {
    const confirmed = window.confirm('Ta bort denna länk?');
    if (!confirmed) return;

    state.settingsLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_links')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadLinks();
    } catch (err) {
      alert(`Kunde inte ta bort länk: ${err.message}`);
    } finally {
      state.settingsLoading = false;
      render();
    }
  }


  
  function resetChecklistDraft() {
    state.settingsDraft.checklistId = '';
    state.settingsDraft.checklistTableName = '';
    state.settingsDraft.checklistColumnField = '';
    state.settingsDraft.checklistTitle = '';
    state.settingsDraft.checklistBody = '';
    state.settingsDraft.checklistSortOrder = '100';
    state.settingsDraft.checklistIsActive = true;
    state.settingsDraft.checklistOriginalTableName = '';
    state.settingsDraft.checklistOriginalColumnField = '';
  }

  
  function editChecklistFromSettings(item) {
    state.settingsDraft.checklistId = String(item.id || '');
    state.settingsDraft.checklistTableName = String(item.table_name || '');
    state.settingsDraft.checklistColumnField = String(item.column_field || '');
    state.settingsDraft.checklistTitle = String(item.title || '');
    state.settingsDraft.checklistBody = String(item.body || '');
    state.settingsDraft.checklistSortOrder = String(item.sort_order ?? 100);
    state.settingsDraft.checklistIsActive = item.is_active !== false;
    state.settingsDraft.checklistOriginalTableName = String(item.table_name || '');
    state.settingsDraft.checklistOriginalColumnField = String(item.column_field || '');
    render();

    window.setTimeout(() => {
      document.querySelector('.settings-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 0);
  }

  
  async function saveChecklistFromSettings() {
    const tableName = String(state.settingsDraft.checklistTableName || '').trim();
    const columnField = String(state.settingsDraft.checklistColumnField || '').trim();
    const title = String(state.settingsDraft.checklistTitle || '').trim();
    const body = String(state.settingsDraft.checklistBody || '').trim();
    const sortOrder = Number.parseInt(String(state.settingsDraft.checklistSortOrder || '100').trim(), 10);
    const isActive = !!state.settingsDraft.checklistIsActive;
    const id = String(state.settingsDraft.checklistId || '').trim();

    if (!tableName) return alert('Välj tabell.');
    if (!columnField) return alert('Välj kolumn.');
    if (!body) return alert('Ange minst en punkt.');

    state.settingsLoading = true;
    render();

    try {
      const payload = {
        table_name: tableName,
        column_field: columnField,
        title,
        body,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      if (id) {
        const { data, error } = await supabase
          .from('planning_column_checklists')
          .update(payload)
          .eq('id', id)
          .select('id')
          .maybeSingle();

        if (error) throw error;

        if (!data?.id) {
          const originalTableName = String(state.settingsDraft.checklistOriginalTableName || '').trim();
          const originalColumnField = String(state.settingsDraft.checklistOriginalColumnField || '').trim();

          if (!originalTableName || !originalColumnField) {
            throw new Error('Kunde inte hitta befintlig checklist att uppdatera.');
          }

          const { error: fallbackError } = await supabase
            .from('planning_column_checklists')
            .update(payload)
            .eq('table_name', originalTableName)
            .eq('column_field', originalColumnField);

          if (fallbackError) throw fallbackError;
        }
      } else {
        const { error } = await supabase
          .from('planning_column_checklists')
          .upsert(payload, { onConflict: 'table_name,column_field' });
        if (error) throw error;
      }

      resetChecklistDraft();
      await loadColumnChecklists();
    } catch (err) {
      alert(`Kunde inte spara checklistan: ${err.message}`);
    } finally {
      state.settingsLoading = false;
      render();
    }
  }

  
  async function setChecklistActiveFromSettings(item, isActive) {
    if (!item?.id) return;

    state.settingsLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_column_checklists')
        .update({ is_active: !!isActive, updated_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) throw error;
      await loadColumnChecklists();
    } catch (err) {
      alert(`Kunde inte uppdatera checklistan: ${err.message}`);
    } finally {
      state.settingsLoading = false;
      render();
    }
  }

  
  async function deleteChecklistFromSettings(item) {
    if (!item?.id) return;
    const confirmed = window.confirm('Ta bort denna checklist permanent?');
    if (!confirmed) return;

    state.settingsLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_column_checklists')
        .delete()
        .eq('id', item.id);

      if (error) throw error;
      if (String(state.settingsDraft.checklistId) === String(item.id)) resetChecklistDraft();
      await loadColumnChecklists();
    } catch (err) {
      alert(`Kunde inte ta bort checklistan: ${err.message}`);
    } finally {
      state.settingsLoading = false;
      render();
    }
  }



  

  function getChecklistDraft() {
    if (!state.settingsChecklistDraft) {
      state.settingsChecklistDraft = null;
    }
    return state.settingsChecklistDraft;
  }

  function getChecklistPointsDraft() {
    if (!Array.isArray(state.settingsChecklistPointsDraft)) {
      state.settingsChecklistPointsDraft = [];
    }
    return state.settingsChecklistPointsDraft;
  }

  function splitChecklistBody(body) {
    return String(body || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function buildChecklistBody(points) {
    return (points || [])
      .map((point) => String(point?.text ?? point ?? '').trim())
      .filter(Boolean)
      .join('\n');
  }

  function getChecklistColumnName(tableName, columnField) {
    const column = getSettingsColumnOptions(tableName).find((item) => item.field === columnField);
    return column?.name || columnField || 'Välj kolumn';
  }

  function startNewChecklistFromSettings() {
    if (!isAdmin()) return alert('Endast admin kan skapa checklistor.');
    state.settingsChecklistDraft = {
      id: '__new__',
      table_name: '',
      column_field: '',
      title: '',
      body: '',
      sort_order: 100,
      is_active: true,
      isNew: true,
    };
    render();
  }

  function cancelNewChecklistFromSettings() {
    state.settingsChecklistDraft = null;
    render();
  }

  async function createChecklistFromDraft() {
    const draft = getChecklistDraft();
    if (!draft) return;

    const tableName = String(draft.table_name || '').trim();
    const columnField = String(draft.column_field || '').trim();
    const title = getChecklistColumnName(tableName, columnField);
    const body = String(draft.body || '').trim();
    const sortOrder = Number.parseInt(String(draft.sort_order ?? '100').trim(), 10);

    if (!tableName) return alert('Välj tabell.');
    if (!columnField) return alert('Välj kolumn.');

    state.settingsLoading = true;
    render();

    try {
      const payload = {
        table_name: tableName,
        column_field: columnField,
        title,
        body,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
        is_active: draft.is_active !== false,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('planning_column_checklists')
        .upsert(payload, { onConflict: 'table_name,column_field' });

      if (error) throw error;

      state.settingsChecklistDraft = null;
      await loadColumnChecklists();
    } catch (err) {
      alert(`Kunde inte skapa checklistan: ${err.message}`);
    } finally {
      state.settingsLoading = false;
      render();
    }
  }

  async function updateChecklistFieldFromSettings(item, patch) {
    if (!item?.id || !patch || typeof patch !== 'object') return;
    if (!isAdmin()) return alert('Endast admin kan redigera checklistor.');

    const payload = {
      ...patch,
      updated_at: new Date().toISOString(),
    };

    state.settingsLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_column_checklists')
        .update(payload)
        .eq('id', item.id);

      if (error) throw error;
      await loadColumnChecklists();
    } catch (err) {
      alert(`Kunde inte uppdatera checklistan: ${err.message}`);
    } finally {
      state.settingsLoading = false;
      render();
    }
  }

  function openChecklistPointsEditor(item) {
    const target = item?.isNew ? getChecklistDraft() : item;
    if (!target) return;
    state.settingsChecklistPointsOpen = true;
    state.settingsChecklistPointsItemId = String(target.id || '__new__');
    state.settingsChecklistPointsDraft = splitChecklistBody(target.body).map((text) => ({ text }));
    if (!state.settingsChecklistPointsDraft.length) {
      state.settingsChecklistPointsDraft.push({ text: '' });
    }
    render();
  }

  function closeChecklistPointsEditor() {
    state.settingsChecklistPointsOpen = false;
    state.settingsChecklistPointsItemId = '';
    state.settingsChecklistPointsDraft = [];
    render();
  }

  function getChecklistPointsTarget() {
    const targetId = String(state.settingsChecklistPointsItemId || '');
    if (!targetId) return null;
    if (targetId === '__new__') return getChecklistDraft();
    return (state.columnChecklistsList || []).find((item) => String(item.id) === targetId) || null;
  }

  async function persistChecklistPointsFromSettings() {
    const target = getChecklistPointsTarget();
    if (!target) return;
    const body = buildChecklistBody(getChecklistPointsDraft());

    if (String(target.id || '') === '__new__') {
      target.body = body;
      render();
      return;
    }

    await updateChecklistFieldFromSettings(target, { body });
  }

  async function saveChecklistPointsFromSettings() {
    await persistChecklistPointsFromSettings();
    closeChecklistPointsEditor();
  }

  function createChecklistTableSelect(value, onChange) {
    const select = document.createElement('select');
    select.className = 'detail-field__control settings-checklist__select';
    select.innerHTML = '<option value="">Välj tabell</option>';
    getSettingsTableOptions().forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (value === name) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  function createChecklistColumnSelect(tableName, value, onChange) {
    const select = document.createElement('select');
    select.className = 'detail-field__control settings-checklist__select';
    select.innerHTML = '<option value="">Välj kolumn</option>';
    getSettingsColumnOptions(tableName).forEach((column) => {
      const option = document.createElement('option');
      option.value = column.field;
      option.textContent = column.name;
      if (value === column.field) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }


  function createChecklistPointsModal() {
    const target = getChecklistPointsTarget();
    const points = getChecklistPointsDraft();

    const modal = document.createElement('div');
    modal.className = 'overlay-modal settings-checklist-points-overlay';
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    const panel = document.createElement('aside');
    panel.className = 'side-panel overlay-modal__dialog settings-checklist-points-modal';

    const header = document.createElement('div');
    header.className = 'side-panel__header';
    const heading = document.createElement('div');
    heading.innerHTML = `
      <p class="side-panel__eyebrow">Checklistor</p>
      <h2 class="side-panel__title">${getChecklistColumnName(target?.table_name || '', target?.column_field || '')}</h2>
      <p class="side-panel__text">Lägg till, ändra eller ta bort punkter i checklistan.</p>
    `;
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close';
    closeButton.textContent = 'Stäng';
    closeButton.addEventListener('click', closeChecklistPointsEditor);
    header.appendChild(heading);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    const card = document.createElement('section');
    card.className = 'detail-card';

    const list = document.createElement('div');
    list.className = 'settings-checklist-points-list';

    points.forEach((point, index) => {
      const row = document.createElement('div');
      row.className = 'settings-checklist-point-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'detail-field__control';
      input.value = point.text || '';
      input.placeholder = `Punkt ${index + 1}`;
      input.addEventListener('input', () => {
        points[index].text = input.value;
      });
      input.addEventListener('blur', async () => {
        points[index].text = input.value;
        await persistChecklistPointsFromSettings();
      });

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'secondary-button secondary-button--danger';
      deleteButton.textContent = 'Ta bort';
      deleteButton.disabled = points.length <= 1;
      deleteButton.addEventListener('click', async () => {
        points.splice(index, 1);
        if (!points.length) points.push({ text: '' });
        await persistChecklistPointsFromSettings();
        render();
      });

      row.appendChild(input);
      row.appendChild(deleteButton);
      list.appendChild(row);
    });

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'secondary-button';
    addButton.textContent = '+ Lägg till punkt';
    addButton.addEventListener('click', () => {
      points.push({ text: '' });
      render();
    });

    card.appendChild(list);
    card.appendChild(addButton);
    body.appendChild(card);

    panel.appendChild(header);
    panel.appendChild(body);
    modal.appendChild(panel);
    return modal;
  }


  function createSettingsPanel() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog settings-panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    if (state.settingsView === 'document_links') {
      heading.innerHTML = `
        <p class="side-panel__eyebrow">Settings</p>
        <h2 class="side-panel__title">Match kolumn + dok</h2>
        <p class="side-panel__text">Koppla kolumner till dokument i RUTINER.</p>
      `;
    } else if (state.settingsView === 'links') {
      heading.innerHTML = `
        <p class="side-panel__eyebrow">Settings</p>
        <h2 class="side-panel__title">Manage Links</h2>
        <p class="side-panel__text">Skapa och hantera globala länkar.</p>
      `;
    } else if (state.settingsView === 'checklists') {
      heading.innerHTML = `
        <p class="side-panel__eyebrow">Settings</p>
        <h2 class="side-panel__title">Checklistor</h2>
        <p class="side-panel__text">Koppla checklistor till tabellkolumner.</p>
      `;
    } else {
      heading.innerHTML = `
        <p class="side-panel__eyebrow">Settings</p>
        <h2 class="side-panel__title">Settings</h2>
        <p class="side-panel__text">Välj funktion.</p>
      `;
    }

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close';
    closeButton.textContent = 'Stäng';
    closeButton.addEventListener('click', closeSettingsPanel);

    header.appendChild(heading);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    if (state.settingsView === 'menu') {
      const menu = document.createElement('div');
      menu.className = 'settings-menu';

      const createCard = ({ title, subtitle, onClick, disabled = false, adminOnly = false }) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `settings-menu__card${disabled ? ' is-disabled' : ''}`;
        card.disabled = disabled;
        if (!disabled) card.addEventListener('click', onClick);

        const cardTitle = document.createElement('div');
        cardTitle.className = 'settings-menu__title';
        cardTitle.textContent = title;

        const cardMeta = document.createElement('div');
        cardMeta.className = 'settings-menu__meta';
        cardMeta.textContent = subtitle;

        card.appendChild(cardTitle);
        card.appendChild(cardMeta);

        if (adminOnly) {
          const tag = document.createElement('span');
          tag.className = 'settings-menu__tag';
          tag.textContent = 'Admin';
          card.appendChild(tag);
        }

        return card;
      };

      if (isAdmin()) {
        menu.appendChild(createCard({
          title: 'Checklistor',
          subtitle: 'Hantera kolumn-checklistor',
          onClick: openSettingsChecklists,
          disabled: false,
          adminOnly: true,
        }));
      }


      menu.appendChild(createCard({
        title: 'FSG',
        subtitle: 'Öppna försäljningsstatistik',
        onClick: openStatisticsFromSettings,
        disabled: false,
        adminOnly: false,
      }));

      menu.appendChild(createCard({
        title: 'Rutiner',
        subtitle: 'Öppna rutiner',
        onClick: openRutinerFromSettings,
        disabled: false,
        adminOnly: false,
      }));

      menu.appendChild(createCard({
        title: 'Logout',
        subtitle: 'Logga ut från appen',
        onClick: async () => {
          const { signOutUser } = await import('./auth.js?v=248');
          await signOutUser();
        },
        disabled: false,
        adminOnly: false,
      }));

      body.appendChild(menu);
    } else {
      if (state.settingsView !== 'checklists') {
        const backRow = document.createElement('div');
        backRow.className = 'settings-back-row';

        const backButton = document.createElement('button');
        backButton.type = 'button';
        backButton.className = 'secondary-button';
        backButton.textContent = '← Tillbaka';
        backButton.addEventListener('click', openSettingsMenu);
        backRow.appendChild(backButton);
        body.appendChild(backRow);
      }

      if (state.settingsView === 'checklists') {
        const listCard = document.createElement('section');
        listCard.className = 'detail-card settings-list settings-checklist-card';

        const listHeader = document.createElement('div');
        listHeader.className = 'settings-list__header';

        const listTitle = document.createElement('h3');
        listTitle.className = 'detail-card__title';
        listTitle.textContent = 'Checklistor';

        const headerActions = document.createElement('div');
        headerActions.className = 'settings-list__actions';

        const newButton = document.createElement('button');
        newButton.type = 'button';
        newButton.className = 'primary-button';
        newButton.textContent = '+ Ny rad';
        newButton.disabled = !isAdmin() || !!getChecklistDraft() || state.settingsLoading;
        newButton.addEventListener('click', startNewChecklistFromSettings);

        headerActions.appendChild(newButton);
        listHeader.appendChild(listTitle);
        listHeader.appendChild(headerActions);
        listCard.appendChild(listHeader);

        const hint = document.createElement('p');
        hint.className = 'detail-card__text';
        hint.textContent = 'Välj tabell och kolumn. Kolumnnamnet används som titel när checklistan visas. Använd Edit för att redigera punkter.';
        listCard.appendChild(hint);

        if (state.columnChecklistsError) {
          const error = document.createElement('p');
          error.className = 'empty-state';
          error.textContent = `Kunde inte läsa checklistor: ${state.columnChecklistsError}`;
          listCard.appendChild(error);
        }

        if (state.columnChecklistsLoading) {
          const loading = document.createElement('p');
          loading.className = 'empty-state';
          loading.textContent = 'Laddar checklistor...';
          listCard.appendChild(loading);
        } else {
          const tableWrap = document.createElement('div');
          tableWrap.className = 'table-wrap settings-checklist-table-wrap';

          const table = document.createElement('table');
          table.className = 'data-table settings-checklist-table';
          table.innerHTML = `
            <thead>
              <tr>
                <th>Tabell</th>
                <th>Kolumn</th>
                <th class="is-center">Åtgärder</th>
              </tr>
            </thead>
          `;

          const tbody = document.createElement('tbody');

          const renderChecklistRow = (item, { isDraft = false } = {}) => {
            const row = document.createElement('tr');
            row.classList.add('settings-checklist-row');
            if (isDraft) row.classList.add('is-editing');

            const tableCell = document.createElement('td');
            tableCell.appendChild(createChecklistTableSelect(item.table_name || '', async (value) => {
              if (isDraft) {
                item.table_name = value;
                item.column_field = '';
                item.title = '';
                render();
                return;
              }
              const firstColumn = getSettingsColumnOptions(value)[0]?.field || '';
              await updateChecklistFieldFromSettings(item, {
                table_name: value,
                column_field: firstColumn,
                title: getChecklistColumnName(value, firstColumn),
              });
            }));

            const columnCell = document.createElement('td');
            columnCell.appendChild(createChecklistColumnSelect(item.table_name || '', item.column_field || '', async (value) => {
              if (isDraft) {
                item.column_field = value;
                item.title = getChecklistColumnName(item.table_name || '', value);
                return;
              }
              await updateChecklistFieldFromSettings(item, {
                column_field: value,
                title: getChecklistColumnName(item.table_name || '', value),
              });
            }));

            const actionsCell = document.createElement('td');
            actionsCell.className = 'is-center';
            const actions = document.createElement('div');
            actions.className = 'row-actions row-actions--inline';

            if (isDraft) {
              const saveButton = document.createElement('button');
              saveButton.type = 'button';
              saveButton.className = 'row-actions__button';
              saveButton.textContent = state.settingsLoading ? 'Sparar...' : 'Spara';
              saveButton.disabled = state.settingsLoading || !isAdmin();
              saveButton.addEventListener('click', createChecklistFromDraft);

              const cancelButton = document.createElement('button');
              cancelButton.type = 'button';
              cancelButton.className = 'row-actions__button row-actions__button--danger';
              cancelButton.textContent = 'Avbryt';
              cancelButton.addEventListener('click', cancelNewChecklistFromSettings);

              actions.appendChild(saveButton);
              actions.appendChild(cancelButton);
            } else {
              const editButton = document.createElement('button');
              editButton.type = 'button';
              editButton.className = 'row-actions__button';
              editButton.textContent = 'Edit';
              editButton.title = 'Redigera punkter';
              editButton.disabled = !isAdmin() || state.settingsLoading;
              editButton.addEventListener('click', () => {
                openChecklistPointsEditor(item);
              });

              const deleteButton = document.createElement('button');
              deleteButton.type = 'button';
              deleteButton.className = 'row-actions__button row-actions__button--danger';
              deleteButton.textContent = '🗑';
              deleteButton.title = 'Ta bort checklista';
              deleteButton.disabled = !isAdmin() || state.settingsLoading;
              deleteButton.addEventListener('click', async () => {
                await deleteChecklistFromSettings(item);
              });
              actions.appendChild(editButton);
              actions.appendChild(deleteButton);
            }

            actionsCell.appendChild(actions);

            row.appendChild(tableCell);
            row.appendChild(columnCell);
            row.appendChild(actionsCell);
            return row;
          };

          const draft = getChecklistDraft();
          if (draft) {
            tbody.appendChild(renderChecklistRow(draft, { isDraft: true }));
          }

          const rows = state.columnChecklistsList || [];
          if (!rows.length && !draft) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.colSpan = 4;
            emptyCell.className = 'empty-row';
            emptyCell.textContent = 'Inga checklistor ännu. Klicka på + Ny rad för att skapa en.';
            emptyRow.appendChild(emptyCell);
            tbody.appendChild(emptyRow);
          } else {
            rows.forEach((item) => {
              tbody.appendChild(renderChecklistRow(item));
            });
          }

          table.appendChild(tbody);
          tableWrap.appendChild(table);
          listCard.appendChild(tableWrap);
        }

        body.appendChild(listCard);
      } else if (state.settingsView === 'links') {
        const formCard = document.createElement('section');
        formCard.className = 'detail-card settings-form';

        const formTitle = document.createElement('h3');
        formTitle.className = 'detail-card__title';
        formTitle.textContent = 'Ny länk';

        const titleField = document.createElement('label');
        titleField.className = 'detail-field';
        const titleText = document.createElement('span');
        titleText.className = 'detail-field__label';
        titleText.textContent = 'Länknamn';
        const titleInput = document.createElement('input');
        titleInput.className = 'detail-field__control';
        titleInput.type = 'text';
        titleInput.value = state.settingsDraft.linkTitle || '';
        titleInput.addEventListener('input', () => {
          state.settingsDraft.linkTitle = titleInput.value;
        });
        titleField.appendChild(titleText);
        titleField.appendChild(titleInput);

        const urlField = document.createElement('label');
        urlField.className = 'detail-field';
        const urlText = document.createElement('span');
        urlText.className = 'detail-field__label';
        urlText.textContent = 'Länkadress';
        const urlInput = document.createElement('input');
        urlInput.className = 'detail-field__control';
        urlInput.type = 'url';
        urlInput.placeholder = 'https://...';
        urlInput.value = state.settingsDraft.linkUrl || '';
        urlInput.addEventListener('input', () => {
          state.settingsDraft.linkUrl = urlInput.value;
        });
        urlField.appendChild(urlText);
        urlField.appendChild(urlInput);

        const sortField = document.createElement('label');
        sortField.className = 'detail-field';
        const sortText = document.createElement('span');
        sortText.className = 'detail-field__label';
        sortText.textContent = 'Ordning';
        const sortInput = document.createElement('input');
        sortInput.className = 'detail-field__control';
        sortInput.type = 'number';
        sortInput.value = state.settingsDraft.linkSortOrder || '100';
        sortInput.addEventListener('input', () => {
          state.settingsDraft.linkSortOrder = sortInput.value;
        });
        sortField.appendChild(sortText);
        sortField.appendChild(sortInput);

        const activeField = document.createElement('label');
        activeField.className = 'detail-field';
        const activeWrap = document.createElement('div');
        activeWrap.className = 'settings-checkbox-row';
        const activeInput = document.createElement('input');
        activeInput.type = 'checkbox';
        activeInput.checked = !!state.settingsDraft.linkIsActive;
        activeInput.addEventListener('change', () => {
          state.settingsDraft.linkIsActive = activeInput.checked;
        });
        const activeLabel = document.createElement('span');
        activeLabel.className = 'detail-field__label';
        activeLabel.textContent = 'Aktiv';
        activeWrap.appendChild(activeInput);
        activeWrap.appendChild(activeLabel);
        activeField.appendChild(activeWrap);

        const footer = document.createElement('div');
        footer.className = 'side-panel__footer';

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'primary-button';
        saveButton.textContent = state.settingsLoading ? 'Sparar...' : 'Spara';
        saveButton.disabled = state.settingsLoading || !isAdmin();
        saveButton.addEventListener('click', async () => {
          await saveLinkFromSettings();
        });

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'secondary-button';
        resetButton.textContent = 'Rensa';
        resetButton.addEventListener('click', () => {
          state.settingsDraft.linkTitle = '';
          state.settingsDraft.linkUrl = '';
          state.settingsDraft.linkSortOrder = '100';
          state.settingsDraft.linkIsActive = true;
          render();
        });

        footer.appendChild(saveButton);
        footer.appendChild(resetButton);

        formCard.appendChild(formTitle);
        formCard.appendChild(titleField);
        formCard.appendChild(urlField);
        formCard.appendChild(sortField);
        formCard.appendChild(activeField);
        formCard.appendChild(footer);

        const listCard = document.createElement('section');
        listCard.className = 'detail-card settings-list';

        const listTitle = document.createElement('h3');
        listTitle.className = 'detail-card__title';
        listTitle.textContent = 'Befintliga länkar';
        listCard.appendChild(listTitle);

        if (!state.linksList.length) {
          const empty = document.createElement('p');
          empty.className = 'empty-state';
          empty.textContent = 'Inga länkar ännu.';
          listCard.appendChild(empty);
        } else {
          const list = document.createElement('div');
          list.className = 'settings-list__rows';

          state.linksList.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'settings-list__row';

            const info = document.createElement('div');
            info.className = 'settings-list__info';

            const title = document.createElement('div');
            title.className = 'settings-list__title';
            title.textContent = item.title || 'Utan namn';

            const subtitle = document.createElement('div');
            subtitle.className = 'settings-list__meta';
            subtitle.textContent = `${item.url || ''} · ordning ${item.sort_order ?? 100}${item.is_active ? '' : ' · inaktiv'}`;

            info.appendChild(title);
            info.appendChild(subtitle);

            const actions = document.createElement('div');
            actions.className = 'settings-list__actions';

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'secondary-button secondary-button--danger';
            deleteButton.textContent = 'Ta bort';
            deleteButton.disabled = !isAdmin();
            deleteButton.addEventListener('click', async () => {
              await deleteLinkFromSettings(item.id);
            });

            actions.appendChild(deleteButton);
            row.appendChild(info);
            row.appendChild(actions);
            list.appendChild(row);
          });

          listCard.appendChild(list);
        }

        body.appendChild(formCard);
        body.appendChild(listCard);
      } else {
        const formCard = document.createElement('section');
        formCard.className = 'detail-card settings-form';

        const formTitle = document.createElement('h3');
        formTitle.className = 'detail-card__title';
        formTitle.textContent = 'Ny koppling';

        const tableLabel = document.createElement('label');
        tableLabel.className = 'detail-field';
        const tableText = document.createElement('span');
        tableText.className = 'detail-field__label';
        tableText.textContent = 'Tabell';
        const tableSelect = document.createElement('select');
        tableSelect.className = 'detail-field__control';
        tableSelect.innerHTML = '<option value="">Välj tabell</option>';
        getSettingsTableOptions().forEach((name) => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          if (state.settingsDraft.tableName === name) option.selected = true;
          tableSelect.appendChild(option);
        });
        tableSelect.addEventListener('change', () => {
          state.settingsDraft.tableName = tableSelect.value;
          state.settingsDraft.columnField = '';
          render();
        });
        tableLabel.appendChild(tableText);
        tableLabel.appendChild(tableSelect);

        const columnLabel = document.createElement('label');
        columnLabel.className = 'detail-field';
        const columnText = document.createElement('span');
        columnText.className = 'detail-field__label';
        columnText.textContent = 'Kolumn';
        const columnSelect = document.createElement('select');
        columnSelect.className = 'detail-field__control';
        columnSelect.innerHTML = '<option value="">Välj kolumn</option>';
        getSettingsColumnOptions(state.settingsDraft.tableName).forEach((column) => {
          const option = document.createElement('option');
          option.value = column.field;
          option.textContent = column.name;
          if (state.settingsDraft.columnField === column.field) option.selected = true;
          columnSelect.appendChild(option);
        });
        columnSelect.addEventListener('change', () => {
          state.settingsDraft.columnField = columnSelect.value;
        });
        columnLabel.appendChild(columnText);
        columnLabel.appendChild(columnSelect);

        const documentLabel = document.createElement('label');
        documentLabel.className = 'detail-field';
        const documentText = document.createElement('span');
        documentText.className = 'detail-field__label';
        documentText.textContent = 'Dokument';
        const documentSelect = document.createElement('select');
        documentSelect.className = 'detail-field__control';
        documentSelect.innerHTML = '<option value="">Välj dokument</option>';
        getRutinerOptions().forEach((item) => {
          const option = document.createElement('option');
          option.value = item.id;
          option.textContent = `${item.name} · ${item.documentName}`;
          if (String(state.settingsDraft.rutinerRowId) === String(item.id)) option.selected = true;
          documentSelect.appendChild(option);
        });
        documentSelect.addEventListener('change', () => {
          state.settingsDraft.rutinerRowId = documentSelect.value;
        });
        documentLabel.appendChild(documentText);
        documentLabel.appendChild(documentSelect);

        const labelField = document.createElement('label');
        labelField.className = 'detail-field';
        const labelText = document.createElement('span');
        labelText.className = 'detail-field__label';
        labelText.textContent = 'Label (valfri)';
        const labelInput = document.createElement('input');
        labelInput.className = 'detail-field__control';
        labelInput.type = 'text';
        labelInput.placeholder = 'Ex. Guide';
        labelInput.value = state.settingsDraft.label || '';
        labelInput.addEventListener('input', () => {
          state.settingsDraft.label = labelInput.value;
        });
        labelField.appendChild(labelText);
        labelField.appendChild(labelInput);

        const footer = document.createElement('div');
        footer.className = 'side-panel__footer';

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'primary-button';
        saveButton.textContent = state.settingsLoading ? 'Sparar...' : 'Spara';
        saveButton.disabled = state.settingsLoading || !isAdmin();
        saveButton.addEventListener('click', async () => {
          await saveDocumentLinkFromSettings();
        });

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'secondary-button';
        resetButton.textContent = 'Rensa';
        resetButton.addEventListener('click', () => {
          state.settingsDraft.tableName = '';
          state.settingsDraft.columnField = '';
          state.settingsDraft.rutinerRowId = '';
          state.settingsDraft.label = '';
          render();
        });

        footer.appendChild(saveButton);
        footer.appendChild(resetButton);

        formCard.appendChild(formTitle);
        formCard.appendChild(tableLabel);
        formCard.appendChild(columnLabel);
        formCard.appendChild(documentLabel);
        formCard.appendChild(labelField);
        formCard.appendChild(footer);

        const listCard = document.createElement('section');
        listCard.className = 'detail-card settings-list';

        const listTitle = document.createElement('h3');
        listTitle.className = 'detail-card__title';
        listTitle.textContent = 'Befintliga kopplingar';
        listCard.appendChild(listTitle);

        if (!state.documentLinksList.length) {
          const empty = document.createElement('p');
          empty.className = 'empty-state';
          empty.textContent = 'Inga kopplingar ännu.';
          listCard.appendChild(empty);
        } else {
          const list = document.createElement('div');
          list.className = 'settings-list__rows';

          state.documentLinksList.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'settings-list__row';

            const info = document.createElement('div');
            info.className = 'settings-list__info';

            const title = document.createElement('div');
            title.className = 'settings-list__title';
            title.textContent = `${item.table_name} · ${item.column_field}`;

            const rutiner = (state.rowsByTable['RUTINER'] || []).find((r) => String(r.id) === String(item.rutiner_row_id));
            const subtitle = document.createElement('div');
            subtitle.className = 'settings-list__meta';
            subtitle.textContent = `${item.label || 'Dok'} · ${rutiner?.rutin || 'Dokument'} · ${getPdfDisplayName(rutiner?.document || '') || 'Utan filnamn'}`;

            info.appendChild(title);
            info.appendChild(subtitle);

            const actions = document.createElement('div');
            actions.className = 'settings-list__actions';

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'secondary-button secondary-button--danger';
            deleteButton.textContent = 'Ta bort';
            deleteButton.disabled = !isAdmin();
            deleteButton.addEventListener('click', async () => {
              await deleteDocumentLinkFromSettings(item.id);
            });

            actions.appendChild(deleteButton);
            row.appendChild(info);
            row.appendChild(actions);
            list.appendChild(row);
          });

          listCard.appendChild(list);
        }

        body.appendChild(formCard);
        body.appendChild(listCard);
      }
    }

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    if (state.settingsChecklistPointsOpen) {
      overlay.appendChild(createChecklistPointsModal());
    }
    return overlay;
  }

  

  return {
    openRutinerFromSettings,
    openSettingsMenu,
    openSettingsDocumentLinks,
    openSettingsLinks,
    openSettingsChecklists,
    closeSettingsPanel,
    saveDocumentLinkFromSettings,
    deleteDocumentLinkFromSettings,
    saveLinkFromSettings,
    deleteLinkFromSettings,
    resetChecklistDraft,
    editChecklistFromSettings,
    saveChecklistFromSettings,
    setChecklistActiveFromSettings,
    deleteChecklistFromSettings,
    createSettingsPanel,
  };
}
