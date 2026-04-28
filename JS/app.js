import { supabase } from './supabase.js?v=5';

(async function () {
  const spec = window.PlanningSpec;
  const app = document.getElementById('app');
  const nav = document.getElementById('tableNav');
  const settingsButton = document.getElementById('settingsButton') || document.getElementById('userBadge');
  const userArea = document.querySelector('.topbar__user');

  if (!spec || !spec.APP_CONFIG || !spec.APP_CONFIG.tables) {
    app.innerHTML = '<p class="empty-state">Kunde inte läsa spec.js.</p>';
    return;
  }

  const { APP_CONFIG, SAMPLE_ROWS = {} } = spec;
  const tableEntries = Object.entries(APP_CONFIG.tables);
  const UI_OPEN_COLUMN = {
    name: 'Öppna',
    field: '__open__',
    type: 'ui_open',
    width: '10ch',
    mods: { align: 'center', readonly: true },
  };
  const UI_NOTES_COLUMN = {
    name: 'Notes',
    field: '__notes__',
    type: 'ui_notes',
    width: '9ch',
    mods: { align: 'center', readonly: true },
  };
  const UI_TODO_COLUMN = {
    name: 'ToDo',
    field: '__todo__',
    type: 'ui_todo',
    width: '9ch',
    mods: { align: 'center', readonly: true },
  };
  const STATUS_ORDER = ['gray', 'yellow', 'green', 'red'];
  const TODO_TABLE = 'TODO';
  const PDF_BUCKET = 'rutiner-pdf';
  const PDF_PREFIX = 'rutiner';
  const isAdmin = () => !!window.CurrentUser?.isAdmin;

  const state = {
    activeTableName: tableEntries[0]?.[0] || null,
    rowsByTable: {},
    filtersByTable: {},
    editingCell: null,
    savingCell: null,
    detailRowId: null,
    newRowDraft: null,
    archivePanelOpen: false,
    archiveRowsByTable: {},
    archiveLoading: false,
    notesPanelOpen: false,
    notesRowId: null,
    notesRowsByKey: {},
    notesUnreadByRowKey: {},
    notesLoading: false,
    notesDraft: { title: '', body: '' },
    rowTodoPanelOpen: false,
    rowTodoRowId: null,
    rowTodosByKey: {},
    rowTodoLoading: false,
    rowTodoDraft: { kategori: 'Allmänt', beskrivning: '' },
    documentLinksByTable: {},
    settingsPanelOpen: false,
    settingsView: 'menu',
    settingsLoading: false,
    settingsDraft: {
      tableName: '',
      columnField: '',
      rutinerRowId: '',
      label: '',
      linkTitle: '',
      linkUrl: '',
      linkSortOrder: '100',
      linkIsActive: true,
    },
    documentLinksList: [],
    linksList: [],
    linksPanelOpen: false,
    modalTodoRows: [],
  };

  function getActiveConfig() {
    return tableEntries.find(([tableName]) => tableName === state.activeTableName) || null;
  }

  function getTodoSourceOptions() {
    return [TODO_TABLE, 'PRE DEV', 'UTVECKLING', 'SÄLJINTRO', 'PROJEKT'];
  }

  function getTableNameByDbTable(dbTable) {
    const entry = tableEntries.find(([, tableConfig]) => tableConfig.dbTable === dbTable);
    return entry?.[0] || '';
  }

  function getRowTitleFromSourceTable(tableName, rowId) {
    const row = getRowById(tableName, rowId);
    if (!row) return '';
    const titleField = getRowTitleField(tableName);
    return String(row?.[titleField] || '').trim();
  }

  function getSourceRowOptions(sourceTableName) {
    if (!sourceTableName || sourceTableName === TODO_TABLE) {
      const options = APP_CONFIG.dropdowns?.dropdown_todo_kategori?.filterOptions || ['Alla'];
      return ['Alla', 'Privat', ...options.filter((item) => item !== 'Alla' && item !== 'Privat')];
    }

    const titleField = getRowTitleField(sourceTableName);
    const rows = state.rowsByTable[sourceTableName] || [];
    const names = rows
      .map((row) => String(row?.[titleField] || '').trim())
      .filter(Boolean);

    return ['Alla', 'Privat', ...Array.from(new Set(names))];
  }

  function isVirtualModalTodoRow(row) {
    return row?.__virtualType === 'modal_todo';
  }

  function normalizeModalTodoRow(item) {
    const sourceTableName = getTableNameByDbTable(item.source_table);
    const rowName = getRowTitleFromSourceTable(sourceTableName, item.source_row_id);

    return {
      id: `modal-todo-${item.id}`,
      __virtualType: 'modal_todo',
      __modalTodoId: item.id,
      __source_table_name: sourceTableName,
      __source_row_id: item.source_row_id,
      __source_row_name: rowName,
      kategori: item.kategori || 'Allmänt',
      beskrivning: item.beskrivning || '',
      klart_datum: item.is_done ? (item.updated_at || item.created_at || '') : '',
      is_done: !!item.is_done,
      created_at: item.created_at || '',
      created_by: item.created_by || '',
    };
  }

  async function loadModalTodoRows() {
    try {
      const { data, error } = await supabase
        .from('planning_row_todos')
        .select('*')
        .order('is_done', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      state.modalTodoRows = Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('Could not load modal todos:', err.message);
      state.modalTodoRows = [];
    }
  }

  function hasRowTodo(tableName) {
    return !!APP_CONFIG.rowTodoConfig?.[tableName];
  }

  function getRowTodoCategories(tableName) {
    return ['Allmänt'];
  }

  function getVisibleColumns(tableConfig) {
    const columns = [
      ...tableConfig.columns.filter((column) => column.field !== 'id'),
      UI_OPEN_COLUMN,
      UI_NOTES_COLUMN,
    ];
    if (hasRowTodo(state.activeTableName)) {
      columns.push(UI_TODO_COLUMN);
    }
    return columns;
  }

  function getFieldTypeConfig(typeName) {
    return APP_CONFIG.fieldTypes?.[typeName] || null;
  }

  function getAlignment(column) {
    return column.mods?.align || getFieldTypeConfig(column.type)?.defaultAlign || 'left';
  }

  function isOpenColumn(column) {
    return column?.field === UI_OPEN_COLUMN.field;
  }

  function isStatusColumn(column) {
    return column?.type === 'status';
  }

  function isPdfColumn(column) {
    return column?.type === 'pdf';
  }

  function getDefaultValue(tableName, column) {
    const sampleRow = SAMPLE_ROWS?.[tableName]?.[0] || {};
    if (sampleRow[column.field] !== undefined) return sampleRow[column.field];
    if (column.default !== undefined) return column.default;
    const fieldType = getFieldTypeConfig(column.type);
    if (fieldType && fieldType.defaultValue !== undefined) return fieldType.defaultValue;
    return '';
  }

  function normalizeStatusValue(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    return STATUS_ORDER.includes(raw) ? raw : 'gray';
  }

  function normalizePdfPath(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '---') return '';

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const url = new URL(raw);
        const publicMarker = `/storage/v1/object/public/${PDF_BUCKET}/`;
        const signMarker = `/storage/v1/object/sign/${PDF_BUCKET}/`;
        if (url.pathname.includes(publicMarker)) {
          return decodeURIComponent(url.pathname.split(publicMarker)[1] || '');
        }
        if (url.pathname.includes(signMarker)) {
          return decodeURIComponent(url.pathname.split(signMarker)[1] || '');
        }
        return raw;
      } catch (err) {
        return raw;
      }
    }

    if (raw.startsWith(`${PDF_BUCKET}/`)) {
      return raw.slice(PDF_BUCKET.length + 1);
    }

    return raw;
  }

  function stripCommonStoragePrefix(fileName) {
    const raw = String(fileName || '').trim();
    if (!raw) return '';

    let cleaned = raw;
    cleaned = cleaned.replace(/^[0-9]{10,}[-_]/, '');
    cleaned = cleaned.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_]/i, '');
    cleaned = cleaned.replace(/^[0-9a-f]{20,}[-_]/i, '');

    return cleaned || raw;
  }

  function getPdfFileName(value) {
    const path = normalizePdfPath(value);
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1] || '';
  }

  function getPdfDisplayName(value) {
    const fileName = getPdfFileName(value);
    return stripCommonStoragePrefix(fileName);
  }

  function normalizeRow(tableName, tableConfig, row = {}) {
    const normalized = { ...row };

    tableConfig.columns.forEach((column) => {
      if (normalized[column.field] === undefined || normalized[column.field] === null) {
        normalized[column.field] = getDefaultValue(tableName, column);
      }

      if (column.type === 'status') {
        normalized[column.field] = normalizeStatusValue(normalized[column.field]);
      }

      if (column.type === 'pdf') {
        normalized[column.field] = normalizePdfPath(normalized[column.field]);
      }
    });

    if (normalized.is_done === undefined) {
      normalized.is_done = false;
    }

    return normalized;
  }

  function getRowById(tableName, rowId) {
    return (state.rowsByTable[tableName] || []).find((row) => String(row.id) === String(rowId)) || null;
  }

  function getCurrentDetailRow() {
    if (!state.activeTableName || !state.detailRowId) return null;
    return getRowById(state.activeTableName, state.detailRowId);
  }

  function getCurrentDraftRow() {
    if (!state.activeTableName || !state.newRowDraft) return null;
    if (state.newRowDraft.tableName !== state.activeTableName) return null;
    return state.newRowDraft.data || null;
  }


  function isNotesColumn(column) {
    return column?.field === UI_NOTES_COLUMN.field;
  }

  function isTodoColumn(column) {
    return column?.field === UI_TODO_COLUMN.field;
  }

  function normalizeDocumentLinks(rows) {
    const linksByTable = {};
    (rows || []).forEach((item) => {
      const tableName = String(item.table_name || '').trim();
      const columnField = String(item.column_field || '').trim();
      if (!tableName || !columnField) return;
      if (!linksByTable[tableName]) linksByTable[tableName] = {};
      linksByTable[tableName][columnField] = item;
    });
    return linksByTable;
  }

  async function loadDocumentLinks() {
    try {
      const { data, error } = await supabase
        .from('planning_document_links')
        .select('*')
        .order('table_name', { ascending: true });

      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      state.documentLinksList = rows;
      state.documentLinksByTable = normalizeDocumentLinks(rows);
    } catch (err) {
      console.warn('Could not load document links:', err.message);
      state.documentLinksList = [];
      state.documentLinksByTable = {};
    }
  }

  function getDocumentLinkForColumn(tableName, column) {
    return state.documentLinksByTable?.[tableName]?.[column.field] || null;
  }

  function getRutinerDocumentPathByRowId(rutinerRowId) {
    const rutinerRows = state.rowsByTable['RUTINER'] || [];
    const match = rutinerRows.find((row) => String(row.id) === String(rutinerRowId));
    return match?.document || '';
  }

  async function openLinkedDocument(tableName, column) {
    const link = getDocumentLinkForColumn(tableName, column);
    if (!link) return;

    const documentPath = getRutinerDocumentPathByRowId(link.rutiner_row_id);
    if (!documentPath) {
      alert('Det kopplade dokumentet kunde inte hittas i RUTINER.');
      return;
    }

    await openPdfDocument(documentPath);
  }

  function createDocumentBadge(tableName, column) {
    const link = getDocumentLinkForColumn(tableName, column);
    if (!link) return null;

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'doc-link-badge';
    badge.textContent = '';
    badge.className = 'doc-link-dot';
    badge.title = String(link.label || 'Öppna kopplat dokument').trim() || 'Öppna kopplat dokument';
    badge.setAttribute('aria-label', `Öppna kopplat dokument för ${column.name}`);
    badge.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await openLinkedDocument(tableName, column);
    });

    return badge;
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

  function openLinksPanel() {
    state.linksPanelOpen = true;
    state.settingsPanelOpen = false;
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    state.detailRowId = null;
    state.newRowDraft = null;
    render();
  }

  function closeLinksPanel() {
    state.linksPanelOpen = false;
    render();
  }

  function openExternalLink(url) {
    const value = String(url || '').trim();
    if (!value) return;
    window.open(value, '_blank', 'noopener');
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

  async function loadLinks() {
    try {
      const { data, error } = await supabase
        .from('planning_links')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      state.linksList = Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('Could not load links:', err.message);
      state.linksList = [];
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


  function createLinksPanel() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeLinksPanel();
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog settings-panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    heading.innerHTML = `
      <p class="side-panel__eyebrow">Länkar</p>
      <h2 class="side-panel__title">Snabblänkar</h2>
      <p class="side-panel__text">Öppna aktiva länkar i ny flik.</p>
    `;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close';
    closeButton.textContent = 'Stäng';
    closeButton.addEventListener('click', closeLinksPanel);

    header.appendChild(heading);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    const activeLinks = (state.linksList || []).filter((item) => item.is_active !== false);

    if (!activeLinks.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Inga aktiva länkar ännu.';
      body.appendChild(empty);
    } else {
      const listCard = document.createElement('section');
      listCard.className = 'detail-card settings-list';

      const list = document.createElement('div');
      list.className = 'settings-list__rows';

      activeLinks.forEach((item) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'settings-list__row settings-list__row--link';
        row.addEventListener('click', () => openExternalLink(item.url));

        const info = document.createElement('div');
        info.className = 'settings-list__info';

        const title = document.createElement('div');
        title.className = 'settings-list__title';
        title.textContent = item.title || 'Utan namn';

        info.appendChild(title);

        const actions = document.createElement('div');
        actions.className = 'settings-list__actions';

        const openButton = document.createElement('span');
        openButton.className = 'secondary-button';
        openButton.textContent = 'Öppna';

        actions.appendChild(openButton);
        row.appendChild(info);
        row.appendChild(actions);
        list.appendChild(row);
      });

      listCard.appendChild(list);
      body.appendChild(listCard);
    }

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    return overlay;
  }

  function getCurrentUserInitials() {
    return String(window.CurrentUser?.initials || '').trim();
  }

  function getCurrentUserId() {
    return String(window.CurrentUser?.id || '').trim();
  }

  function getUnreadCountForRow(tableName, rowId) {
    return Number(state.notesUnreadByRowKey[getNotesRowKey(tableName, rowId)] || 0);
  }

  async function loadUnreadCountsForTable(tableName) {
    const userId = getCurrentUserId();
    const active = tableEntries.find(([name]) => name === tableName);
    if (!userId || !active) return;

    const [, tableConfig] = active;
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

  function getRowTitleField(tableName) {
    if (tableName === 'PRE DEV') return 'utv_ide';
    if (tableName === 'UTVECKLING') return 'produktide';
    if (tableName === 'SÄLJINTRO') return 'produkt';
    if (tableName === 'PROJEKT') return 'projektnamn';
    if (tableName === 'TODO') return 'beskrivning';
    if (tableName === 'RUTINER') return 'rutin';
    return '';
  }

  function getCurrentNotesRow() {
    if (!state.activeTableName || !state.notesRowId) return null;
    return getRowById(state.activeTableName, state.notesRowId);
  }

  function resetNotesDraft() {
    state.notesDraft = { title: '', body: '' };
  }

  async function loadNotesForRow(tableName, rowId) {
    state.notesLoading = true;
    render();

    try {
      const active = tableEntries.find(([name]) => name === tableName);
      if (!active) return;
      const [, tableConfig] = active;

      const { data, error } = await supabase
        .from('planning_notes')
        .select('*')
        .eq('source_table', tableConfig.dbTable)
        .eq('source_row_id', rowId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const notes = Array.isArray(data) ? data : [];
      state.notesRowsByKey[getNotesRowKey(tableName, rowId)] = notes;
      await markNotesAsRead(tableName, notes);
      await loadUnreadCountsForTable(tableName);
    } catch (err) {
      alert(`Kunde inte läsa notes: ${err.message}`);
      state.notesRowsByKey[getNotesRowKey(tableName, rowId)] = [];
    } finally {
      state.notesLoading = false;
      render();
    }
  }

  function openNotesPanel(row) {
    if (!row?.id) return;
    state.linksPanelOpen = false;
    state.notesPanelOpen = true;
    state.notesRowId = row.id;
    state.detailRowId = null;
    state.newRowDraft = null;
    state.archivePanelOpen = false;
    state.settingsPanelOpen = false;
    resetNotesDraft();
    void loadNotesForRow(state.activeTableName, row.id);
    render();
  }

  function closeNotesPanel() {
    state.notesPanelOpen = false;
    state.notesRowId = null;
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

    state.notesLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_notes')
        .insert({
          source_table: tableConfig.dbTable,
          source_row_id: row.id,
          title,
          body,
          created_by: getCurrentUserInitials(),
        });

      if (error) throw error;

      resetNotesDraft();
      await loadNotesForRow(tableName, row.id);
      await loadUnreadCountsForTable(tableName);
      return;
    } catch (err) {
      alert(`Kunde inte spara note: ${err.message}`);
    } finally {
      state.notesLoading = false;
      render();
    }
  }


  function getRowTodoKey(tableName, rowId) {
    return `${tableName}::${rowId}`;
  }

  function getCurrentRowTodoRow() {
    if (!state.activeTableName || !state.rowTodoRowId) return null;
    return getRowById(state.activeTableName, state.rowTodoRowId);
  }

  function resetRowTodoDraft(tableName) {
    const categories = getRowTodoCategories(tableName);
    state.rowTodoDraft = {
      kategori: categories[0] || 'Alla',
      beskrivning: '',
    };
  }

  async function loadRowTodosForRow(tableName, rowId) {
    state.rowTodoLoading = true;
    render();

    try {
      const active = tableEntries.find(([name]) => name === tableName);
      if (!active) return;
      const [, tableConfig] = active;

      const { data, error } = await supabase
        .from('planning_row_todos')
        .select('*')
        .eq('source_table', tableConfig.dbTable)
        .eq('source_row_id', rowId)
        .order('is_done', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      state.rowTodosByKey[getRowTodoKey(tableName, rowId)] = Array.isArray(data) ? data : [];
      await loadModalTodoRows();
    } catch (err) {
      alert(`Kunde inte läsa ToDos: ${err.message}`);
      state.rowTodosByKey[getRowTodoKey(tableName, rowId)] = [];
    } finally {
      state.rowTodoLoading = false;
      render();
    }
  }

  function openRowTodoPanel(row) {
    if (!row?.id || !hasRowTodo(state.activeTableName)) return;
    state.linksPanelOpen = false;
    state.rowTodoPanelOpen = true;
    state.rowTodoRowId = row.id;
    state.detailRowId = null;
    state.newRowDraft = null;
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.settingsPanelOpen = false;
    resetRowTodoDraft(state.activeTableName);
    void loadRowTodosForRow(state.activeTableName, row.id);
    render();
  }

  function closeRowTodoPanel() {
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    resetRowTodoDraft(state.activeTableName);
    render();
  }

  async function saveRowTodoForCurrentRow() {
    const row = getCurrentRowTodoRow();
    if (!row) return;

    const kategori = 'Allmänt';
    const beskrivning = String(state.rowTodoDraft.beskrivning || '').trim();

    if (!beskrivning) {
      alert('Beskrivning saknas.');
      return;
    }

    const active = getActiveConfig();
    if (!active) return;
    const [tableName, tableConfig] = active;

    state.rowTodoLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_row_todos')
        .insert({
          source_table: tableConfig.dbTable,
          source_row_id: row.id,
          kategori,
          beskrivning,
          is_done: false,
          created_by: getCurrentUserInitials(),
        });

      if (error) throw error;

      await loadRowTodosForRow(tableName, row.id);
    } catch (err) {
      alert(`Kunde inte spara ToDo: ${err.message}`);
    } finally {
      state.rowTodoLoading = false;
      render();
    }
  }

  async function toggleRowTodoDone(item) {
    state.rowTodoLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_row_todos')
        .update({ is_done: !item.is_done })
        .eq('id', item.id);

      if (error) throw error;

      await loadRowTodosForRow(state.activeTableName, state.rowTodoRowId);
    } catch (err) {
      alert(`Kunde inte uppdatera ToDo: ${err.message}`);
    } finally {
      state.rowTodoLoading = false;
      render();
    }
  }

  async function deleteRowTodo(item) {
    const confirmed = window.confirm('Ta bort denna ToDo?');
    if (!confirmed) return;

    state.rowTodoLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_row_todos')
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      await loadRowTodosForRow(state.activeTableName, state.rowTodoRowId);
    } catch (err) {
      alert(`Kunde inte ta bort ToDo: ${err.message}`);
    } finally {
      state.rowTodoLoading = false;
      render();
    }
  }

  function createTodoButton(row) {
    const wrap = document.createElement('div');
    wrap.className = 'row-actions';

    if (isVirtualModalTodoRow(row)) {
      return wrap;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notes-button';
    button.textContent = '✓';
    button.title = 'ToDo';
    button.setAttribute('aria-label', 'Öppna ToDo');
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openRowTodoPanel(row);
    });

    wrap.appendChild(button);
    return wrap;
  }

  function createRowTodoPanel() {
    const tableName = state.activeTableName;
    const row = getCurrentRowTodoRow();
    const rowKey = row ? getRowTodoKey(tableName, row.id) : '';
    const todos = state.rowTodosByKey[rowKey] || [];
    const titleField = getRowTitleField(tableName);
    const rowTitle = row ? (row[titleField] || 'Rad') : 'Rad';
    const categories = getRowTodoCategories(tableName);
    const selectedCategory = String(state.rowTodoDraft.kategori || 'Alla');
    const filteredTodos = selectedCategory === 'Alla'
      ? todos
      : todos.filter((item) => String(item.kategori || '') === selectedCategory);

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeRowTodoPanel();
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog notes-panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    heading.className = 'todo-modal__heading';
    heading.innerHTML = `
      <p class="side-panel__eyebrow">${tableName}</p>
      <h2 class="side-panel__title">ToDo</h2>
      <p class="side-panel__text">${rowTitle}</p>
    `;

    const headerActions = document.createElement('div');
    headerActions.className = 'side-panel__header-actions';

    const cancelButtonTop = document.createElement('button');
    cancelButtonTop.type = 'button';
    cancelButtonTop.className = 'secondary-button';
    cancelButtonTop.textContent = 'Avbryt';
    cancelButtonTop.addEventListener('click', () => {
      resetRowTodoDraft(tableName);
      render();
    });

    const saveButtonTop = document.createElement('button');
    saveButtonTop.type = 'button';
    saveButtonTop.className = 'secondary-button';
    saveButtonTop.textContent = state.rowTodoLoading ? 'Sparar...' : 'Spara';
    saveButtonTop.disabled = state.rowTodoLoading;
    saveButtonTop.addEventListener('click', async () => {
      await saveRowTodoForCurrentRow();
    });

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.title = 'Stäng';
    closeButton.addEventListener('click', closeRowTodoPanel);

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
    formTitle.textContent = 'Ny ToDo';

    const categoryLabel = document.createElement('label');
    categoryLabel.className = 'detail-field';
    const categorySpan = document.createElement('span');
    categorySpan.className = 'detail-field__label';
    categorySpan.textContent = 'Kategori';
    const categorySelect = document.createElement('select');
    categorySelect.className = 'detail-field__control';
    categories.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if ((state.rowTodoDraft.kategori || 'Alla') === value) option.selected = true;
      categorySelect.appendChild(option);
    });
    categorySelect.addEventListener('change', () => {
      state.rowTodoDraft.kategori = categorySelect.value;
      render();
    });
    categoryLabel.appendChild(categorySpan);
    categoryLabel.appendChild(categorySelect);

    const bodyLabel = document.createElement('label');
    bodyLabel.className = 'detail-field';
    const bodySpan = document.createElement('span');
    bodySpan.className = 'detail-field__label';
    bodySpan.textContent = 'Beskrivning';
    const bodyInput = document.createElement('textarea');
    bodyInput.className = 'detail-field__control notes-form__body todo-modal__textarea';
    bodyInput.rows = 6;
    bodyInput.value = state.rowTodoDraft.beskrivning || '';
    bodyInput.addEventListener('input', () => {
      state.rowTodoDraft.beskrivning = bodyInput.value;
    });
    bodyLabel.appendChild(bodySpan);
    bodyLabel.appendChild(bodyInput);

    formCard.appendChild(formTitle);
    formCard.appendChild(categoryLabel);
    formCard.appendChild(bodyLabel);

    const historyCard = document.createElement('section');
    historyCard.className = 'detail-card notes-history';

    const historyTitle = document.createElement('h3');
    historyTitle.className = 'detail-card__title';
    historyTitle.textContent = 'ToDos';

    historyCard.appendChild(historyTitle);

    if (state.rowTodoLoading) {
      const loading = document.createElement('p');
      loading.className = 'empty-state';
      loading.textContent = 'Laddar ToDos...';
      historyCard.appendChild(loading);
    } else if (!filteredTodos.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = selectedCategory === 'Alla' ? 'Inga ToDos ännu.' : 'Inga ToDos i vald kategori.';
      historyCard.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'notes-history__list';

      filteredTodos.forEach((item) => {
        const card = document.createElement('article');
        card.className = `todo-item${item.is_done ? ' is-done' : ''}`;

        const topRow = document.createElement('div');
        topRow.className = 'todo-item__top';

        const title = document.createElement('div');
        title.className = 'todo-item__category';
        title.textContent = item.kategori || 'Alla';

        const rightGroup = document.createElement('div');
        rightGroup.className = 'todo-item__right';

        const meta = document.createElement('div');
        meta.className = 'todo-item__meta';
        meta.textContent = `${formatDateTimeValue(item.created_at)}${item.created_by ? ` · ${item.created_by}` : ''}`;

        const actions = document.createElement('div');
        actions.className = 'todo-item__actions';

        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className = item.is_done ? 'secondary-button' : 'primary-button';
        doneButton.textContent = item.is_done ? 'Öppna igen' : 'Klar';
        doneButton.addEventListener('click', async () => {
          await toggleRowTodoDone(item);
        });

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'secondary-button secondary-button--danger';
        deleteButton.textContent = 'Ta bort';
        deleteButton.addEventListener('click', async () => {
          await deleteRowTodo(item);
        });

        actions.appendChild(doneButton);
        actions.appendChild(deleteButton);
        rightGroup.appendChild(meta);
        rightGroup.appendChild(actions);

        topRow.appendChild(title);
        topRow.appendChild(rightGroup);

        const text = document.createElement('div');
        text.className = 'todo-item__body';
        text.textContent = item.beskrivning || '';

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

  function formatDateValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '--' || raw === '-- -- --') return '—';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat('sv-SE').format(date);
  }

  function formatDateTimeValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '—';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function formatWeekValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '--') return '--';
    const match = raw.match(/(?:W|v)?(\d{1,2})$/i) || raw.match(/(?:W|v)(\d{1,2})/i);
    if (!match) return raw;
    const week = Math.max(1, Math.min(53, Number(match[1])));
    return `v${String(week).padStart(2, '0')}`;
  }

  function formatQuarterValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '--') return '--';
    const match = raw.match(/Q([1-4])/i) || raw.match(/([1-4])$/);
    if (!match) return raw;
    return `Q${match[1]}`;
  }

  function ensureRowMeta(row) {
    if (!row.__uiMeta) row.__uiMeta = {};
    if (!row.__uiMeta.pdfFiles) row.__uiMeta.pdfFiles = {};
    return row.__uiMeta;
  }

  function getDraftPdfFile(row, fieldName) {
    return row?.__uiMeta?.pdfFiles?.[fieldName] || null;
  }

  function setDraftPdfFile(row, fieldName, file) {
    const meta = ensureRowMeta(row);
    if (file) {
      meta.pdfFiles[fieldName] = file;
    } else {
      delete meta.pdfFiles[fieldName];
    }
  }

  function isPdfFile(file) {
    if (!file) return false;
    const name = String(file.name || '').toLowerCase();
    return file.type === 'application/pdf' || name.endsWith('.pdf');
  }

  function sanitizePdfFileName(name) {
    const raw = String(name || 'dokument.pdf').trim();
    return raw
      .normalize('NFKD')
      .replace(/[^\w.\- ]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'dokument.pdf';
  }

  function buildPdfStoragePath(file) {
    const safeName = sanitizePdfFileName(file?.name || 'dokument.pdf');
    return `${PDF_PREFIX}/${Date.now()}-${safeName}`;
  }

  async function uploadPdfFile(file) {
    if (!isPdfFile(file)) {
      throw new Error('Endast PDF-filer stöds.');
    }

    const storagePath = buildPdfStoragePath(file);
    const { error } = await supabase.storage
      .from(PDF_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'application/pdf',
      });

    if (error) {
      throw new Error(error.message || 'Kunde inte ladda upp PDF.');
    }

    return storagePath;
  }

  async function removePdfFromStorage(storagePath) {
    const objectPath = normalizePdfPath(storagePath);
    if (!objectPath) return;

    const { error } = await supabase.storage
      .from(PDF_BUCKET)
      .remove([objectPath]);

    if (error) {
      throw new Error(error.message || 'Kunde inte ta bort PDF från storage.');
    }
  }

  async function loadTableRows(tableName, tableConfig) {
    try {
      const { data, error } = await supabase.from(tableConfig.dbTable).select('*');

      if (error) {
        console.warn(`Supabase error for ${tableConfig.dbTable}:`, error.message);
        state.rowsByTable[tableName] = (SAMPLE_ROWS[tableName] || []).map((row) =>
          normalizeRow(tableName, tableConfig, row)
        );
        return;
      }

      const rows = Array.isArray(data) && data.length
        ? data.map((row) => normalizeRow(tableName, tableConfig, row))
        : (SAMPLE_ROWS[tableName] || []).map((row) => normalizeRow(tableName, tableConfig, row));

      state.rowsByTable[tableName] = rows;
    } catch (err) {
      console.error(`Unexpected fetch error for ${tableConfig.dbTable}:`, err);
      state.rowsByTable[tableName] = (SAMPLE_ROWS[tableName] || []).map((row) =>
        normalizeRow(tableName, tableConfig, row)
      );
    }
  }

  async function loadArchiveRows(tableName) {
    const active = tableEntries.find(([name]) => name === tableName);
    if (!active) return;
    const [, tableConfig] = active;

    state.archiveLoading = true;
    render();

    try {
      const { data, error } = await supabase
        .from('planning_archive')
        .select('*')
        .eq('source_table', tableConfig.dbTable)
        .order('archived_at', { ascending: false });

      if (error) {
        throw error;
      }

      state.archiveRowsByTable[tableName] = Array.isArray(data) ? data : [];
    } catch (err) {
      alert(`Kunde inte läsa arkivet: ${err.message}`);
      state.archiveRowsByTable[tableName] = [];
    } finally {
      state.archiveLoading = false;
      render();
    }
  }

  function openArchivePanel() {
    if (state.activeTableName === 'RUTINER') {
      alert('RUTINER har inget arkiv.');
      return;
    }
    state.linksPanelOpen = false;
    state.archivePanelOpen = true;
    state.detailRowId = null;
    state.newRowDraft = null;
    state.settingsPanelOpen = false;
    void loadArchiveRows(state.activeTableName);
    render();
  }

  function closeArchivePanel() {
    state.archivePanelOpen = false;
    render();
  }

  function ensureFilters(tableName, tableConfig) {
    if (!state.filtersByTable[tableName]) {
      const filters = {};
      getVisibleColumns(tableConfig).forEach((column) => {
        if (column.type === 'status') return;
        const dropdown = APP_CONFIG.dropdowns?.[column.type];
        if (dropdown?.filterEnabled) {
          filters[column.field] = 'Alla';
        }
      });

      if (tableName === TODO_TABLE) {
        filters.__todo_source = TODO_TABLE;
        filters.__todo_source_row = 'Alla';
      }

      state.filtersByTable[tableName] = filters;
    }
    return state.filtersByTable[tableName];
  }

  function ensureLinksButton() {
    if (!userArea) return;
    let linksButton = document.getElementById('linksButton');
    if (linksButton) return;

    linksButton = document.createElement('button');
    linksButton.id = 'linksButton';
    linksButton.type = 'button';
    linksButton.className = settingsButton?.className || 'topbar__settings';
    linksButton.textContent = 'LÄNKAR';
    linksButton.addEventListener('click', openLinksPanel);

    if (settingsButton && settingsButton.parentElement === userArea) {
      userArea.insertBefore(linksButton, settingsButton);
    } else {
      userArea.appendChild(linksButton);
    }
  }

  function createNav() {
    nav.innerHTML = '';

    tableEntries.forEach(([tableName]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'table-nav__link';
      button.textContent = tableName;

      if (tableName === state.activeTableName) {
        button.classList.add('is-active');
      }

      button.addEventListener('click', () => {
        state.activeTableName = tableName;
        state.editingCell = null;
        state.savingCell = null;
        state.detailRowId = null;
        state.archivePanelOpen = false;
        state.notesPanelOpen = false;
        state.notesRowId = null;
        state.linksPanelOpen = false;
        state.rowTodoPanelOpen = false;
        state.rowTodoRowId = null;
        state.settingsPanelOpen = false;

        if (tableName === TODO_TABLE) {
          const todoFilters = ensureFilters(TODO_TABLE, APP_CONFIG.tables[TODO_TABLE]);
          todoFilters.__todo_source = TODO_TABLE;
          todoFilters.__todo_source_row = 'Alla';
          void loadModalTodoRows();
        }

        void loadUnreadCountsForTable(tableName);
        render();
      });

      nav.appendChild(button);
    });
  }

  function printActiveView(tableName) {
    const previousTitle = document.title;
    document.title = `${tableName} - TODO Planning`;

    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        document.title = previousTitle;
      }, 250);
    }, 0);
  }

  function createTopActions(tableName, tableConfig) {
    const wrap = document.createElement('div');
    wrap.className = 'view-actions';

    const newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.className = 'secondary-button';
    newButton.textContent = '+ Ny rad';

    newButton.addEventListener('click', () => {
      const draft = {};
      tableConfig.columns.forEach((column) => {
        if (column.field === 'id') return;
        draft[column.field] = getDefaultValue(tableName, column);
      });
      draft.is_done = false;

      state.newRowDraft = {
        tableName,
        data: normalizeRow(tableName, tableConfig, draft),
      };
      state.linksPanelOpen = false;
      state.detailRowId = null;
      state.editingCell = null;
      state.archivePanelOpen = false;
      state.notesPanelOpen = false;
      state.notesRowId = null;
      state.rowTodoPanelOpen = false;
      state.rowTodoRowId = null;
      render();
    });

    wrap.appendChild(newButton);

    if (tableName !== 'RUTINER') {
      const archiveButton = document.createElement('button');
      archiveButton.type = 'button';
      archiveButton.className = 'secondary-button';
      archiveButton.textContent = 'Arkiv';
      archiveButton.addEventListener('click', openArchivePanel);
      wrap.appendChild(archiveButton);
    }

    const printButton = document.createElement('button');
    printButton.type = 'button';
    printButton.className = 'secondary-button';
    printButton.textContent = 'Print';
    printButton.addEventListener('click', () => {
      printActiveView(tableName);
    });
    wrap.appendChild(printButton);

    return wrap;
  }

  function createFilterBar(tableName, tableConfig) {
    const filters = ensureFilters(tableName, tableConfig);
    const wrapper = document.createElement('section');
    wrapper.className = 'filters';

    let hasFilters = false;

    if (tableName === TODO_TABLE) {
      const sourceItem = document.createElement('label');
      sourceItem.className = 'filter-item';

      const sourceLabel = document.createElement('span');
      sourceLabel.className = 'filter-item__label';
      sourceLabel.textContent = 'Källa';

      const sourceSelect = document.createElement('select');
      sourceSelect.className = 'filter-item__control';

      getTodoSourceOptions().forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if ((filters.__todo_source || TODO_TABLE) === option) {
          opt.selected = true;
        }
        sourceSelect.appendChild(opt);
      });

      sourceSelect.addEventListener('change', () => {
        filters.__todo_source = sourceSelect.value;
        filters.__todo_source_row = 'Alla';
        if (filters.__todo_source !== TODO_TABLE) {
          void loadModalTodoRows();
        }
        render();
      });

      sourceItem.appendChild(sourceLabel);
      sourceItem.appendChild(sourceSelect);
      wrapper.appendChild(sourceItem);
      hasFilters = true;

      const rowItem = document.createElement('label');
      rowItem.className = 'filter-item';

      const rowLabel = document.createElement('span');
      rowLabel.className = 'filter-item__label';
      rowLabel.textContent = 'Rad';

      const rowSelect = document.createElement('select');
      rowSelect.className = 'filter-item__control';

      getSourceRowOptions(filters.__todo_source || TODO_TABLE).forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if ((filters.__todo_source_row || 'Alla') === option) {
          opt.selected = true;
        }
        rowSelect.appendChild(opt);
      });

      rowSelect.addEventListener('change', () => {
        filters.__todo_source_row = rowSelect.value;
        render();
      });

      rowItem.appendChild(rowLabel);
      rowItem.appendChild(rowSelect);
      wrapper.appendChild(rowItem);

      return wrapper;
    }

    getVisibleColumns(tableConfig).forEach((column) => {
      if (column.type === 'status') return;
      const dropdown = APP_CONFIG.dropdowns?.[column.type];
      if (!dropdown?.filterEnabled) return;
      hasFilters = true;

      const item = document.createElement('label');
      item.className = 'filter-item';

      const label = document.createElement('span');
      label.className = 'filter-item__label';
      label.textContent = column.name;

      const select = document.createElement('select');
      select.className = 'filter-item__control';

      dropdown.filterOptions.forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if ((filters[column.field] || 'Alla') === option) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });

      select.addEventListener('change', () => {
        filters[column.field] = select.value;
        render();
      });

      item.appendChild(label);
      item.appendChild(select);
      wrapper.appendChild(item);
    });

    if (!hasFilters) {
      wrapper.classList.add('filters--empty');
    }

    return wrapper;
  }

  function getFilteredRows(tableName, tableConfig) {
    const filters = ensureFilters(tableName, tableConfig);

    if (tableName === TODO_TABLE) {
      const source = filters.__todo_source || TODO_TABLE;
      const sourceRow = filters.__todo_source_row || 'Alla';

      if (source === TODO_TABLE) {
        const rows = state.rowsByTable[tableName] || [];
        return rows.filter((row) => {
          if (!sourceRow || sourceRow === 'Alla') return true;
          if (sourceRow === 'Privat') {
            const currentUser = getCurrentUserInitials();
            return String(row.created_by || '') === currentUser;
          }
          return String(row.kategori ?? '') === sourceRow;
        });
      }

      let rows = (state.modalTodoRows || [])
        .filter((item) => getTableNameByDbTable(item.source_table) === source)
        .map(normalizeModalTodoRow);

      if (sourceRow && sourceRow !== 'Alla') {
        if (sourceRow === 'Privat') {
          const currentUser = getCurrentUserInitials();
          rows = rows.filter((row) => String(row.created_by || '') === currentUser);
        } else {
          rows = rows.filter((row) => String(row.__source_row_name || '') === sourceRow);
        }
      }

      return rows;
    }

    const rows = state.rowsByTable[tableName] || [];

    return rows.filter((row) =>
      Object.entries(filters).every(([field, value]) => {
        if (field === '__todo_source' || field === '__todo_source_row') return true;
        if (!value || value === 'Alla') return true;
        return String(row[field] ?? '') === value;
      })
    );
  }

  function isEditableTextColumn(column) {
    return column.type === 'text' && !isOpenColumn(column);
  }

  function isEditableDropdownColumn(column) {
    const dropdown = APP_CONFIG.dropdowns?.[column.type];
    return !!dropdown?.options?.length && !isOpenColumn(column);
  }

  function getCellKey(row, column) {
    if (!row || !row.id) return null;
    return `${row.id}::${column.field}`;
  }

  function startEditing(row, column) {
    const key = getCellKey(row, column);
    if (!key) return;
    state.editingCell = key;
    render();
  }

  function openDetailPanel(row) {
    if (!row?.id) return;
    state.linksPanelOpen = false;
    state.detailRowId = row.id;
    state.editingCell = null;
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    state.settingsPanelOpen = false;
    render();
  }

  function closeDetailPanel() {
    state.detailRowId = null;
    state.newRowDraft = null;
    render();
  }

  async function saveNewRow(tableName, tableConfig, draftRow) {
    if (!draftRow) return;

    state.savingCell = '__new_row__';
    render();

    const payload = {};
    tableConfig.columns.forEach((column) => {
      if (column.field === 'id') return;
      let value = draftRow[column.field];
      if (column.type === 'status') value = normalizeStatusValue(value);
      if (column.type === 'pdf') value = '';
      payload[column.field] = value;
    });
    payload.is_done = !!draftRow.is_done;

    const { data, error } = await supabase
      .from(tableConfig.dbTable)
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      state.savingCell = null;
      alert(`Kunde inte skapa ny rad i ${tableConfig.dbTable}: ${error.message}`);
      render();
      return;
    }

    let finalRow = normalizeRow(tableName, tableConfig, data);

    try {
      const pdfColumns = tableConfig.columns.filter((column) => isPdfColumn(column));
      for (const column of pdfColumns) {
        const draftFile = getDraftPdfFile(draftRow, column.field);
        if (!draftFile) continue;

        const storagePath = await uploadPdfFile(draftFile);
        const { error: updateError } = await supabase
          .from(tableConfig.dbTable)
          .update({ [column.field]: storagePath })
          .eq('id', data.id);

        if (updateError) {
          throw new Error(updateError.message || 'Kunde inte koppla PDF till raden.');
        }

        finalRow[column.field] = storagePath;
      }
    } catch (err) {
      state.savingCell = null;
      alert(`Raden skapades, men PDF kunde inte hanteras: ${err.message}`);
      state.rowsByTable[tableName] = [finalRow, ...(state.rowsByTable[tableName] || [])];
      state.newRowDraft = null;
      state.detailRowId = finalRow.id || null;
      render();
      return;
    }

    state.savingCell = null;
    state.rowsByTable[tableName] = [finalRow, ...(state.rowsByTable[tableName] || [])];
    state.newRowDraft = null;
    state.detailRowId = finalRow.id || null;
    render();
  }

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
      await loadTableRows('UTVECKLING', utvecklingEntry[1]);
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
      await loadTableRows('SÄLJINTRO', saljintroEntry[1]);
    }

    if (state.archivePanelOpen) {
      void loadArchiveRows(tableName);
    } else {
      render();
    }
  }

  async function completeTodoRow(tableName, tableConfig, row) {
    const key = getCellKey(row, UI_OPEN_COLUMN);
    state.savingCell = key;
    render();

    const { data, error } = await supabase.rpc('planning_complete_todo_row', {
      p_row_id: row.id,
    });

    state.savingCell = null;

    if (error) {
      alert(`Kunde inte markera raden som klar: ${error.message}`);
      render();
      return;
    }

    const normalizedData = normalizeRow(tableName, tableConfig, data);
    state.rowsByTable[tableName] = (state.rowsByTable[tableName] || []).map((item) =>
      item.id === row.id ? normalizedData : item
    );

    render();
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

  async function saveCellValue(tableConfig, row, column, nextValue) {
    const key = getCellKey(row, column);
    if (!key || !row.id) {
      state.editingCell = null;
      render();
      return false;
    }

    let normalizedNextValue = nextValue;
    if (column.type === 'status') normalizedNextValue = normalizeStatusValue(nextValue);
    if (column.type === 'pdf') normalizedNextValue = normalizePdfPath(nextValue);

    const currentValue = row[column.field] ?? '';
    if (String(currentValue) === String(normalizedNextValue)) {
      state.editingCell = null;
      render();
      return true;
    }

    state.savingCell = key;
    row[column.field] = normalizedNextValue;
    render();

    const { error } = await supabase
      .from(tableConfig.dbTable)
      .update({ [column.field]: normalizedNextValue })
      .eq('id', row.id);

    state.savingCell = null;
    state.editingCell = null;

    if (error) {
      alert(`Kunde inte spara ${column.name}: ${error.message}`);
      row[column.field] = currentValue;
      render();
      return false;
    }

    render();
    return true;
  }

  async function toggleStatusCell(tableConfig, row, column) {
    const current = normalizeStatusValue(row[column.field]);
    const currentIndex = STATUS_ORDER.indexOf(current);
    const nextValue = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length];
    await saveCellValue(tableConfig, row, column, nextValue);
  }

  function getStatusLabel(column) {
    return column.statusLabel || column.name || 'Status';
  }

  function getStatusClass(value) {
    return `status-button status-button--${normalizeStatusValue(value)}`;
  }


  function createStatusButton(column, value, isDetail = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${getStatusClass(value)}${isDetail ? ' status-button--detail' : ''}`;
    button.setAttribute('aria-label', `${column.name}: ${getStatusLabel(column)} (${normalizeStatusValue(value)})`);

    const dot = document.createElement('span');
    dot.className = 'status-button__dot';
    dot.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'status-button__label';
    label.textContent = getStatusLabel(column);

    button.appendChild(dot);
    button.appendChild(label);
    return button;
  }

  async function openPdfDocument(value) {
    const objectPath = normalizePdfPath(value);
    if (!objectPath) {
      alert('Dokumentväg saknas.');
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from(PDF_BUCKET)
        .createSignedUrl(objectPath, 60);

      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener');
        return;
      }
    } catch (err) {
      console.warn('Signed URL failed:', err);
    }

    const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(objectPath);
    if (data?.publicUrl) {
      window.open(data.publicUrl, '_blank', 'noopener');
      return;
    }

    alert('Kunde inte öppna PDF-dokumentet.');
  }

  async function replacePdfForExistingRow(tableConfig, row, column, file) {
    if (!isPdfFile(file)) {
      alert('Välj en PDF-fil.');
      return;
    }

    const key = getCellKey(row, column) || '__pdf__';
    const oldPath = normalizePdfPath(row[column.field]);

    state.savingCell = key;
    render();

    try {
      const newPath = await uploadPdfFile(file);

      const { error: updateError } = await supabase
        .from(tableConfig.dbTable)
        .update({ [column.field]: newPath })
        .eq('id', row.id);

      if (updateError) {
        throw new Error(updateError.message || 'Kunde inte spara PDF på raden.');
      }

      row[column.field] = newPath;

      if (oldPath && oldPath !== newPath) {
        try {
          await removePdfFromStorage(oldPath);
        } catch (cleanupError) {
          console.warn('Old PDF cleanup failed:', cleanupError);
        }
      }
    } catch (err) {
      alert(`Kunde inte ladda upp PDF: ${err.message}`);
    } finally {
      state.savingCell = null;
      render();
    }
  }

  async function removePdfForExistingRow(tableConfig, row, column) {
    const oldPath = normalizePdfPath(row[column.field]);
    if (!oldPath) return;

    const confirmed = window.confirm('Ta bort PDF från raden?');
    if (!confirmed) return;

    const key = getCellKey(row, column) || '__pdf__';
    state.savingCell = key;
    render();

    try {
      await removePdfFromStorage(oldPath);

      const { error } = await supabase
        .from(tableConfig.dbTable)
        .update({ [column.field]: '' })
        .eq('id', row.id);

      if (error) {
        throw new Error(error.message || 'Kunde inte uppdatera raden efter borttag.');
      }

      row[column.field] = '';
    } catch (err) {
      alert(`Kunde inte ta bort PDF: ${err.message}`);
    } finally {
      state.savingCell = null;
      render();
    }
  }

  function createStaticCellContent(row, column) {
    if (isOpenColumn(column)) {
      return createOpenButton(row);
    }

    const rawValue = row[column.field];
    const text = rawValue === undefined || rawValue === null ? '' : String(rawValue);

    if (isStatusColumn(column)) {
      return createStatusButton(column, text, false);
    }

    if (isPdfColumn(column)) {
      const displayName = getPdfDisplayName(text);
      if (!displayName) {
        const span = document.createElement('span');
        span.className = 'cell-text cell-text--muted';
        span.textContent = '—';
        return span;
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rutiner-pdf-link';
      button.textContent = displayName;
      button.title = `Öppna ${displayName}`;
      button.setAttribute('aria-label', `Öppna PDF: ${displayName}`);
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await openPdfDocument(text);
      });
      return button;
    }

    if (column.type === 'veckonummer') {
      const chip = document.createElement('span');
      chip.className = 'cell-chip';
      chip.textContent = formatWeekValue(text);
      return chip;
    }

    if (column.type === 'kvartal') {
      const chip = document.createElement('span');
      chip.className = 'cell-chip';
      chip.textContent = formatQuarterValue(text);
      return chip;
    }

    if (column.type === 'date') {
      const span = document.createElement('span');
      const formatted = formatDateValue(text);
      span.className = formatted !== '—' ? 'cell-text' : 'cell-text cell-text--muted';
      span.textContent = formatted;
      return span;
    }

    if (isEditableDropdownColumn(column)) {
      const chip = document.createElement('span');
      chip.className = 'cell-chip';
      chip.textContent = text || '—';
      return chip;
    }

    const span = document.createElement('span');
    span.className = text ? 'cell-text' : 'cell-text cell-text--muted';
    span.textContent = text || '—';
    return span;
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


  function createOpenButton(row) {
    const wrap = document.createElement('div');
    wrap.className = 'row-actions';

    if (isVirtualModalTodoRow(row)) {
      return wrap;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'row-actions__button';
    button.textContent = 'Öppna';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openDetailPanel(row);
    });

    wrap.appendChild(button);
    return wrap;
  }

  function createEditableTextControl(tableConfig, row, column) {
    const input = document.createElement('input');
    input.className = 'cell-editor';
    input.type = 'text';
    input.value = row[column.field] ?? '';

    const commit = async () => {
      await saveCellValue(tableConfig, row, column, input.value);
    };

    input.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        await commit();
      } else if (event.key === 'Escape') {
        state.editingCell = null;
        render();
      }
    });

    input.addEventListener('blur', commit);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    return input;
  }

  function createEditableDropdownControl(tableConfig, row, column) {
    const dropdown = APP_CONFIG.dropdowns?.[column.type];
    const select = document.createElement('select');
    select.className = 'cell-editor cell-editor--select';

    dropdown.options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = option;
      if (String(row[column.field] ?? '') === option) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    const commit = async () => {
      await saveCellValue(tableConfig, row, column, select.value);
    };

    select.addEventListener('change', commit);
    select.addEventListener('blur', () => {
      if (state.editingCell) {
        state.editingCell = null;
        render();
      }
    });
    select.addEventListener('keydown', async (event) => {
      if (event.key === 'Escape') {
        state.editingCell = null;
        render();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        await commit();
      }
    });

    setTimeout(() => select.focus(), 0);
    return select;
  }

  function getDetailInputType(column) {
    if (column.type === 'date') return 'date';
    return 'text';
  }

  function createPdfDetailField(tableConfig, row, column, options = {}) {
    const isDraft = !!options.isDraft;
    const field = document.createElement('div');
    field.className = 'detail-field detail-field--pdf';

    const label = document.createElement('span');
    label.className = 'detail-field__label';
    label.textContent = column.name;

    const wrap = document.createElement('div');
    wrap.className = 'rutiner-pdf-field';

    const info = document.createElement('div');
    info.className = 'rutiner-pdf-field__info';

    const draftFile = isDraft ? getDraftPdfFile(row, column.field) : null;
    const displayName = draftFile ? stripCommonStoragePrefix(draftFile.name) : getPdfDisplayName(row[column.field]);

    const name = document.createElement('div');
    name.className = displayName ? 'rutiner-pdf-field__name' : 'rutiner-pdf-field__name rutiner-pdf-field__name--empty';
    name.textContent = displayName || 'Ingen PDF vald';

    const helper = document.createElement('div');
    helper.className = 'rutiner-pdf-field__helper';
    helper.textContent = displayName
      ? 'Du kan öppna, byta eller ta bort dokumentet här.'
      : 'Ladda upp en PDF för denna rutin.';

    info.appendChild(name);
    info.appendChild(helper);

    const actions = document.createElement('div');
    actions.className = 'rutiner-pdf-field__actions';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/pdf,.pdf';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      if (!isPdfFile(file)) {
        alert('Välj en PDF-fil.');
        fileInput.value = '';
        return;
      }

      if (isDraft) {
        setDraftPdfFile(row, column.field, file);
        render();
      } else {
        await replacePdfForExistingRow(tableConfig, row, column, file);
      }

      fileInput.value = '';
    });

    const uploadButton = document.createElement('button');
    uploadButton.type = 'button';
    uploadButton.className = 'secondary-button';
    uploadButton.textContent = displayName ? 'Byt PDF' : 'Ladda upp PDF';
    uploadButton.addEventListener('click', () => fileInput.click());
    actions.appendChild(uploadButton);

    if (displayName) {
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'secondary-button';
      openButton.textContent = 'Öppna PDF';
      openButton.addEventListener('click', async () => {
        if (isDraft) return;
        await openPdfDocument(row[column.field]);
      });
      actions.appendChild(openButton);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'secondary-button secondary-button--danger';
      removeButton.textContent = 'Ta bort PDF';
      removeButton.addEventListener('click', async () => {
        if (isDraft) {
          setDraftPdfFile(row, column.field, null);
          row[column.field] = '';
          render();
          return;
        }
        await removePdfForExistingRow(tableConfig, row, column);
      });
      actions.appendChild(removeButton);
    }

    wrap.appendChild(info);
    wrap.appendChild(actions);
    wrap.appendChild(fileInput);

    field.appendChild(label);
    field.appendChild(wrap);
    return field;
  }

  function createDetailField(tableConfig, row, column, options = {}) {
    const isDraft = !!options.isDraft;

    if (isPdfColumn(column)) {
      return createPdfDetailField(tableConfig, row, column, { isDraft });
    }

    const field = document.createElement('label');
    field.className = 'detail-field';

    const label = document.createElement('span');
    label.className = 'detail-field__label';
    label.textContent = column.name;

    let control;
    const dropdown = APP_CONFIG.dropdowns?.[column.type];

    if (isStatusColumn(column)) {
      control = createStatusButton(column, row[column.field], true);

      control.addEventListener('click', async () => {
        const current = normalizeStatusValue(row[column.field]);
        const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length];
        row[column.field] = next;

        if (isDraft) {
          render();
          return;
        }

        await saveCellValue(tableConfig, row, column, next);
      });
    } else if (column.type === 'veckonummer') {
      control = document.createElement('select');
      control.className = 'detail-field__control';
      ['--', ...Array.from({ length: 53 }, (_, index) => `v${String(index + 1).padStart(2, '0')}`)].forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (formatWeekValue(row[column.field]) === option) {
          opt.selected = true;
        }
        control.appendChild(opt);
      });
    } else if (column.type === 'kvartal') {
      control = document.createElement('select');
      control.className = 'detail-field__control';
      ['--', 'Q1', 'Q2', 'Q3', 'Q4'].forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (formatQuarterValue(row[column.field]) === option) {
          opt.selected = true;
        }
        control.appendChild(opt);
      });
    } else if (dropdown?.options?.length) {
      control = document.createElement('select');
      control.className = 'detail-field__control';
      dropdown.options.forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = option;
        if (String(row[column.field] ?? '') === option) {
          opt.selected = true;
        }
        control.appendChild(opt);
      });
    } else {
      control = document.createElement('input');
      control.className = 'detail-field__control';
      control.type = getDetailInputType(column);
      control.value = column.type === 'date' ? String(row[column.field] || '').trim() : row[column.field] ?? '';
    }

    const getNextValue = () => {
      if (column.type === 'veckonummer') return formatWeekValue(control.value);
      if (column.type === 'kvartal') return formatQuarterValue(control.value);
      return control.value;
    };

    if (!isStatusColumn(column)) {
      if (isDraft) {
        const syncDraftValue = () => {
          row[column.field] = getNextValue();
        };

        if (control.tagName === 'INPUT') {
          control.addEventListener('input', syncDraftValue);
        }
        control.addEventListener('change', syncDraftValue);
      } else {
        control.addEventListener('change', async () => {
          await saveCellValue(tableConfig, row, column, getNextValue());
        });
      }
    }

    field.appendChild(label);
    field.appendChild(control);
    return field;
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
    if (tableName === 'TODO') {
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
      await completeTodoRow(tableName, tableConfig, row);
      return;
    }
    if (actionName === 'delete') {
      await deleteRow(tableConfig, row);
    }
  }

  function getArchiveTitleField(tableName) {
    if (tableName === 'PRE DEV') return 'utv_ide';
    if (tableName === 'UTVECKLING') return 'produktide';
    if (tableName === 'SÄLJINTRO') return 'produkt';
    if (tableName === 'TODO') return 'beskrivning';
    return '';
  }

  function getArchiveTransitionText(item) {
    const targetTable = item.transition_target_table || '';
    const targetRowId = item.transition_target_row_id;
    if (!targetTable) return '';
    return `Skapade ny rad i ${targetTable}${targetRowId ? ` (#${targetRowId})` : ''}`;
  }

  function createArchivePanel() {
    const tableName = state.activeTableName;
    const rows = state.archiveRowsByTable[tableName] || [];
    const titleField = getArchiveTitleField(tableName);

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeArchivePanel();
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    heading.innerHTML = `
      <p class="side-panel__eyebrow">${tableName}</p>
      <h2 class="side-panel__title">Arkiv</h2>
      <p class="side-panel__text">Arkiverade rader för aktuell tabell.</p>
    `;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close';
    closeButton.textContent = 'Stäng';
    closeButton.addEventListener('click', closeArchivePanel);

    header.appendChild(heading);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    if (state.archiveLoading) {
      const loading = document.createElement('p');
      loading.className = 'empty-state';
      loading.textContent = 'Laddar arkiv...';
      body.appendChild(loading);
    } else if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Inga arkiverade rader.';
      body.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'detail-grid';

      rows.forEach((item) => {
        const card = document.createElement('section');
        card.className = 'detail-card';

        const payload = item.payload_json || {};
        const title = document.createElement('h3');
        title.className = 'detail-card__title';
        title.textContent = payload[titleField] || 'Arkiverad rad';

        const archived = document.createElement('p');
        archived.className = 'detail-card__text';
        archived.textContent = `Arkiverad: ${formatDateTimeValue(item.archived_at)}`;

        const reason = document.createElement('p');
        reason.className = 'detail-card__text';
        reason.textContent = `Typ: ${item.archive_reason || 'archived'}`;

        card.appendChild(title);
        card.appendChild(archived);
        card.appendChild(reason);

        const transitionText = getArchiveTransitionText(item);
        if (transitionText) {
          const transition = document.createElement('p');
          transition.className = 'detail-card__text';
          transition.textContent = transitionText;
          card.appendChild(transition);
        }

        if (tableName === 'TODO' && item.week_key) {
          const week = document.createElement('p');
          week.className = 'detail-card__text';
          week.textContent = `Vecka: ${item.week_key}`;
          card.appendChild(week);
        }

        list.appendChild(card);
      });

      body.appendChild(list);
    }

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    return overlay;
  }



  function createSettingsPanel() {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeSettingsPanel();
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
          title: 'Match kolumn + dok',
          subtitle: 'Öppna dokumentkopplingar',
          onClick: openSettingsDocumentLinks,
          disabled: false,
          adminOnly: true,
        }));

        menu.appendChild(createCard({
          title: 'Manage Users',
          subtitle: 'To be continued',
          onClick: () => alert('Manage Users — To be continued'),
          disabled: false,
          adminOnly: true,
        }));

        menu.appendChild(createCard({
          title: 'Manage Links',
          subtitle: 'Hantera länkar',
          onClick: openSettingsLinks,
          disabled: false,
          adminOnly: true,
        }));
      }

      menu.appendChild(createCard({
        title: 'Logout',
        subtitle: 'Logga ut från appen',
        onClick: async () => {
          const { signOutUser } = await import('./auth.js?v=5');
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

      if (state.settingsView === 'links') {
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

  function createNotesPanel() {
    const tableName = state.activeTableName;
    const row = getCurrentNotesRow();
    const rowKey = row ? getNotesRowKey(tableName, row.id) : '';
    const notes = state.notesRowsByKey[rowKey] || [];
    const titleField = getRowTitleField(tableName);
    const rowTitle = row ? (row[titleField] || 'Rad') : 'Rad';

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeNotesPanel();
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog notes-panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    heading.className = 'todo-modal__heading';
    heading.innerHTML = `
      <p class="side-panel__eyebrow">${tableName}</p>
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


  function createDetailPanel(tableName, tableConfig, row, options = {}) {
    const isDraft = !!options.isDraft;

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeDetailPanel();
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    heading.innerHTML = `
      <p class="side-panel__eyebrow">${tableName}</p>
      <h2 class="side-panel__title">${isDraft ? 'Ny rad' : 'Radöversikt'}</h2>
      <p class="side-panel__text">${isDraft ? 'Fyll i fälten nedan och välj Spara eller Avbryt.' : 'Redigera fälten nedan eller välj åtgärd.'}</p>
    `;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close';
    closeButton.textContent = isDraft ? 'Avbryt' : 'Stäng';
    closeButton.addEventListener('click', closeDetailPanel);

    header.appendChild(heading);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    const grid = document.createElement('div');
    grid.className = 'detail-grid';

    tableConfig.columns
      .filter((column) => column.field !== 'id')
      .forEach((column) => {
        grid.appendChild(createDetailField(tableConfig, row, column, { isDraft }));
      });

    body.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'side-panel__footer';

    if (isDraft) {
      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'primary-button';
      saveButton.textContent = state.savingCell === '__new_row__' ? 'Sparar...' : 'Spara';
      saveButton.disabled = state.savingCell === '__new_row__';
      saveButton.addEventListener('click', async () => {
        await saveNewRow(tableName, tableConfig, row);
      });

      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'secondary-button';
      cancelButton.textContent = 'Avbryt';
      cancelButton.addEventListener('click', closeDetailPanel);

      footer.appendChild(saveButton);
      footer.appendChild(cancelButton);
    } else {
      const actions = getActionConfig(tableName);

      if (actions.primary) {
        const primaryButton = document.createElement('button');
        primaryButton.type = 'button';
        primaryButton.className = 'primary-button';
        primaryButton.textContent = actions.primary.label;
        primaryButton.addEventListener('click', async () => {
          await runRowAction(tableName, tableConfig, row, actions.primary.action);
        });
        footer.appendChild(primaryButton);
      }

      if (actions.secondary) {
        const secondaryButton = document.createElement('button');
        secondaryButton.type = 'button';
        secondaryButton.className = 'secondary-button';
        secondaryButton.textContent = actions.secondary.label;
        secondaryButton.addEventListener('click', async () => {
          await runRowAction(tableName, tableConfig, row, actions.secondary.action);
        });
        footer.appendChild(secondaryButton);
      }

      if (actions.danger) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'secondary-button secondary-button--danger';
        deleteButton.textContent = actions.danger.label;
        deleteButton.addEventListener('click', async () => {
          await runRowAction(tableName, tableConfig, row, actions.danger.action);
        });
        footer.appendChild(deleteButton);
      }
    }

    dialog.appendChild(header);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    return overlay;
  }

  function createTable(tableName, tableConfig) {
    const rows = getFilteredRows(tableName, tableConfig);
    const visibleColumns = getVisibleColumns(tableConfig);

    const shell = document.createElement('section');
    shell.className = 'view-card';

    const header = document.createElement('div');
    header.className = 'view-card__header';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'view-card__title-block';

    const title = document.createElement('h1');
    title.className = 'view-card__title';
    title.textContent = tableConfig.title;

    const subtitle = document.createElement('p');
    subtitle.className = 'view-card__subtitle';
    subtitle.textContent = `${rows.length} rader`;

    titleBlock.appendChild(title);
    titleBlock.appendChild(subtitle);
    header.appendChild(titleBlock);
    header.appendChild(createTopActions(tableName, tableConfig));

    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';

    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');

    visibleColumns.forEach((column) => {
      const th = document.createElement('th');
      if (column.width) th.style.width = column.width;
      if (getAlignment(column) === 'center') th.classList.add('is-center');
      if (isStatusColumn(column)) th.classList.add('status-column');

      const headerInner = document.createElement('div');
      headerInner.className = 'column-header';

      const label = document.createElement('span');
      label.className = 'column-header__label';
      label.textContent = column.name;
      headerInner.appendChild(label);

      if (!isOpenColumn(column) && !isNotesColumn(column) && !isTodoColumn(column)) {
        const badge = createDocumentBadge(tableName, column);
        if (badge) {
          headerInner.appendChild(badge);
        }
      }

      th.appendChild(headerInner);
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');

    rows.forEach((row) => {
      const tr = document.createElement('tr');

      if (tableName === TODO_TABLE && row.is_done) {
        tr.classList.add('is-done');
      }

      visibleColumns.forEach((column) => {
        const td = document.createElement('td');

        if (getAlignment(column) === 'center') td.classList.add('is-center');
        if (isStatusColumn(column)) td.classList.add('status-cell');

        if (isOpenColumn(column)) {
          td.appendChild(createOpenButton(row));
          tr.appendChild(td);
          return;
        }

        if (isNotesColumn(column)) {
          td.appendChild(createNotesButton(row));
          tr.appendChild(td);
          return;
        }

        if (isTodoColumn(column)) {
          td.appendChild(createTodoButton(row));
          tr.appendChild(td);
          return;
        }

        const cellKey = getCellKey(row, column);
        const isEditing = state.editingCell === cellKey;
        const isSaving = state.savingCell === cellKey;
        const isReadonlyRow = isVirtualModalTodoRow(row);
        const editableText = isEditableTextColumn(column) && !!row.id && !row.is_done && !isReadonlyRow;
        const editableDropdown = isEditableDropdownColumn(column) && !!row.id && !row.is_done && !isReadonlyRow;
        const statusToggle = isStatusColumn(column) && !!row.id && !row.is_done && !isReadonlyRow;
        const editable = editableText || editableDropdown || statusToggle;

        if (editable) td.classList.add('is-editable');
        if (isEditing) td.classList.add('is-editing');
        if (isSaving) td.classList.add('is-saving');

        if (isEditing && editableText) {
          td.appendChild(createEditableTextControl(tableConfig, row, column));
        } else if (isEditing && editableDropdown) {
          td.appendChild(createEditableDropdownControl(tableConfig, row, column));
        } else {
          td.appendChild(createStaticCellContent(row, column));
          if (statusToggle) {
            const statusButton = td.querySelector('.status-button');
            const toggleHandler = async (event) => {
              event.preventDefault();
              event.stopPropagation();
              await toggleStatusCell(tableConfig, row, column);
            };

            if (statusButton) {
              statusButton.addEventListener('click', toggleHandler);
            } else {
              td.addEventListener('click', toggleHandler);
            }
          } else if (editableText || editableDropdown) {
            td.addEventListener('click', () => startEditing(row, column));
          }
        }

        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = visibleColumns.length;
      td.className = 'empty-row';
      td.textContent = 'Inga rader';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);

    shell.appendChild(header);
    shell.appendChild(createFilterBar(tableName, tableConfig));
    shell.appendChild(tableWrap);

    return shell;
  }

  settingsButton?.addEventListener('click', () => {
    openSettingsMenu();
  });

  async function render() {
    const active = getActiveConfig();
    if (!active) return;

    const [tableName, tableConfig] = active;
    if (settingsButton && !settingsButton.dataset.boundSettings) {
    settingsButton.dataset.boundSettings = 'true';
    settingsButton.addEventListener('click', openSettingsMenu);
  }

  ensureLinksButton();
    createNav();
    app.innerHTML = '';

    app.appendChild(createTable(tableName, tableConfig));

    const draftRow = getCurrentDraftRow();
    const row = getCurrentDetailRow();

    if (state.settingsPanelOpen) {
      app.appendChild(createSettingsPanel());
    } else if (state.linksPanelOpen) {
      app.appendChild(createLinksPanel());
    } else if (state.archivePanelOpen && tableName !== 'RUTINER') {
      app.appendChild(createArchivePanel());
    } else if (state.rowTodoPanelOpen) {
      app.appendChild(createRowTodoPanel());
    } else if (state.notesPanelOpen) {
      app.appendChild(createNotesPanel());
    } else if (draftRow) {
      app.appendChild(createDetailPanel(tableName, tableConfig, draftRow, { isDraft: true }));
    } else if (row) {
      app.appendChild(createDetailPanel(tableName, tableConfig, row));
    }
  }

  await Promise.all(
    tableEntries.map(([tableName, tableConfig]) => loadTableRows(tableName, tableConfig))
  );
  await loadDocumentLinks();
  await loadLinks();
  await loadModalTodoRows();
  if (state.activeTableName) {
    await loadUnreadCountsForTable(state.activeTableName);
  }

  render();
})();
