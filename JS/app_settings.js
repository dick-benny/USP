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

  
  function getSettingsTableOptions() {
    return tableEntries
      .map(([tableName]) => tableName)
      .filter((tableName) => tableName !== 'RUTINER');
  }

  
  function getSettingsColumnOptions(tableName) {
    const active = tableEntries.find(([name]) => name === tableName);
    if (!active) return [];
    const [, tableConfig] = active;
    return tableConfig.columns
      .filter((column) => column.field !== 'id')
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
    if (!title) return alert('Ange titel.');
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
          const { signOutUser } = await import('./auth.js?v=231');
          await signOutUser();
        },
        disabled: false,
        adminOnly: false,
      }));

      body.appendChild(menu);
    } else {
      const backRow = document.createElement('div');
      backRow.className = 'settings-back-row';

      const backButton = document.createElement('button');
      backButton.type = 'button';
      backButton.className = 'secondary-button';
      backButton.textContent = '← Tillbaka';
      backButton.addEventListener('click', openSettingsMenu);
      backRow.appendChild(backButton);
      body.appendChild(backRow);

      if (state.settingsView === 'checklists') {
        const formCard = document.createElement('section');
        formCard.className = 'detail-card settings-form';

        const formTitle = document.createElement('h3');
        formTitle.className = 'detail-card__title';
        formTitle.textContent = state.settingsDraft.checklistId ? 'Redigera checklist' : 'Ny checklist';
        if (state.settingsDraft.checklistId) {
          formTitle.classList.add('is-editing');
        }

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
          if (state.settingsDraft.checklistTableName === name) option.selected = true;
          tableSelect.appendChild(option);
        });
        tableSelect.addEventListener('change', () => {
          state.settingsDraft.checklistTableName = tableSelect.value;
          state.settingsDraft.checklistColumnField = '';
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
        getSettingsColumnOptions(state.settingsDraft.checklistTableName).forEach((column) => {
          const option = document.createElement('option');
          option.value = column.field;
          option.textContent = column.name;
          if (state.settingsDraft.checklistColumnField === column.field) option.selected = true;
          columnSelect.appendChild(option);
        });
        columnSelect.addEventListener('change', () => {
          state.settingsDraft.checklistColumnField = columnSelect.value;
        });
        columnLabel.appendChild(columnText);
        columnLabel.appendChild(columnSelect);

        const titleField = document.createElement('label');
        titleField.className = 'detail-field';
        const titleText = document.createElement('span');
        titleText.className = 'detail-field__label';
        titleText.textContent = 'Titel';
        const titleInput = document.createElement('input');
        titleInput.className = 'detail-field__control';
        titleInput.type = 'text';
        titleInput.value = state.settingsDraft.checklistTitle || '';
        titleInput.addEventListener('input', () => {
          state.settingsDraft.checklistTitle = titleInput.value;
        });
        titleField.appendChild(titleText);
        titleField.appendChild(titleInput);

        const bodyField = document.createElement('label');
        bodyField.className = 'detail-field';
        const bodyText = document.createElement('span');
        bodyText.className = 'detail-field__label';
        bodyText.textContent = 'Punkter - en per rad';
        const bodyInput = document.createElement('textarea');
        bodyInput.className = 'detail-field__control notes-form__body todo-modal__textarea';
        bodyInput.rows = 8;
        bodyInput.value = state.settingsDraft.checklistBody || '';
        bodyInput.addEventListener('input', () => {
          state.settingsDraft.checklistBody = bodyInput.value;
        });
        bodyField.appendChild(bodyText);
        bodyField.appendChild(bodyInput);

        const sortField = document.createElement('label');
        sortField.className = 'detail-field';
        const sortText = document.createElement('span');
        sortText.className = 'detail-field__label';
        sortText.textContent = 'Ordning';
        const sortInput = document.createElement('input');
        sortInput.className = 'detail-field__control';
        sortInput.type = 'number';
        sortInput.value = state.settingsDraft.checklistSortOrder || '100';
        sortInput.addEventListener('input', () => {
          state.settingsDraft.checklistSortOrder = sortInput.value;
        });
        sortField.appendChild(sortText);
        sortField.appendChild(sortInput);

        const activeField = document.createElement('label');
        activeField.className = 'detail-field';
        const activeWrap = document.createElement('div');
        activeWrap.className = 'settings-checkbox-row';
        const activeInput = document.createElement('input');
        activeInput.type = 'checkbox';
        activeInput.checked = !!state.settingsDraft.checklistIsActive;
        activeInput.addEventListener('change', () => {
          state.settingsDraft.checklistIsActive = activeInput.checked;
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
          await saveChecklistFromSettings();
        });

        const resetButton = document.createElement('button');
        resetButton.type = 'button';
        resetButton.className = 'secondary-button';
        resetButton.textContent = 'Rensa';
        resetButton.addEventListener('click', () => {
          resetChecklistDraft();
          render();
        });

        footer.appendChild(saveButton);
        footer.appendChild(resetButton);

        formCard.appendChild(formTitle);
        formCard.appendChild(tableLabel);
        formCard.appendChild(columnLabel);
        formCard.appendChild(titleField);
        formCard.appendChild(bodyField);
        formCard.appendChild(sortField);
        formCard.appendChild(activeField);
        formCard.appendChild(footer);

        const listCard = document.createElement('section');
        listCard.className = 'detail-card settings-list';

        const listHeader = document.createElement('div');
        listHeader.className = 'settings-list__header';

        const listTitle = document.createElement('h3');
        listTitle.className = 'detail-card__title';
        listTitle.textContent = `Befintliga checklistor (${(state.columnChecklistsList || []).length})`;

        const refreshButton = document.createElement('button');
        refreshButton.type = 'button';
        refreshButton.className = 'secondary-button';
        refreshButton.textContent = state.columnChecklistsLoading ? 'Laddar...' : 'Uppdatera';
        refreshButton.disabled = !!state.columnChecklistsLoading;
        refreshButton.addEventListener('click', async () => {
          await loadColumnChecklists();
          render();
        });

        listHeader.appendChild(listTitle);
        listHeader.appendChild(refreshButton);
        listCard.appendChild(listHeader);

        if (state.columnChecklistsError) {
          const error = document.createElement('p');
          error.className = 'empty-state';
          error.textContent = `Kunde inte läsa checklistor: ${state.columnChecklistsError}`;
          listCard.appendChild(error);
        }

        const rows = state.columnChecklistsList || [];
        if (state.columnChecklistsLoading) {
          const loading = document.createElement('p');
          loading.className = 'empty-state';
          loading.textContent = 'Laddar checklistor...';
          listCard.appendChild(loading);
        } else if (!rows.length) {
          const empty = document.createElement('p');
          empty.className = 'empty-state';
          empty.textContent = 'Inga checklistor visas. Om checklist finns i DB: kör SQL-filen planning_column_checklists_policy_fix.sql och tryck Uppdatera.';
          listCard.appendChild(empty);
        } else {
          const list = document.createElement('div');
          list.className = 'settings-list__rows';

          rows.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'settings-list__row';

            const info = document.createElement('div');
            info.className = 'settings-list__info';

            const title = document.createElement('div');
            title.className = 'settings-list__title';
            title.textContent = item.title || 'Utan titel';

            const subtitle = document.createElement('div');
            subtitle.className = 'settings-list__meta';
            subtitle.textContent = `${item.table_name} · ${item.column_field} · ${item.is_active ? 'aktiv' : 'inaktiv'}`;

            info.appendChild(title);
            info.appendChild(subtitle);

            const actions = document.createElement('div');
            actions.className = 'settings-list__actions';

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'secondary-button';
            editButton.textContent = 'Redigera';
            editButton.addEventListener('click', () => {
              if (!isAdmin()) {
                alert('Endast admin kan redigera checklistor.');
                return;
              }
              editChecklistFromSettings(item);
            });

            const activeButton = document.createElement('button');
            activeButton.type = 'button';
            activeButton.className = 'secondary-button';
            activeButton.textContent = item.is_active ? 'Inaktivera' : 'Aktivera';
            activeButton.disabled = !isAdmin() || state.settingsLoading;
            activeButton.addEventListener('click', async () => {
              await setChecklistActiveFromSettings(item, !item.is_active);
            });

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'secondary-button secondary-button--danger';
            deleteButton.textContent = 'Ta bort';
            deleteButton.disabled = !isAdmin() || state.settingsLoading;
            deleteButton.addEventListener('click', async () => {
              await deleteChecklistFromSettings(item);
            });

            actions.appendChild(editButton);
            actions.appendChild(activeButton);
            actions.appendChild(deleteButton);

            row.classList.add('settings-list__row--clickable');
            info.addEventListener('click', () => {
              if (!isAdmin()) {
                alert('Endast admin kan redigera checklistor.');
                return;
              }
              editChecklistFromSettings(item);
            });

            row.appendChild(info);
            row.appendChild(actions);
            list.appendChild(row);
          });

          listCard.appendChild(list);
        }

        body.appendChild(formCard);
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
