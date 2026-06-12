export function createNotesController({
  supabase,
  state,
  tableEntries,
  getCurrentUserId,
  getCurrentUserInitials,
  getRowById,
  getActiveConfig,
  render,
  isVirtualModalTodoRow,
  getRowTitleField,
  formatDateTimeValue,
}) {
  function getUnreadCountForRow(tableName, rowId) {
    return Number(state.notesUnreadByRowKey[getNotesRowKey(tableName, rowId)] || 0);
  }

  async function loadUnreadCountsForTable(tableName) {
    const userId = getCurrentUserId();
    const active = tableEntries.find(([name]) => name === tableName);
    if (!userId || !active) return;

    const [, tableConfig] = active;
    if (!tableConfig?.dbTable) return;

    const initials = getCurrentUserInitials();

    try {
      const { data: notesData, error: notesError } = await supabase
        .from('planning_notes')
        .select('id, source_row_id, created_by')
        .eq('source_table', tableConfig.dbTable);

      if (notesError) throw notesError;

      const notes = Array.isArray(notesData) ? notesData : [];
      const noteIds = notes.map((item) => item.id).filter(Boolean);

      let readIds = new Set();
      if (noteIds.length) {
        const { data: readsData, error: readsError } = await supabase
          .from('planning_note_reads')
          .select('note_id')
          .eq('user_id', userId)
          .in('note_id', noteIds);

        if (readsError) throw readsError;
        readIds = new Set((readsData || []).map((item) => item.note_id));
      }

      const nextMap = { ...state.notesUnreadByRowKey };
      Object.keys(nextMap)
        .filter((key) => key.startsWith(`${tableName}::`))
        .forEach((key) => delete nextMap[key]);

      notes.forEach((note) => {
        const rowId = note.source_row_id;
        const isOwn = String(note.created_by || '').trim() === initials;
        const isRead = readIds.has(note.id);
        if (isOwn || isRead) return;
        const key = getNotesRowKey(tableName, rowId);
        nextMap[key] = Number(nextMap[key] || 0) + 1;
      });

      state.notesUnreadByRowKey = nextMap;
      render();
    } catch (err) {
      console.warn('Could not load unread notes:', err.message);
    }
  }

  async function markNotesAsRead(tableName, notes) {
    const userId = getCurrentUserId();
    const initials = getCurrentUserInitials();
    if (!userId || !Array.isArray(notes) || !notes.length) return;

    const noteIds = notes
      .filter((item) => String(item.created_by || '').trim() !== initials)
      .map((item) => item.id)
      .filter(Boolean);

    if (!noteIds.length) return;

    const payload = noteIds.map((noteId) => ({
      note_id: noteId,
      user_id: userId,
    }));

    const { error } = await supabase
      .from('planning_note_reads')
      .upsert(payload, { onConflict: 'note_id,user_id', ignoreDuplicates: true });

    if (error) {
      console.warn('Could not mark notes as read:', error.message);
      return;
    }

    const nextMap = { ...state.notesUnreadByRowKey };
    Object.keys(nextMap)
      .filter((key) => key.startsWith(`${tableName}::`))
      .forEach((key) => {
        if (key === getNotesRowKey(tableName, state.notesRowId)) {
          nextMap[key] = 0;
        }
      });
    state.notesUnreadByRowKey = nextMap;
    render();
  }

  function formatNoteMeta(item) {
    const dateText = formatDateTimeValue(item?.created_at);
    const initials = String(item?.created_by || '').trim();
    return initials ? `${dateText} · ${initials}` : dateText;
  }

  function getNotesRowKey(tableName, rowId) {
    return `${tableName}::${rowId}`;
  }

  function getCurrentNotesRow() {
    if (state.notesCurrentRow) return state.notesCurrentRow;
    if (!state.activeTableName || !state.notesRowId) return null;
    return getRowById(state.activeTableName, state.notesRowId);
  }

  function resetNotesDraft() {
    state.notesDraft = { title: '', body: '' };
  }

  async function loadNotesForRow(tableName, rowId, options = {}) {
    state.notesLoading = true;
    render();

    try {
      const active = tableEntries.find(([name]) => name === tableName);
      if (!active) return;
      const [, tableConfig] = active;
      const sourceTable = options.sourceTable || state.notesSourceTable || tableConfig.dbTable;

      const { data, error } = await supabase
        .from('planning_notes')
        .select('*')
        .eq('source_table', sourceTable)
        .eq('source_row_id', rowId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const notes = Array.isArray(data) ? data : [];
      state.notesRowsByKey[getNotesRowKey(options.sourceTable || state.notesSourceTable || tableName, rowId)] = notes;
      await markNotesAsRead(tableName, notes);
      await loadUnreadCountsForTable(tableName);
    } catch (err) {
      alert(`Kunde inte läsa notes: ${err.message}`);
      state.notesRowsByKey[getNotesRowKey(options.sourceTable || state.notesSourceTable || tableName, rowId)] = [];
    } finally {
      state.notesLoading = false;
      render();
    }
  }

  function openNotesPanel(row, options = {}) {
    if (!row?.id) return;
    state.linksPanelOpen = false;
    state.notesPanelOpen = true;
    state.notesRowId = row.id;
    state.notesSourceTable = options.sourceTable || '';
    state.notesSourceTitle = options.title || '';
    state.notesTableLabel = options.tableLabel || '';
    state.notesCurrentRow = row;
    state.detailRowId = null;
    state.newRowDraft = null;
    state.archivePanelOpen = false;
    state.settingsPanelOpen = false;
    resetNotesDraft();
    void loadNotesForRow(state.activeTableName, row.id, options);
    render();
  }

  function closeNotesPanel() {
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.notesSourceTable = '';
    state.notesSourceTitle = '';
    state.notesTableLabel = '';
    state.notesCurrentRow = null;
    resetNotesDraft();
    render();
  }

  async function saveNoteForCurrentRow() {
    const row = getCurrentNotesRow();
    if (!row) return;
    const title = String(state.notesDraft.title || '').trim();
    const body = String(state.notesDraft.body || '').trim();

    if (!title) {
      alert('Rubrik saknas.');
      return;
    }
    if (!body) {
      alert('Text saknas.');
      return;
    }

    const active = getActiveConfig();
    if (!active) return;
    const [tableName, tableConfig] = active;
    const sourceTable = state.notesSourceTable || tableConfig.dbTable;

    state.notesLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_notes')
        .insert({
          source_table: sourceTable,
          source_row_id: row.id,
          title,
          body,
          created_by: getCurrentUserInitials(),
        });

      if (error) throw error;

      resetNotesDraft();
      await loadNotesForRow(tableName, row.id, { sourceTable });
      await loadUnreadCountsForTable(tableName);
      return;
    } catch (err) {
      alert(`Kunde inte spara note: ${err.message}`);
    } finally {
      state.notesLoading = false;
      render();
    }
  }

  function createNotesButton(row) {
    const wrap = document.createElement('div');
    wrap.className = 'row-actions';

    if (isVirtualModalTodoRow(row)) {
      return wrap;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notes-button';
    button.textContent = '📝';
    button.title = 'Notes';
    button.setAttribute('aria-label', 'Öppna notes');
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openNotesPanel(row);
    });

    const unreadCount = getUnreadCountForRow(state.activeTableName, row.id);
    if (unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'notes-button__badge';
      badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      badge.setAttribute('aria-hidden', 'true');
      button.appendChild(badge);
    }

    wrap.appendChild(button);
    return wrap;
  }

  function createNotesPanel() {
    const tableName = state.activeTableName;
    const row = getCurrentNotesRow();
    const sourceTable = state.notesSourceTable || tableName;
    const rowKey = row ? getNotesRowKey(sourceTable, row.id) : '';
    const notes = state.notesRowsByKey[rowKey] || [];
    const titleField = getRowTitleField(tableName);
    const rowTitle = state.notesSourceTitle || (row ? (row[titleField] || row.project_name || row.activity_name || 'Rad') : 'Rad');
    const tableLabel = state.notesTableLabel || tableName;

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog notes-panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    heading.className = 'todo-modal__heading';
    heading.innerHTML = `
      <p class="side-panel__eyebrow"></p>
      <h2 class="side-panel__title">Notes</h2>
      <p class="side-panel__text">${rowTitle}</p>
    `;

    const headerActions = document.createElement('div');
    headerActions.className = 'side-panel__header-actions';

    const cancelButtonTop = document.createElement('button');
    cancelButtonTop.type = 'button';
    cancelButtonTop.className = 'secondary-button';
    cancelButtonTop.textContent = 'Avbryt';
    cancelButtonTop.addEventListener('click', () => {
      resetNotesDraft();
      render();
    });

    const saveButtonTop = document.createElement('button');
    saveButtonTop.type = 'button';
    saveButtonTop.className = 'secondary-button';
    saveButtonTop.textContent = state.notesLoading ? 'Sparar...' : 'Spara';
    saveButtonTop.disabled = state.notesLoading;
    saveButtonTop.addEventListener('click', async () => {
      await saveNoteForCurrentRow();
    });

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.title = 'Stäng';
    closeButton.addEventListener('click', closeNotesPanel);

    headerActions.appendChild(cancelButtonTop);
    headerActions.appendChild(saveButtonTop);

    header.appendChild(heading);
    header.appendChild(headerActions);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    const formCard = document.createElement('section');
    formCard.className = 'detail-card notes-form';

    const formTitle = document.createElement('h3');
    formTitle.className = 'detail-card__title';
    formTitle.textContent = 'Nytt inlägg';

    const titleLabel = document.createElement('label');
    titleLabel.className = 'detail-field';
    const titleSpan = document.createElement('span');
    titleSpan.className = 'detail-field__label';
    titleSpan.textContent = 'Rubrik';
    const titleInput = document.createElement('input');
    titleInput.className = 'detail-field__control notes-form__title';
    titleInput.type = 'text';
    titleInput.value = state.notesDraft.title || '';
    titleInput.addEventListener('input', () => {
      state.notesDraft.title = titleInput.value;
    });
    titleLabel.appendChild(titleSpan);
    titleLabel.appendChild(titleInput);

    const bodyLabel = document.createElement('label');
    bodyLabel.className = 'detail-field';
    const bodySpan = document.createElement('span');
    bodySpan.className = 'detail-field__label';
    bodySpan.textContent = 'Text';
    const bodyInput = document.createElement('textarea');
    bodyInput.className = 'detail-field__control notes-form__body todo-modal__textarea';
    bodyInput.rows = 6;
    bodyInput.value = state.notesDraft.body || '';
    bodyInput.addEventListener('input', () => {
      state.notesDraft.body = bodyInput.value;
    });
    bodyLabel.appendChild(bodySpan);
    bodyLabel.appendChild(bodyInput);

    formCard.appendChild(formTitle);
    formCard.appendChild(titleLabel);
    formCard.appendChild(bodyLabel);

    const historyCard = document.createElement('section');
    historyCard.className = 'detail-card notes-history';

    const historyTitle = document.createElement('h3');
    historyTitle.className = 'detail-card__title';
    historyTitle.textContent = 'Historik';

    historyCard.appendChild(historyTitle);

    if (state.notesLoading) {
      const loading = document.createElement('p');
      loading.className = 'empty-state';
      loading.textContent = 'Laddar notes...';
      historyCard.appendChild(loading);
    } else if (!notes.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Inga notes ännu.';
      historyCard.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'notes-history__list';

      notes.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'note-item';

        const topRow = document.createElement('div');
        topRow.className = 'note-item__top';

        const title = document.createElement('div');
        title.className = 'note-item__title';
        title.textContent = item.title || 'Utan rubrik';

        const meta = document.createElement('div');
        meta.className = 'note-item__meta';
        meta.textContent = formatNoteMeta(item);

        topRow.appendChild(title);
        topRow.appendChild(meta);

        const text = document.createElement('div');
        text.className = 'note-item__body';
        text.textContent = item.body || '';

        card.appendChild(topRow);
        card.appendChild(text);
        list.appendChild(card);
      });

      historyCard.appendChild(list);
    }

    body.appendChild(formCard);
    body.appendChild(historyCard);

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    return overlay;
  }

  return {
    getUnreadCountForRow,
    loadUnreadCountsForTable,
    markNotesAsRead,
    getNotesRowKey,
    getCurrentNotesRow,
    resetNotesDraft,
    loadNotesForRow,
    openNotesPanel,
    closeNotesPanel,
    saveNoteForCurrentRow,
    createNotesButton,
    createNotesPanel,
  };
}
