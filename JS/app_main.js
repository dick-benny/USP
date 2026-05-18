import { supabase } from './supabase.js';
import {
  UI_OPEN_COLUMN,
  UI_NOTES_COLUMN,
  UI_TODO_COLUMN,
  STATUS_ORDER,
  TODO_TABLE,
  OWNER_TABLES,
  PDF_BUCKET,
  PDF_PREFIX,
} from './app_constants.js?v=95';
import { createTodoController } from './app_todo.js?v=95';
import { createMessagesController } from './app_messages.js?v=95';
import { createRenderController } from './app_render.js?v=95';
import { createDataController } from './app_data.js?v=95';
import { createActionController } from './app_actions.js?v=95';

export async function runPlanningApp() {
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
  const placeholderEntries = [
    ['CDM PROJECTS', { id: 'cdm_projects', title: 'CDM PROJECTS', placeholder: true }],
  ];

  const digProdIndex = tableEntries.findIndex(([tableName]) => tableName === 'DIG PROD');
  const digProdEntry = digProdIndex >= 0 ? tableEntries.splice(digProdIndex, 1)[0] : null;
  const cdmProjectsIndex = tableEntries.findIndex(([tableName]) => tableName === 'CDM PROJECTS');
  const cdmProjectsEntry = cdmProjectsIndex >= 0 ? tableEntries.splice(cdmProjectsIndex, 1)[0] : null;
  const marknadIndex = tableEntries.findIndex(([tableName]) => tableName === 'MARKNAD');
  const marknadEntry = marknadIndex >= 0 ? tableEntries.splice(marknadIndex, 1)[0] : null;
  const saljIndex = tableEntries.findIndex(([tableName]) => tableName === 'SÄLJ');
  const saljEntry = saljIndex >= 0 ? tableEntries.splice(saljIndex, 1)[0] : null;
  const inkopIndex = tableEntries.findIndex(([tableName]) => tableName === 'INKÖP');
  const inkopEntry = inkopIndex >= 0 ? tableEntries.splice(inkopIndex, 1)[0] : null;  const entriesAfterProjekt = [
    ...(digProdEntry ? [digProdEntry] : []),
    ...(marknadEntry ? [marknadEntry] : []),
    ...(saljEntry ? [saljEntry] : []),
    ...(inkopEntry ? [inkopEntry] : []),
    ...placeholderEntries,
  ];

  const insertIndex = tableEntries.findIndex(
    ([tableName]) => tableName === 'SÄLJINTRO'
  );

  const orderedEntries = [
    ...(digProdEntry ? [digProdEntry] : []),
    ...(cdmProjectsEntry ? [cdmProjectsEntry] : []),
    ...(inkopEntry ? [inkopEntry] : []),
    ...(marknadEntry ? [marknadEntry] : []),
    ...(saljEntry ? [saljEntry] : []),
  ];

  if (insertIndex >= 0) {
    tableEntries.splice(insertIndex + 1, 0, ...orderedEntries);
  } else {
    tableEntries.push(...orderedEntries);
  }

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
    columnChecklistsByTable: {},
    columnChecklistPanelOpen: false,
    columnChecklistActive: null,
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
      checklistId: '',
      checklistTableName: '',
      checklistColumnField: '',
      checklistTitle: '',
      checklistBody: '',
      checklistSortOrder: '100',
      checklistIsActive: true,
    },
    documentLinksList: [],
    columnChecklistsList: [],
    linksList: [],
    linksPanelOpen: false,
    messagesPanelOpen: false,
    messagesPanelMode: 'inbox',
    messagesList: null,
    messageComposeDraft: null,
    modalTodoRows: [],
    planningUsers: [],
  };


  const dataController = createDataController({ APP_CONFIG, SAMPLE_ROWS });
  const {
    getDefaultValue,
    normalizeStatusValue,
    normalizePdfPath,
    stripCommonStoragePrefix,
    getPdfFileName,
    getPdfDisplayName,
    normalizeRow,
    loadTableRows: loadTableRowsFromData,
  } = dataController;

  const todoController = createTodoController({
    supabase,
    state,
    APP_CONFIG,
    TODO_TABLE,
    UI_OPEN_COLUMN,
    getCellKey,
    isVirtualModalTodoRow,
    normalizeRow,
    render,
  });
  const { archiveCompletedTodosFromPreviousWeeks, toggleTodoDone } = todoController;

  const actionController = createActionController({
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
  });
  const { getActionConfig, runRowAction } = actionController;

  async function navigateToMessageSource(item) {
    const tableName = String(item?.sourceTable || '').trim();
    const rowId = String(item?.sourceRowId || '').trim();

    if (!tableName || !rowId) {
      alert('Radkoppling saknas.');
      return;
    }

    const tableConfig = APP_CONFIG.tables?.[tableName];
    if (!tableConfig?.dbTable) {
      alert(`Kunde inte hitta vyn ${tableName}.`);
      return;
    }

    let row = getRowById(tableName, rowId);
    if (!row) {
      try {
        await loadTableRowsFromData(state, tableName, tableConfig);
        row = getRowById(tableName, rowId);
      } catch (err) {
        console.warn('Could not reload source table for message navigation:', err.message);
      }
    }

    if (!row) {
      alert('Kunde inte hitta kopplad rad.');
      return;
    }

    state.activeTableName = tableName;
    state.detailRowId = row.id;
    state.messagesPanelOpen = false;
    state.linksPanelOpen = false;
    state.settingsPanelOpen = false;
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    state.columnChecklistPanelOpen = false;
    state.columnChecklistActive = null;
    state.newRowDraft = null;
    state.editingCell = null;

    render();
  }

  const messagesController = createMessagesController({
    supabase,
    state,
    getCurrentUserInitials,
    getCurrentUserId,
    getRowTitleField,
    navigateToMessageSource,
    render,
  });
  const {
    ensureMessagesButton,
    createMessagesPanel,
    createMessageButtonForRow,
    loadMessages,
  } = messagesController;

  function getActiveConfig() {
    return tableEntries.find(([tableName]) => tableName === state.activeTableName) || null;
  }

  function getTodoSourceOptions() {
    return [TODO_TABLE, 'PRE DEV', 'UTVECKLING', 'SÄLJINTRO'];
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

  function getSaljintroProductOptions() {
    const rows = state.rowsByTable['SÄLJINTRO'] || [];
    const products = rows
      .map((row) => String(row?.produkt || '').trim())
      .filter(Boolean);

    return ['Alla', ...Array.from(new Set(products)).sort((a, b) => a.localeCompare(b, 'sv'))];
  }

  function getProjektProductFromName(projectName) {
    const value = String(projectName || '').trim();
    if (!value) return '';

    const autoProjectSuffixes = [' - Media', ' - B2B-ready', ' - Shopify-ready'];
    const suffix = autoProjectSuffixes.find((item) => value.endsWith(item));

    if (!suffix) return '';
    return value.slice(0, -suffix.length).trim();
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
      ...tableConfig.columns.filter((column) => column.field !== 'id' && !column.hiddenInTable),
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

  function isFileColumn(column) {
    return column?.type === 'pdf' || column?.type === 'excel';
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

  function normalizeColumnChecklists(rows) {
    const checklistsByTable = {};
    (rows || []).forEach((item) => {
      const tableName = String(item.table_name || '').trim();
      const columnField = String(item.column_field || '').trim();
      if (!tableName || !columnField || item.is_active === false) return;
      if (!checklistsByTable[tableName]) checklistsByTable[tableName] = {};
      checklistsByTable[tableName][columnField] = item;
    });
    return checklistsByTable;
  }

  async function loadColumnChecklists() {
    try {
      const { data, error } = await supabase
        .from('planning_column_checklists')
        .select('*')
        .order('table_name', { ascending: true })
        .order('column_field', { ascending: true })
        .order('sort_order', { ascending: true });

      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      state.columnChecklistsList = rows;
      state.columnChecklistsByTable = normalizeColumnChecklists(rows);
    } catch (err) {
      console.warn('Could not load column checklists:', err.message);
      state.columnChecklistsList = [];
      state.columnChecklistsByTable = {};
    }
  }

  function getColumnChecklistForColumn(tableName, column) {
    return state.columnChecklistsByTable?.[tableName]?.[column.field] || null;
  }

  function openColumnChecklist(tableName, column) {
    const checklist = getColumnChecklistForColumn(tableName, column);
    if (!checklist) return;

    state.columnChecklistPanelOpen = true;
    state.columnChecklistActive = {
      tableName,
      columnName: column.name,
      columnField: column.field,
      checklist,
    };
    state.linksPanelOpen = false;
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

  function closeColumnChecklistPanel() {
    state.columnChecklistPanelOpen = false;
    state.columnChecklistActive = null;
    render();
  }

  function createChecklistBadge(tableName, column) {
    const checklist = getColumnChecklistForColumn(tableName, column);
    if (!checklist) return null;

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'column-checklist-badge';
    badge.textContent = '✓';
    badge.title = String(checklist.title || 'Visa checklist').trim() || 'Visa checklist';
    badge.setAttribute('aria-label', `Visa checklist för ${column.name}`);
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openColumnChecklist(tableName, column);
    });

    return badge;
  }

  function getChecklistItems(body) {
    return String(body || '')
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function createColumnChecklistPanel() {
    const active = state.columnChecklistActive;
    const checklist = active?.checklist;
    if (!active || !checklist) return null;

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog checklist-panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    const title = String(checklist.title || active.columnName || 'Checklist').trim();
    heading.innerHTML = `
      <p class="side-panel__eyebrow">${active.tableName} · ${active.columnName}</p>
      <h2 class="side-panel__title">${title}</h2>
      <p class="side-panel__text">Checklist för kolumnen.</p>
    `;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close';
    closeButton.textContent = 'Stäng';
    closeButton.addEventListener('click', closeColumnChecklistPanel);

    header.appendChild(heading);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    const card = document.createElement('section');
    card.className = 'detail-card checklist-card';

    const items = getChecklistItems(checklist.body);
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'Checklistan saknar punkter ännu.';
      card.appendChild(empty);
    } else {
      const list = document.createElement('ul');
      list.className = 'checklist-list';

      items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'checklist-list__item';

        const mark = document.createElement('span');
        mark.className = 'checklist-list__mark';
        mark.textContent = '✓';

        const text = document.createElement('span');
        text.className = 'checklist-list__text';
        text.textContent = item;

        li.appendChild(mark);
        li.appendChild(text);
        list.appendChild(li);
      });

      card.appendChild(list);
    }

    body.appendChild(card);
    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    return overlay;
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


  function resetChecklistDraft() {
    state.settingsDraft.checklistId = '';
    state.settingsDraft.checklistTableName = '';
    state.settingsDraft.checklistColumnField = '';
    state.settingsDraft.checklistTitle = '';
    state.settingsDraft.checklistBody = '';
    state.settingsDraft.checklistSortOrder = '100';
    state.settingsDraft.checklistIsActive = true;
  }

  function editChecklistFromSettings(item) {
    state.settingsDraft.checklistId = String(item.id || '');
    state.settingsDraft.checklistTableName = String(item.table_name || '');
    state.settingsDraft.checklistColumnField = String(item.column_field || '');
    state.settingsDraft.checklistTitle = String(item.title || '');
    state.settingsDraft.checklistBody = String(item.body || '');
    state.settingsDraft.checklistSortOrder = String(item.sort_order ?? 100);
    state.settingsDraft.checklistIsActive = item.is_active !== false;
    render();
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
        const { error } = await supabase
          .from('planning_column_checklists')
          .update(payload)
          .eq('id', id);
        if (error) throw error;
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



  function createLinksPanel() {
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

  function isOwnerEnabledTable(tableName) {
    return OWNER_TABLES.includes(tableName);
  }

  function getOwnerInitials(row) {
    return String(row?.owner_initials || '').trim();
  }

  function getOwnerOptions(currentValue = '') {
    const values = (state.planningUsers || [])
      .map((user) => String(user.initials || '').trim())
      .filter(Boolean);

    const current = String(currentValue || '').trim();
    if (current) values.push(current);

    const own = getCurrentUserInitials();
    if (own) values.push(own);

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'sv'));
  }

  function getOwnerBadgeStyle(initials) {
    const value = String(initials || '').trim().toUpperCase();
    const palette = [
      ['#10233a', '#ffffff'],
      ['#7e8f62', '#ffffff'],
      ['#bb9257', '#ffffff'],
      ['#844f47', '#ffffff'],
      ['#1a5cff', '#ffffff'],
      ['#6f756e', '#ffffff'],
      ['#526b3b', '#ffffff'],
      ['#7c6841', '#ffffff'],
    ];

    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) % 997;
    }

    const [bg, fg] = palette[hash % palette.length];
    return { bg, fg };
  }

  function applyOwnerBadgeStyle(element, initials) {
    const { bg, fg } = getOwnerBadgeStyle(initials);
    element.style.setProperty('--owner-badge-bg', bg);
    element.style.setProperty('--owner-badge-fg', fg);
  }

  async function loadPlanningUsers() {
    const ownInitials = getCurrentUserInitials();

    const normalizeUsers = (rows) => {
      const users = (Array.isArray(rows) ? rows : [])
        .filter((user) => user?.is_active !== false)
        .map((user) => ({
          ...user,
          initials: String(user.initials || '').trim(),
        }))
        .filter((user) => user.initials);

      if (ownInitials && !users.some((user) => user.initials === ownInitials)) {
        users.push({ initials: ownInitials, is_active: true });
      }

      return users.sort((a, b) => a.initials.localeCompare(b.initials, 'sv'));
    };

    try {
      const { data, error } = await supabase.rpc('planning_get_active_user_initials');

      if (error) throw error;

      state.planningUsers = normalizeUsers(data);
      return;
    } catch (rpcErr) {
      console.warn('Could not load planning users via RPC:', rpcErr.message);
    }

    try {
      const { data, error } = await supabase
        .from('planning_users')
        .select('id, email, full_name, initials, role, is_active')
        .order('initials', { ascending: true });

      if (error) throw error;

      state.planningUsers = normalizeUsers(data);
    } catch (err) {
      console.warn('Could not load planning users:', err.message);
      state.planningUsers = ownInitials ? [{ initials: ownInitials }] : [];
    }
  }

  function shouldShowOwnerBadge(tableName, row, column) {
    return (
      isOwnerEnabledTable(tableName) &&
      !!row &&
      !isVirtualModalTodoRow(row) &&
      !!column?.key
    );
  }

  async function saveOwnerInitials(row, nextInitials) {
    const active = getActiveConfig();
    if (!active || !row?.id) return;

    const [tableName, tableConfig] = active;
    if (!isOwnerEnabledTable(tableName)) return;

    const next = String(nextInitials || '').trim();
    const previous = getOwnerInitials(row);

    if (next === previous) return;

    row.owner_initials = next;
    render();

    const { error } = await supabase
      .from(tableConfig.dbTable)
      .update({ owner_initials: next || null })
      .eq('id', row.id);

    if (error) {
      row.owner_initials = previous;
      alert(`Kunde inte ändra ansvarig: ${error.message}`);
      render();
    }
  }

  function createOwnerBadge(row) {
    const value = getOwnerInitials(row);
    const display = value || '—';

    if (isAdmin()) {
      const select = document.createElement('select');
      select.className = 'owner-badge owner-badge--select';
      select.title = 'Ändra ansvarig';

      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = '—';
      select.appendChild(emptyOption);

      getOwnerOptions(value).forEach((initials) => {
        const option = document.createElement('option');
        option.value = initials;
        option.textContent = initials;
        if (initials === value) option.selected = true;
        select.appendChild(option);
      });

      select.value = value;
      applyOwnerBadgeStyle(select, value);

      select.addEventListener('click', (event) => {
        event.stopPropagation();
      });

      select.addEventListener('change', async (event) => {
        event.stopPropagation();
        applyOwnerBadgeStyle(select, select.value);
        await saveOwnerInitials(row, select.value);
      });

      return select;
    }

    const badge = document.createElement('span');
    badge.className = 'owner-badge';
    badge.textContent = display;
    badge.title = value ? `Ansvarig: ${value}` : 'Ingen ansvarig';
    applyOwnerBadgeStyle(badge, value);
    return badge;
  }

  function createOwnerCellContent(row, column, contentNode) {
    const wrap = document.createElement('span');
    wrap.className = 'owner-cell';

    const badge = createOwnerBadge(row);
    const contentWrap = document.createElement('span');
    contentWrap.className = 'owner-cell__content';
    contentWrap.appendChild(contentNode);

    wrap.appendChild(badge);
    wrap.appendChild(contentWrap);
    return wrap;
  }

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

  function getRowTitleField(tableName) {
    if (tableName === 'PRE DEV') return 'utv_ide';
    if (tableName === 'UTVECKLING') return 'produktide';
    if (tableName === 'SÄLJINTRO') return 'produkt';
    if (tableName === 'DIG PROD') return 'produktnamn';
    if (tableName === 'CDM PROJECTS') return 'projektnamn';
    if (tableName === 'MARKNAD') return 'beskrivning';
    if (tableName === 'SÄLJ') return 'beskrivning';
    if (tableName === 'INKÖP') return 'beskrivning';
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

  function isExcelFile(file) {
    if (!file) return false;

    const name = String(file.name || '').toLowerCase().trim();
    const type = String(file.type || '').toLowerCase().trim();

    if (
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      name.endsWith('.xlsm') ||
      name.endsWith('.csv')
    ) {
      return true;
    }

    return (
      type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      type === 'application/vnd.ms-excel' ||
      type === 'application/vnd.ms-excel.sheet.macroenabled.12' ||
      type === 'text/csv' ||
      type === 'application/csv' ||
      type === 'text/plain' ||
      type === 'application/octet-stream'
    );
  }

  function isSupportedUploadFile(column, file) {
    if (!file) return false;
    if (column?.type === 'excel') return true;
    return isPdfFile(file);
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

  async function uploadPdfFile(file, column = null) {
    if (!isSupportedUploadFile(column, file)) {
      throw new Error('Endast PDF-filer stöds.');
    }

    const storagePath = buildPdfStoragePath(file);
    const { error } = await supabase.storage
      .from(PDF_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });

    if (error) {
      throw new Error(error.message || 'Kunde inte ladda upp filen.');
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
      throw new Error(error.message || 'Kunde inte ta bort Fil från storage.');
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

      state.filtersByTable[tableName] = filters;
    }
    return state.filtersByTable[tableName];
  }

  function ensureLinksButton() {
    // v93: Links are Settings-only. Remove any old topbar Links button if present.
    document.querySelectorAll('[data-links-button="true"], .links-button').forEach((button) => button.remove());
  }

  function createNav() {
    nav.innerHTML = '';

    tableEntries
      .filter(([tableName]) => tableName !== 'RUTINER')
      .forEach(([tableName]) => {
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
        state.messagesPanelOpen = false;
        state.columnChecklistPanelOpen = false;
        state.columnChecklistActive = null;

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

    if (tableName !== 'DIG PROD') {
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

        if (isOwnerEnabledTable(tableName)) {
          draft.owner_initials = getCurrentUserInitials();
        }

        if (tableName === 'MARKNAD' || tableName === 'SÄLJ' || tableName === 'INKÖP') {
          draft.klart_datum = new Date().toISOString().slice(0, 10);
        }

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
    }

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
    const rows = state.rowsByTable[tableName] || [];

    const currentInitials = getCurrentUserInitials();

    return rows.filter((row) => {
      if (
        tableName === 'TODO' &&
        String(row?.kategori || '') === 'Privat' &&
        String(row?.owner_initials || '').trim() !== String(currentInitials || '').trim()
      ) {
        return false;
      }

      return       Object.entries(filters).every(([field, value]) => {
        if (!value || value === 'Alla') return true;
        return String(row[field] ?? '') === value;
      });
    });
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

  async function createDigProdRowsFromSaljintro(saljintroRow) {
    const produkt = String(saljintroRow?.produkt || '').trim();
    if (!produkt) return [];

    const digProdEntry = tableEntries.find(([name]) => name === 'DIG PROD');
    if (!digProdEntry) return [];

    const [, digProdConfig] = digProdEntry;
    const ownerInitials = saljintroRow.owner_initials || getCurrentUserInitials();

    const payload = ['B2B-ready', 'Shopify-ready'].map((kategori) => ({
      produktnamn: produkt,
      kategori,
      p_info: 'gray',
      metafalt: 'gray',
      copy: 'gray',
      packshot: 'gray',
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

  async function createSaljintroFromUtveckling(utvecklingRow) {
    const produkt = String(utvecklingRow?.produktide || '').trim();
    if (!produkt) {
      alert('Produktnamn saknas i UTVECKLING-raden.');
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
      kategori: utvecklingRow.kategori || 'matta',
      koll_q: '--',
      po_beslut: 'gray',
      po_beslut_datum: null,
      b2b_ready: 'gray',
      b2b_ready_datum: null,
      shopify_ready: 'gray',
      shopify_ready_datum: null,
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
      await archiveRow('UTVECKLING', APP_CONFIG.tables['UTVECKLING'], utvecklingRow);
    } catch (err) {
      alert(`SÄLJINTRO skapades men raden kunde inte arkiveras: ${err.message}`);
    }

    state.savingCell = null;
    state.detailRowId = null;
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
      if (column.type === 'date') value = String(value || '').trim() || null;
      if (isFileColumn(column)) value = '';
      payload[column.field] = value;
    });
    if (isOwnerEnabledTable(tableName)) {
      payload.owner_initials = draftRow.owner_initials || getCurrentUserInitials();
    }

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
      const fileColumns = tableConfig.columns.filter((column) => isFileColumn(column));
      for (const column of fileColumns) {
        const draftFile = getDraftPdfFile(draftRow, column.field);
        if (!draftFile) continue;

        const storagePath = await uploadPdfFile(draftFile, column);
        const { error: updateError } = await supabase
          .from(tableConfig.dbTable)
          .update({ [column.field]: storagePath })
          .eq('id', data.id);

        if (updateError) {
          throw new Error(updateError.message || 'Kunde inte koppla Fil till raden.');
        }

        finalRow[column.field] = storagePath;
      }
    } catch (err) {
      state.savingCell = null;
      alert(`Raden skapades, men Fil kunde inte hanteras: ${err.message}`);
      state.rowsByTable[tableName] = [finalRow, ...(state.rowsByTable[tableName] || [])];
      state.newRowDraft = null;
      state.detailRowId = null;
      render();
      return;
    }

    try {
      if (tableName === 'SÄLJINTRO') {
        await createDigProdRowsFromSaljintro(finalRow);
      }
    } catch (err) {
      alert(`Raden skapades, men DIG PROD-rader kunde inte skapas automatiskt: ${err.message}`);
    }

    state.savingCell = null;
    state.rowsByTable[tableName] = [finalRow, ...(state.rowsByTable[tableName] || [])];
    state.newRowDraft = null;
    state.detailRowId = null;
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
    if (isFileColumn(column)) normalizedNextValue = normalizePdfPath(nextValue);
    const dbNextValue = column.type === 'date'
      ? (String(normalizedNextValue || '').trim() || null)
      : normalizedNextValue;

    const currentValue = row[column.field] ?? '';
    const linkedStatusField = column.autoStatusField || '';
    const shouldSetLinkedStatus = !!linkedStatusField && String(normalizedNextValue || '').trim();
    const linkedStatusValue = column.autoStatusValue || 'yellow';
    const currentLinkedStatusValue = linkedStatusField ? row[linkedStatusField] : undefined;

    if (
      String(currentValue) === String(normalizedNextValue) &&
      (!shouldSetLinkedStatus || String(currentLinkedStatusValue || '') === linkedStatusValue)
    ) {
      state.editingCell = null;
      render();
      return true;
    }

    const updatePayload = { [column.field]: dbNextValue };
    if (shouldSetLinkedStatus) {
      updatePayload[linkedStatusField] = linkedStatusValue;
    }

    state.savingCell = key;
    row[column.field] = normalizedNextValue;
    if (shouldSetLinkedStatus) {
      row[linkedStatusField] = linkedStatusValue;
    }
    render();

    const { error } = await supabase
      .from(tableConfig.dbTable)
      .update(updatePayload)
      .eq('id', row.id);

    state.savingCell = null;
    state.editingCell = null;

    if (error) {
      alert(`Kunde inte spara ${column.name}: ${error.message}`);
      row[column.field] = currentValue;
      if (shouldSetLinkedStatus) {
        row[linkedStatusField] = currentLinkedStatusValue;
      }
      render();
      return false;
    }

    render();
    return true;
  }

  async function toggleStatusCell(tableConfig, row, column) {
    if (column.lockManualStatus) return;

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


  function createStatusButton(column, value, isDetail = false, row = null) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${getStatusClass(value)}${isDetail ? ' status-button--detail' : ''}`;
    button.setAttribute('aria-label', `${column.name}: ${getStatusLabel(column)} (${normalizeStatusValue(value)})`);

    const label = document.createElement('span');
    label.className = 'status-button__label';

    const renderedValue = column.renderFromField && row
      ? String(row?.[column.renderFromField] || '').trim()
      : '';

    label.textContent = renderedValue || getStatusLabel(column);

    if (!column.hideStatusLabel || renderedValue) {
      button.appendChild(label);
    }

    return button;
  }

  function openExternalFileUrl(url, column = null) {
    const value = String(url || '').trim();
    if (!value) {
      alert('Dokumentväg saknas.');
      return;
    }

    if (column?.type === 'excel') {
      const officeUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(value)}`;
      window.open(officeUrl, '_blank', 'noopener');
      return;
    }

    window.open(value, '_blank', 'noopener');
  }

  async function openPdfDocument(value, column = null) {
    const objectPath = normalizePdfPath(value);
    if (!objectPath) {
      alert('Dokumentväg saknas.');
      return;
    }

    if (objectPath.startsWith('http://') || objectPath.startsWith('https://')) {
      openExternalFileUrl(objectPath, column);
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from(PDF_BUCKET)
        .createSignedUrl(objectPath, column?.type === 'excel' ? 3600 : 60);

      if (!error && data?.signedUrl) {
        openExternalFileUrl(data.signedUrl, column);
        return;
      }
    } catch (err) {
      console.warn('Signed URL failed:', err);
    }

    const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(objectPath);
    if (data?.publicUrl) {
      openExternalFileUrl(data.publicUrl, column);
      return;
    }

    alert('Kunde inte öppna filen.');
  }

  async function replacePdfForExistingRow(tableConfig, row, column, file) {
    if (column?.type !== 'excel' && !isPdfFile(file)) {
      alert('Välj en PDF-fil.');
      return;
    }

    const key = getCellKey(row, column) || '__pdf__';
    const oldPath = normalizePdfPath(row[column.field]);

    state.savingCell = key;
    render();

    try {
      const newPath = await uploadPdfFile(file, column);

      const { error: updateError } = await supabase
        .from(tableConfig.dbTable)
        .update({ [column.field]: newPath })
        .eq('id', row.id);

      if (updateError) {
        throw new Error(updateError.message || 'Kunde inte spara Fil på raden.');
      }

      row[column.field] = newPath;

      if (oldPath && oldPath !== newPath) {
        try {
          await removePdfFromStorage(oldPath);
        } catch (cleanupError) {
          console.warn('Old Fil cleanup failed:', cleanupError);
        }
      }
    } catch (err) {
      alert(`Kunde inte ladda upp Fil: ${err.message}`);
    } finally {
      state.savingCell = null;
      render();
    }
  }

  async function removePdfForExistingRow(tableConfig, row, column) {
    const oldPath = normalizePdfPath(row[column.field]);
    if (!oldPath) return;

    const confirmed = window.confirm('Ta bort fil från raden?');
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
      alert(`Kunde inte ta bort Fil: ${err.message}`);
    } finally {
      state.savingCell = null;
      render();
    }
  }


  function isPastDateValue(value) {
    if (!value) return false;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    parsed.setHours(0, 0, 0, 0);

    return parsed < today;
  }

  function shouldHighlightOverdueDate(row, column) {
    return (
      (state.activeTableName === 'MARKNAD' || state.activeTableName === 'SÄLJ' || state.activeTableName === 'INKÖP') &&
      column?.field === 'klart_datum' &&
      isPastDateValue(row?.klart_datum)
    );
  }

  function createStaticCellContent(row, column) {
    const maybeWrapOwnerContent = (node) => {
      if (shouldShowOwnerBadge(state.activeTableName, row, column)) {
        return createOwnerCellContent(row, column, node);
      }
      return node;
    };

    if (isOpenColumn(column)) {
      return createOpenButton(row);
    }

    const rawValue = row[column.field];
    const text = rawValue === undefined || rawValue === null ? '' : String(rawValue);

    if (isStatusColumn(column)) {
      return createStatusButton(column, text, false, row);
    }

    if (isFileColumn(column)) {
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
      button.setAttribute('aria-label', `Öppna Fil: ${displayName}`);
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await openPdfDocument(text, column);
      });
      return button;
    }

    if (column.type === 'veckonummer') {
      const chip = document.createElement('span');
      chip.className = 'cell-chip';
      chip.textContent = formatWeekValue(text);
      return maybeWrapOwnerContent(chip);
    }

    if (column.type === 'kvartal') {
      const chip = document.createElement('span');
      chip.className = 'cell-chip';
      chip.textContent = formatQuarterValue(text);
      return maybeWrapOwnerContent(chip);
    }

    if (column.type === 'date') {
      const span = document.createElement('span');
      const formatted = formatDateValue(text);

      let className = formatted !== '—'
        ? 'cell-text'
        : 'cell-text cell-text--muted';

      if (shouldHighlightOverdueDate(row, column)) {
        className += ' cell-text--overdue';
      }

      span.className = className;
      span.textContent = formatted;
      return maybeWrapOwnerContent(span);
    }

    if (isEditableDropdownColumn(column)) {
      const chip = document.createElement('span');
      chip.className = 'cell-chip';
      chip.textContent = text || '—';
      return maybeWrapOwnerContent(chip);
    }

    const span = document.createElement('span');
    span.className = text ? 'cell-text' : 'cell-text cell-text--muted';
    span.textContent = text || '—';
    return maybeWrapOwnerContent(span);
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
    name.textContent = displayName || 'Ingen fil vald';

    const helper = document.createElement('div');
    helper.className = 'rutiner-pdf-field__helper';
    helper.textContent = displayName
      ? 'Du kan öppna, byta eller ta bort filen här.'
      : (column.type === 'excel' ? 'Ladda upp Excel/CSV-fil.' : 'Ladda upp PDF-fil.');

    info.appendChild(name);
    info.appendChild(helper);

    const actions = document.createElement('div');
    actions.className = 'rutiner-pdf-field__actions';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = column.type === 'excel' ? '*/*' : 'application/pdf,.pdf';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
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
    uploadButton.textContent = displayName ? 'Byt fil' : (column.type === 'excel' ? 'Ladda upp Excel' : 'Ladda upp PDF');
    uploadButton.addEventListener('click', () => fileInput.click());
    actions.appendChild(uploadButton);

    if (displayName) {
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'secondary-button';
      openButton.textContent = column.type === 'excel' ? 'Öppna Excel' : 'Öppna PDF';
      openButton.addEventListener('click', async () => {
        if (isDraft) return;
        await openPdfDocument(row[column.field], column);
      });
      actions.appendChild(openButton);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'secondary-button secondary-button--danger';
      removeButton.textContent = 'Ta bort fil';
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

    if (isFileColumn(column)) {
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
      control = createStatusButton(column, row[column.field], true, row);

      control.addEventListener('click', async () => {
        if (column.lockManualStatus) return;
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
          const nextDraftValue = getNextValue();
          row[column.field] = nextDraftValue;

          if (column.autoStatusField && String(nextDraftValue || '').trim()) {
            row[column.autoStatusField] = column.autoStatusValue || 'yellow';
          }
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

  function getArchiveTitleField(tableName) {
    if (tableName === 'PRE DEV') return 'utv_ide';
    if (tableName === 'UTVECKLING') return 'produktide';
    if (tableName === 'SÄLJINTRO') return 'produkt';
    if (tableName === 'DIG PROD') return 'produktnamn';
    if (tableName === 'CDM PROJECTS') return 'projektnamn';
    if (tableName === 'MARKNAD') return 'beskrivning';
    if (tableName === 'SÄLJ') return 'beskrivning';
    if (tableName === 'INKÖP') return 'beskrivning';
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
      if (event.target === overlay) {
        event.preventDefault();
        event.stopPropagation();
      }
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

        menu.appendChild(createCard({
          title: 'Checklistor',
          subtitle: 'Hantera kolumn-checklistor',
          onClick: openSettingsChecklists,
          disabled: false,
          adminOnly: true,
        }));
      }

      menu.appendChild(createCard({
        title: 'Länkar',
        subtitle: 'Öppna länkar',
        onClick: openLinksPanel,
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
          const { signOutUser } = await import('./auth.js?v=95');
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

        const listTitle = document.createElement('h3');
        listTitle.className = 'detail-card__title';
        listTitle.textContent = 'Befintliga checklistor';
        listCard.appendChild(listTitle);

        const rows = state.columnChecklistsList || [];
        if (!rows.length) {
          const empty = document.createElement('p');
          empty.className = 'empty-state';
          empty.textContent = 'Inga checklistor ännu.';
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
            editButton.disabled = !isAdmin();
            editButton.addEventListener('click', () => editChecklistFromSettings(item));

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
      if (event.target === overlay) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    heading.className = 'todo-modal__heading';
    heading.innerHTML = `
      <p class="side-panel__eyebrow">${tableName}</p>
      <h2 class="side-panel__title">${isDraft ? 'Ny rad' : 'Radöversikt'}</h2>
      <p class="side-panel__text">${isDraft ? 'Fyll i fälten nedan och välj Spara eller Avbryt.' : 'Redigera fälten nedan eller välj åtgärd.'}</p>
    `;

    const headerActions = document.createElement('div');
    headerActions.className = 'side-panel__header-actions';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.title = 'Stäng';
    closeButton.addEventListener('click', closeDetailPanel);

    header.appendChild(heading);

    if (isDraft) {
      const cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'secondary-button';
      cancelButton.textContent = 'Avbryt';
      cancelButton.addEventListener('click', closeDetailPanel);

      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'secondary-button';
      saveButton.textContent = state.savingCell === '__new_row__' ? 'Sparar...' : 'Spara';
      saveButton.disabled = state.savingCell === '__new_row__';
      saveButton.addEventListener('click', async () => {
        await saveNewRow(tableName, tableConfig, row);
      });

      headerActions.appendChild(cancelButton);
      headerActions.appendChild(saveButton);
      header.appendChild(headerActions);
    } else {
      const actions = getActionConfig(tableName);

      if (tableName !== 'RUTINER') {
        headerActions.appendChild(createMessageButtonForRow(tableName, row));
      }

      if (tableName === 'UTVECKLING') {
        const saljintroButton = document.createElement('button');
        saljintroButton.type = 'button';
        saljintroButton.className = 'secondary-button';
        saljintroButton.textContent = 'SÄLJINTRO';
        saljintroButton.addEventListener('click', async () => {
          await createSaljintroFromUtveckling(row);
        });
        headerActions.appendChild(saljintroButton);
      }

      if (actions.primary && !['PRE DEV','UTVECKLING'].includes(tableName)) {
        const primaryButton = document.createElement('button');
        primaryButton.type = 'button';
        primaryButton.className = 'secondary-button';
        primaryButton.textContent =
          tableName === TODO_TABLE && actions.primary.action === 'complete_todo'
            ? (row.is_done ? 'Öppna igen' : 'Markera Klar')
            : actions.primary.label;
        primaryButton.addEventListener('click', async () => {
          await runRowAction(tableName, tableConfig, row, actions.primary.action);
        });
        headerActions.appendChild(primaryButton);
      }

      if (actions.secondary) {
        const secondaryButton = document.createElement('button');
        secondaryButton.type = 'button';
        secondaryButton.className = 'secondary-button';
        secondaryButton.textContent = actions.secondary.label;
        secondaryButton.addEventListener('click', async () => {
          await runRowAction(tableName, tableConfig, row, actions.secondary.action);
        });
        headerActions.appendChild(secondaryButton);
      }

      if (actions.danger) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'secondary-button secondary-button--danger';
        deleteButton.textContent = actions.danger.label;
        deleteButton.addEventListener('click', async () => {
          await runRowAction(tableName, tableConfig, row, actions.danger.action);
        });
        headerActions.appendChild(deleteButton);
      }

      if (headerActions.children.length) {
        header.appendChild(headerActions);
      }
    }

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

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    return overlay;
  }

  const renderController = createRenderController({
    app,
    settingsButton,
    state,
    TODO_TABLE,
    getActiveConfig,
    openSettingsMenu,
    ensureLinksButton,
    ensureMessagesButton,
    userArea,
    createNav,
    getCurrentDraftRow,
    getCurrentDetailRow,
    createSettingsPanel,
    createLinksPanel,
    createMessagesPanel,
    createArchivePanel,
    createRowTodoPanel,
    createNotesPanel,
    createColumnChecklistPanel,
    createDetailPanel,
    getFilteredRows,
    getVisibleColumns,
    createTopActions,
    createFilterBar,
    getAlignment,
    isStatusColumn,
    isOpenColumn,
    isNotesColumn,
    isTodoColumn,
    createDocumentBadge,
    createChecklistBadge,
    isVirtualModalTodoRow,
    createOpenButton,
    createNotesButton,
    createTodoButton,
    getCellKey,
    isEditableTextColumn,
    isEditableDropdownColumn,
    createEditableTextControl,
    createEditableDropdownControl,
    createStaticCellContent,
    toggleStatusCell,
    toggleTodoDone,
    startEditing,
  });

  async function render() {
    return renderController.render();
  }

  settingsButton?.addEventListener('click', () => {
    openSettingsMenu();
  });

  await Promise.all(
    tableEntries.filter(([, tableConfig]) => !!tableConfig.dbTable).map(([tableName, tableConfig]) => loadTableRowsFromData(state, tableName, tableConfig))
  );
  await archiveCompletedTodosFromPreviousWeeks();
  await loadDocumentLinks();
  await loadColumnChecklists();
  await loadLinks();
  await loadPlanningUsers();
  await loadMessages();
  await loadModalTodoRows();
  if (state.activeTableName) {
    await loadUnreadCountsForTable(state.activeTableName);
  }

  render();
}
