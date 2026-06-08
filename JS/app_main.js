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
} from './app_constants.js?v=178';
import { createTodoController } from './app_todo.js?v=178';
import { createMessagesController } from './app_messages.js?v=178';
import { createRenderController } from './app_render.js?v=178';
import { createDataController } from './app_data.js?v=178';
import { createActionController } from './app_actions.js?v=178';
import { createFilterController } from './app_filters.js?v=178';
import { createColumnToolsController } from './app_column_tools.js?v=178';
import { createExcelPlanController } from './app_excel_plan.js?v=178';
import { createProjectsController } from './app_projects.js?v=178';
import './app_statistics.js?v=178';

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
  const digProdIndex = tableEntries.findIndex(([tableName]) => tableName === 'DIG PROD');
  const digProdEntry = digProdIndex >= 0 ? tableEntries.splice(digProdIndex, 1)[0] : null;
  const projektIndex = tableEntries.findIndex(([tableName]) => tableName === 'PROJEKT');
  const projektEntry = projektIndex >= 0 ? tableEntries.splice(projektIndex, 1)[0] : null;
  const marknadIndex = tableEntries.findIndex(([tableName]) => tableName === 'MARKNAD');
  const marknadEntry = marknadIndex >= 0 ? tableEntries.splice(marknadIndex, 1)[0] : null;
  const saljIndex = tableEntries.findIndex(([tableName]) => tableName === 'SÄLJ');
  const saljEntry = saljIndex >= 0 ? tableEntries.splice(saljIndex, 1)[0] : null;
  const inkopIndex = tableEntries.findIndex(([tableName]) => tableName === 'INKÖP');
  const inkopEntry = inkopIndex >= 0 ? tableEntries.splice(inkopIndex, 1)[0] : null;

  const insertIndex = tableEntries.findIndex(
    ([tableName]) => tableName === 'SÄLJINTRO'
  );

  const orderedEntries = [
    ...(digProdEntry ? [digProdEntry] : []),
    ...(projektEntry ? [projektEntry] : []),
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
    sortByTable: {},
    todoMineOnly: false,
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
    columnChecklistsLoading: false,
    columnChecklistsError: '',
    linksList: [],
    linksPanelOpen: false,
    messagesPanelOpen: false,
    messagesPanelMode: 'inbox',
    messagesList: null,
    messageComposeDraft: null,
    modalTodoRows: [],
    planningUsers: [],
    projectRows: [],
    projectActivityRows: [],
    projectExpandedById: {},
    projectFilterCategory: 'Alla',
    projectsLoading: false,
    projectsSavingCell: null,
    notesSourceTable: '',
    notesSourceTitle: '',
    notesTableLabel: '',
    notesCurrentRow: null,
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
  const { archiveCompletedTodosFromPreviousWeeks, archiveGreenOperationalRowsFromPreviousWeeks, toggleTodoDone } = todoController;

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

    const autoProjectSuffixes = [' - Media', ' - B2B-intro', ' - B2C-intro'];
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
    const hiddenRowTodoTables = ['PRE DEV', 'UTVECKLING', 'SÄLJINTRO'];
    if (hiddenRowTodoTables.includes(tableName)) return false;
    return !!APP_CONFIG.rowTodoConfig?.[tableName];
  }

  function getRowTodoCategories(tableName) {
    return ['Allmänt'];
  }

  function getVisibleColumns(tableConfig) {
    const hiddenRowTodoTables = ['PRE DEV', 'UTVECKLING', 'SÄLJINTRO', 'DIG PROD'];
    const tableName = state.activeTableName;
    const inlineOnlyTables = ['SÄLJINTRO', 'UTVECKLING', 'PRE DEV', 'DIG PROD', 'INKÖP', 'MARKNAD', 'SÄLJ'];
    const inlineActionTables = ['PRE DEV', 'UTVECKLING', 'SÄLJINTRO', 'INKÖP', 'MARKNAD', 'SÄLJ'];
    const columns = [
      ...tableConfig.columns.filter((column) => column.field !== 'id' && !column.hiddenInTable && column.field !== UI_TODO_COLUMN.field && column.type !== UI_TODO_COLUMN.type),
      ...(inlineOnlyTables.includes(tableName) ? [] : [UI_OPEN_COLUMN, UI_NOTES_COLUMN]),
    ];
    if (inlineActionTables.includes(tableName)) {
      columns.push(getInlineActionsColumn());
    }
    if (!hiddenRowTodoTables.includes(tableName) && hasRowTodo(tableName)) {
      columns.push(UI_TODO_COLUMN);
    }
    return columns;
  }

  const filterController = createFilterController({
    state,
    APP_CONFIG,
    TODO_TABLE,
    getVisibleColumns,
    getCurrentUserInitials,
    render,
  });
  const { ensureFilters, createFilterBar, getFilteredRows: getFilteredRowsBase } = filterController;

  const excelPlanController = createExcelPlanController({
    state,
    normalizeStatusValue,
  });
  const { openSalesIntroExcelPlan } = excelPlanController;

  const projectsController = createProjectsController({
    supabase,
    state,
    tableEntries,
    render,
    getCurrentUserInitials,
    openNotesPanel,
  });

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

  function isActionsColumn(column) {
    return column?.field === '__actions__';
  }

  function getInlineActionsColumn() {
    return {
      name: 'Åtgärder',
      field: '__actions__',
      type: 'ui_actions',
      width: '26ch',
      mods: { align: 'center', readonly: true },
    };
  }

  const columnToolsController = createColumnToolsController({
    supabase,
    state,
    openPdfDocument,
    render,
  });
  const {
    loadDocumentLinks,
    loadColumnChecklists,
    createColumnChecklistPanel,
    createChecklistBadge,
    createDocumentBadge,
  } = columnToolsController;


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
    if (tableName === 'PROJEKT') return 'project_name';
    if (tableName === 'CDM PROJECTS') return 'projektnamn';
    if (tableName === 'MARKNAD') return 'beskrivning';
    if (tableName === 'SÄLJ') return 'beskrivning';
    if (tableName === 'INKÖP') return 'beskrivning';
    if (tableName === 'TODO') return 'beskrivning';
    if (tableName === 'RUTINER') return 'rutin';
    return '';
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
      <p class="side-panel__eyebrow">${tableLabel}</p>
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
      option.textContent = getDropdownOptionLabel(value);
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

  function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function formatWeekFromDateValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '--' || raw === '-- -- --') return '';

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';

    return `V${String(getISOWeekNumber(date)).padStart(2, '0')}`;
  }

  function getDateInputValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '--' || raw === '-- -- --') return '';

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw.slice(0, 10);

    return date.toISOString().slice(0, 10);
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

  function normalizeDigProdIntroCategory(kategori) {
    const value = String(kategori || '').trim();
    const key = normalizeProductLinkKey(value);
    if (key === 'B2BREADY' || key === 'B2BINTRO') return 'B2B-intro';
    if (key === 'B2CREADY' || key === 'B2CINTRO' || key === 'SHOPIFYREADY') return 'B2C-intro';
    return value;
  }

  function findSaljintroRowForProductName(productName) {
    const produkt = String(productName || '').trim();
    if (!produkt) return null;

    const saljRows = state.rowsByTable['SÄLJINTRO'] || [];
    const exact = saljRows.find((item) => String(item?.produkt || '').trim() === produkt);
    if (exact) return exact;

    const normalizedProduct = normalizeProductLinkKey(produkt);
    const normalizedExact = saljRows.find((item) => normalizeProductLinkKey(item?.produkt) === normalizedProduct);
    if (normalizedExact) return normalizedExact;

    const candidates = saljRows
      .filter((item) => isLikelySameProductName(produkt, item?.produkt))
      .map((item) => ({
        item,
        distance: getStringDistance(normalizedProduct, normalizeProductLinkKey(item?.produkt)),
      }))
      .sort((a, b) => a.distance - b.distance);

    return candidates[0]?.item || null;
  }

  function getSaljintroRowForDigProdRow(row) {
    return findSaljintroRowForProductName(row?.produktnamn);
  }

  function getDigProdKlartWeekValue(row) {
    const kategori = normalizeDigProdIntroCategory(row?.kategori);
    const saljRow = getSaljintroRowForDigProdRow(row);

    if (!saljRow) return '--';
    if (kategori === 'B2B-intro') return formatWeekFromDateValue(saljRow.po_beslut_slut_datum) || '--';
    if (kategori === 'B2C-intro') return formatWeekFromDateValue(saljRow.po_lager_slut_datum) || '--';
    return '--';
  }


  function normalizeProductLinkKey(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  function getStringDistance(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;

    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = Array(right.length + 1).fill(0);

    for (let i = 1; i <= left.length; i += 1) {
      current[0] = i;
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        current[j] = Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + cost
        );
      }
      for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
    }

    return previous[right.length];
  }

  function isLikelySameProductName(leftName, rightName) {
    const left = normalizeProductLinkKey(leftName);
    const right = normalizeProductLinkKey(rightName);
    if (!left || !right) return false;
    if (left === right) return true;

    const distance = getStringDistance(left, right);
    const maxLength = Math.max(left.length, right.length);
    if (maxLength < 8) return false;

    return distance <= 2 || distance / maxLength <= 0.10;
  }

  function findDigProdMatchForSaljintro({ saljRow, targetCategory, usedDigProdIds }) {
    const product = String(saljRow?.produkt || '').trim();
    if (!product) return null;

    const digRows = state.rowsByTable['DIG PROD'] || [];
    const exact = digRows.find((row) => {
      if (usedDigProdIds.has(String(row.id))) return false;
      const category = normalizeDigProdIntroCategory(row?.kategori);
      return category === targetCategory && String(row?.produktnamn || '').trim() === product;
    });
    if (exact) return exact;

    const candidates = digRows
      .filter((row) => {
        if (usedDigProdIds.has(String(row.id))) return false;
        const category = normalizeDigProdIntroCategory(row?.kategori);
        if (category !== targetCategory) return false;
        return isLikelySameProductName(product, row?.produktnamn);
      })
      .map((row) => ({
        row,
        distance: getStringDistance(normalizeProductLinkKey(product), normalizeProductLinkKey(row?.produktnamn)),
      }))
      .sort((a, b) => a.distance - b.distance);

    return candidates[0]?.row || null;
  }

  async function repairDigProdLinksFromSaljintro() {
    const saljintroEntry = tableEntries.find(([name]) => name === 'SÄLJINTRO');
    const digProdEntry = tableEntries.find(([name]) => name === 'DIG PROD');
    if (!saljintroEntry || !digProdEntry) return false;

    const [, digProdConfig] = digProdEntry;
    const saljRows = state.rowsByTable['SÄLJINTRO'] || [];
    const categories = ['B2B-intro', 'B2C-intro'];
    const usedDigProdIds = new Set();
    let changed = false;

    const applyUpdatedRows = (rows) => {
      const normalizedRows = (Array.isArray(rows) ? rows : [])
        .map((row) => normalizeRow('DIG PROD', digProdConfig, row));
      if (!normalizedRows.length) return;

      const updatedById = new Map(normalizedRows.map((row) => [String(row.id), row]));
      state.rowsByTable['DIG PROD'] = (state.rowsByTable['DIG PROD'] || []).map((row) =>
        updatedById.get(String(row.id)) || row
      );
    };

    for (const saljRow of saljRows) {
      const product = String(saljRow?.produkt || '').trim();
      if (!product) continue;

      for (const targetCategory of categories) {
        const match = findDigProdMatchForSaljintro({ saljRow, targetCategory, usedDigProdIds });
        const description = String(saljRow?.beskrivning_status || '').trim();

        if (match?.id) {
          usedDigProdIds.add(String(match.id));
          const needsProductRepair = String(match.produktnamn || '').trim() !== product;
          const needsCategoryRepair = normalizeDigProdIntroCategory(match.kategori) !== String(match.kategori || '').trim();
          const needsDescriptionRepair = description && String(match.beskrivning || '').trim() !== description;

          if (!needsProductRepair && !needsCategoryRepair && !needsDescriptionRepair) continue;

          const payload = {
            produktnamn: product,
            kategori: targetCategory,
          };
          if (description) payload.beskrivning = description;

          const { data, error } = await supabase
            .from(digProdConfig.dbTable)
            .update(payload)
            .eq('id', match.id)
            .select('*');

          if (error) {
            console.warn('Could not repair DIG PROD link:', error.message);
            continue;
          }

          applyUpdatedRows(data);
          changed = true;
          continue;
        }

        const payload = {
          produktnamn: product,
          kategori: targetCategory,
          beskrivning: description,
          p_info: 'gray',
          ai_seo: 'gray',
          metafalt: 'gray',
          copy: 'gray',
          packshot: 'gray',
          kampanj: 'gray',
          klart: 'gray',
          klart_datum: null,
          owner_initials: saljRow.owner_initials || getCurrentUserInitials(),
          is_done: false,
        };

        const { data, error } = await supabase
          .from(digProdConfig.dbTable)
          .insert(payload)
          .select('*');

        if (error) {
          console.warn('Could not recreate DIG PROD row:', error.message);
          continue;
        }

        const normalizedRows = (Array.isArray(data) ? data : [])
          .map((row) => normalizeRow('DIG PROD', digProdConfig, row));
        state.rowsByTable['DIG PROD'] = [
          ...normalizedRows,
          ...(state.rowsByTable['DIG PROD'] || []),
        ];
        normalizedRows.forEach((row) => usedDigProdIds.add(String(row.id)));
        changed = true;
      }
    }

    return changed;
  }

  function getCurrentShortYear() {
    return String(new Date().getFullYear()).slice(-2);
  }

  function formatQuarterValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '--') return '--';
    const fullMatch = raw.match(/(\d{2,4})\s*[-/]?\s*Q([1-4])/i);
    if (fullMatch) {
      const year = fullMatch[1].slice(-2);
      return `${year}-Q${fullMatch[2]}`;
    }
    const match = raw.match(/Q([1-4])/i) || raw.match(/([1-4])$/);
    if (!match) return raw;
    return `${getCurrentShortYear()}-Q${match[1]}`;
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

  function ensureLinksButton() {
    // v93: Links are Settings-only. Remove any old topbar Links button if present.
    document.querySelectorAll('[data-links-button="true"], .links-button').forEach((button) => button.remove());
  }

  function getTableDisplayName(tableName, tableConfig = null) {
    const title = String(tableConfig?.title || '').trim();
    if (title) return title;
    if (tableName === 'STATISTICS') return 'FSG';
    return tableName;
  }

  function createNav() {
    nav.innerHTML = '';

    tableEntries
      .filter(([tableName]) => tableName !== 'RUTINER')
      .forEach(([tableName, tableConfig]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'table-nav__link';
      button.textContent = getTableDisplayName(tableName, tableConfig);

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
    const active = tableEntries.find(([name]) => name === tableName);
    document.title = `${getTableDisplayName(tableName, active?.[1])} - TODO Planning`;

    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        document.title = previousTitle;
      }, 250);
    }, 0);
  }

  async function createInlineNewRow(tableName, tableConfig, overrides = {}) {
    const draft = {};
    tableConfig.columns.forEach((column) => {
      if (column.field === 'id') return;
      draft[column.field] = getDefaultValue(tableName, column);
    });

    Object.assign(draft, overrides);

    if (isOwnerEnabledTable(tableName)) {
      draft.owner_initials = getCurrentUserInitials();
    }

    if (tableName === 'MARKNAD' || tableName === 'SÄLJ' || tableName === 'INKÖP') {
      draft.klart_datum = new Date().toISOString().slice(0, 10);
    }

    draft.is_done = false;

    await saveNewRow(tableName, tableConfig, normalizeRow(tableName, tableConfig, draft));
  }

  function getDesignCategoryOptions() {
    const dropdown = APP_CONFIG.dropdowns?.dropdown_dev_kategori;
    return Array.isArray(dropdown?.options) ? dropdown.options : [];
  }

  function createCategorySelect({ options, ariaLabel, placeholderText }) {
    const select = document.createElement('select');
    select.className = 'filter-item__control';
    select.setAttribute('aria-label', ariaLabel);

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = placeholderText;
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    (options || []).forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = getDropdownOptionLabel(value);
      select.appendChild(option);
    });

    return select;
  }

  function createDesignNewRowCategorySelect() {
    return createCategorySelect({
      options: getDesignCategoryOptions(),
      ariaLabel: 'Kategori för ny Design-rad',
      placeholderText: 'VÄLJ KATEGORI',
    });
  }

  function getSaljintroCategoryOptions() {
    const dropdown = APP_CONFIG.dropdowns?.dropdown_product_kategori;
    return Array.isArray(dropdown?.options) ? dropdown.options : [];
  }

  function createSaljintroNewRowCategorySelect() {
    return createCategorySelect({
      options: getSaljintroCategoryOptions(),
      ariaLabel: 'Kategori för ny Säljintro-rad',
      placeholderText: 'VÄLJ KATEGORI',
    });
  }

  function getDigProdCategoryOptions() {
    const dropdown = APP_CONFIG.dropdowns?.dropdown_dig_prod_kategori;
    return Array.isArray(dropdown?.options) ? dropdown.options : [];
  }

  function createDigProdNewRowCategorySelect() {
    return createCategorySelect({
      options: getDigProdCategoryOptions(),
      ariaLabel: 'Kategori för ny DIG PROD-rad',
      placeholderText: 'VÄLJ KATEGORI',
    });
  }

  function createTopActions(tableName, tableConfig) {
    const wrap = document.createElement('div');
    wrap.className = 'view-actions';

    const designCategorySelect = tableName === 'UTVECKLING'
      ? createDesignNewRowCategorySelect()
      : null;
    const saljintroCategorySelect = tableName === 'SÄLJINTRO'
      ? createSaljintroNewRowCategorySelect()
      : null;
    const digProdCategorySelect = null;

    if (designCategorySelect) {
      wrap.appendChild(designCategorySelect);
    }

    if (saljintroCategorySelect) {
      wrap.appendChild(saljintroCategorySelect);
    }

    if (digProdCategorySelect) {
      wrap.appendChild(digProdCategorySelect);
    }

    if (tableName === 'DIG PROD') {
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

    const newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.className = 'secondary-button';
    newButton.textContent = '+ Ny rad';

    newButton.addEventListener('click', async () => {
        if (tableName === 'UTVECKLING') {
          const kategori = String(designCategorySelect?.value || '').trim();
          if (!kategori) {
            alert('Välj kategori innan ny Design-rad skapas.');
            designCategorySelect?.focus();
            return;
          }
          await createInlineNewRow(tableName, tableConfig, { kategori });
          if (designCategorySelect) designCategorySelect.value = '';
          return;
        }

        if (tableName === 'SÄLJINTRO') {
          const kategori = String(saljintroCategorySelect?.value || '').trim();
          if (!kategori) {
            alert('Välj kategori innan ny Säljintro-rad skapas.');
            saljintroCategorySelect?.focus();
            return;
          }
          await createInlineNewRow(tableName, tableConfig, { kategori });
          if (saljintroCategorySelect) saljintroCategorySelect.value = '';
          return;
        }

        if (tableName === 'DIG PROD') {
          const kategori = String(digProdCategorySelect?.value || '').trim();
          if (!kategori) {
            alert('Välj kategori innan ny DIG PROD-rad skapas.');
            digProdCategorySelect?.focus();
            return;
          }
          await createInlineNewRow(tableName, tableConfig, { kategori });
          if (digProdCategorySelect) digProdCategorySelect.value = '';
          return;
        }

        if (tableName === 'PRE DEV') {
          await createInlineNewRow(tableName, tableConfig);
          return;
        }

        if (tableName === 'MARKNAD' || tableName === 'SÄLJ' || tableName === 'INKÖP') {
          await createInlineNewRow(tableName, tableConfig);
          return;
        }

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

    if (tableName !== 'RUTINER') {
      const archiveButton = document.createElement('button');
      archiveButton.type = 'button';
      archiveButton.className = 'secondary-button';
      archiveButton.textContent = 'Arkiv';
      archiveButton.addEventListener('click', openArchivePanel);
      wrap.appendChild(archiveButton);
    }

    if (tableName === TODO_TABLE) {
      const mineButton = document.createElement('button');
      mineButton.type = 'button';
      mineButton.className = `secondary-button${state.todoMineOnly ? ' is-active' : ''}`;
      mineButton.textContent = 'Mina Todo';
      mineButton.title = 'Visa mina ansvariga och privata todo';
      mineButton.addEventListener('click', () => {
        state.todoMineOnly = !state.todoMineOnly;
        render();
      });
      wrap.appendChild(mineButton);
    }
    if (tableName === 'SÄLJINTRO') {
      const excelPlanButton = document.createElement('button');
      excelPlanButton.type = 'button';
      excelPlanButton.className = 'secondary-button';
      excelPlanButton.textContent = 'Excel-plan';
      excelPlanButton.addEventListener('click', openSalesIntroExcelPlan);
      wrap.appendChild(excelPlanButton);
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

  function isMultilineTextColumn(column) {
    return column?.type === 'text' && (column?.mods?.displayMode === 'textarea' || column?.mods?.multiline === true || column?.multiline === true);
  }

  function isEditableTextColumn(column) {
    return ['text', 'veckonummer', 'kvartal'].includes(column.type) && !isOpenColumn(column) && column?.mods?.readonly !== true;
  }

  function isEditableDropdownColumn(column) {
    const dropdown = APP_CONFIG.dropdowns?.[column.type];
    return !!dropdown?.options?.length && !isOpenColumn(column) && column?.mods?.readonly !== true;
  }

  function getDropdownOptionLabel(value) {
    return String(value ?? '').toLocaleUpperCase('sv-SE');
  }

  function normalizeSupplierDropdownValue(value) {
    const raw = String(value ?? '').trim();
    const normalized = raw.toLocaleLowerCase('sv-SE');
    if (normalized === 'anis' || normalized === 'anisa') return 'Anisa';
    if (normalized === 'dream home') return 'Dream Home';
    if (normalized === 'iera living') return 'Iera Living';
    if (normalized === 'khanna') return 'Khanna';
    if (normalized === 'texti alpacca' || normalized === 'texti alpaca') return 'Texti Alpacca';
    return raw;
  }

  function normalizeDropdownCellValue(column, value) {
    if (column?.type === 'dropdown_saljintro_vecka') return formatWeekValue(value);
    if (column?.type === 'dropdown_saljintro_kvartal') return formatQuarterValue(value);
    if (column?.type === 'dropdown_dev_syfte' || column?.type === 'dropdown_pre_dev_kategori') return normalizeSupplierDropdownValue(value);
    return String(value ?? '');
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
    const archivePayload = {
      source_table: digProdConfig.dbTable,
      source_row_id: digRow.id,
      payload_json: digRow,
      archive_reason: archiveReason,
      note: `Arkiverad automatiskt från SÄLJINTRO: ${saljintroRow?.produkt || ''}`,
    };

    const { error: insertError } = await supabase
      .from('planning_archive')
      .insert(archivePayload);

    if (insertError) {
      throw new Error(insertError.message || `Kunde inte lägga DIG PROD-rad ${digRow.id} i Arkiv.`);
    }

    const { error: deleteError } = await supabase
      .from(digProdConfig.dbTable)
      .delete()
      .eq('id', digRow.id);

    if (deleteError) {
      throw new Error(deleteError.message || `Kunde inte ta bort DIG PROD-rad ${digRow.id} efter arkivering.`);
    }
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

      const { error } = await supabase.rpc('planning_archive_row', {
        p_source_table: saljintroConfig.dbTable,
        p_row_id: row.id,
        p_mark_done: true,
        p_archive_reason: 'archived',
        p_note: null,
      });

      if (error) {
        throw new Error(error.message || 'Kunde inte arkivera Säljintro-raden.');
      }

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

  async function deleteDigProdRowsForSaljintroRow(saljintroRow) {
    const digProdEntry = tableEntries.find(([name]) => name === 'DIG PROD');
    if (!digProdEntry) return [];

    const [, digProdConfig] = digProdEntry;
    const rowsToDelete = getDigProdRowsForSaljintroRow(saljintroRow);
    const deletedIds = [];

    for (const digRow of rowsToDelete) {
      if (!digRow?.id) continue;

      await deleteRelatedRecordsForSource(digProdConfig.dbTable, digRow.id);

      const { error } = await supabase
        .from(digProdConfig.dbTable)
        .delete()
        .eq('id', digRow.id);

      if (error) {
        throw new Error(error.message || `Kunde inte ta bort kopplad DIG PROD-rad ${digRow.id}.`);
      }

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
      await deleteRelatedRecordsForSource(saljintroConfig.dbTable, row.id);

      const { error } = await supabase
        .from(saljintroConfig.dbTable)
        .delete()
        .eq('id', row.id);

      if (error) {
        throw new Error(error.message || 'Kunde inte ta bort Säljintro-raden.');
      }

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

    const { error } = await supabase.rpc('planning_archive_row', {
      p_source_table: sourceTable,
      p_row_id: utvecklingRow.id,
      p_mark_done: true,
      p_archive_reason: 'promoted_to_saljintro',
      p_note: 'Skapad i SÄLJINTRO från Design.',
    });

    if (error) {
      throw new Error(error.message || 'Kunde inte arkivera Design-raden.');
    }

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
    return finalRow;
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
    if (isEditableDropdownColumn(column)) normalizedNextValue = normalizeDropdownCellValue(column, nextValue);
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

    if (tableConfig.dbTable === 'saljintro' && column.field === 'produkt') {
      try {
        await syncDigProdProductNameFromSaljintro(currentValue, normalizedNextValue);
      } catch (syncErr) {
        alert(`SÄLJINTRO sparades, men DIG PROD kunde inte uppdateras: ${syncErr.message}`);
      }
    }

    if (tableConfig.dbTable === 'saljintro' && column.field === 'beskrivning_status') {
      try {
        await syncDigProdDescriptionFromSaljintro(row);
      } catch (syncErr) {
        alert(`SÄLJINTRO sparades, men DIG PROD-beskrivning kunde inte uppdateras: ${syncErr.message}`);
      }
    }

    render();
    return true;
  }

  async function toggleStatusCell(tableConfig, row, column) {
    if (column.lockManualStatus) return;

    const current = normalizeStatusValue(row[column.field]);
    const currentIndex = STATUS_ORDER.indexOf(current);
    const nextValue = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length];
    const saved = await saveCellValue(tableConfig, row, column, nextValue);

    if (saved && tableConfig.dbTable === 'dig_prod' && column.field === 'klart') {
      try {
        await syncSaljintroReadyFromDigProd(row);
        render();
      } catch (syncErr) {
        alert(`DIG PROD sparades, men SÄLJINTRO kunde inte speglas: ${syncErr.message}`);
      }
    }
  }

  async function saveStatusDateCell(tableConfig, row, column, nextDateValue, targetDateField = null) {
    const dateField = String(targetDateField || column?.renderFromField || '').trim();
    if (!dateField || !row?.id) return;

    const nextDate = String(nextDateValue || '').trim();
    const previousDate = row[dateField] ?? '';
    if (String(previousDate || '').slice(0, 10) === nextDate) return;

    state.savingCell = getCellKey(row, column);
    row[dateField] = nextDate;
    render();

    const { error } = await supabase
      .from(tableConfig.dbTable)
      .update({ [dateField]: nextDate || null })
      .eq('id', row.id);

    state.savingCell = null;

    if (error) {
      row[dateField] = previousDate;
      alert(`Kunde inte spara datum: ${error.message}`);
      render();
      return;
    }

    if (tableConfig.dbTable === 'saljintro' && (dateField === 'po_beslut_slut_datum' || dateField === 'po_lager_slut_datum')) {
      // Modell A: DIG PROD/Klart lagrar inte eget datum.
      // Veckan speglas från SÄLJINTRO vid rendering, men vi säkerställer samtidigt
      // att DIG PROD-radernas produkt-/kategorikoppling är reparerad innan render.
      try {
        await repairDigProdLinksFromSaljintro();
      } catch (syncErr) {
        console.warn('Could not ensure DIG PROD links after SÄLJINTRO date change:', syncErr.message);
      }
      render();
      return;
    }

    render();
  }

  async function saveStatusWeekValue(tableConfig, row, column, nextWeekValue, targetWeekField = null) {
    const weekField = String(targetWeekField || column?.weekValueField || '').trim();
    if (!weekField || !row?.id) return;

    const nextWeek = formatWeekValue(nextWeekValue);
    const previousWeek = row[weekField] ?? '';
    if (formatWeekValue(previousWeek) === nextWeek) return;

    state.savingCell = getCellKey(row, column);
    row[weekField] = nextWeek;
    render();

    const { error } = await supabase
      .from(tableConfig.dbTable)
      .update({ [weekField]: nextWeek || '--' })
      .eq('id', row.id);

    state.savingCell = null;

    if (error) {
      row[weekField] = previousWeek;
      alert(`Kunde inte spara vecka: ${error.message}`);
      render();
      return;
    }

    render();
  }

  async function editStatusDateCell(tableConfig, row, column) {
    const dateField = String(column?.renderFromField || '').trim();
    if (!dateField || !row?.id) return;

    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'visually-hidden-date-input';
    input.value = getDateInputValue(row[dateField]);

    let handled = false;

    const cleanup = () => {
      window.setTimeout(() => {
        if (input.parentNode) input.parentNode.removeChild(input);
      }, 0);
    };

    const saveDate = async () => {
      if (handled) return;
      handled = true;
      const nextDate = String(input.value || '').trim();
      cleanup();
      await saveStatusDateCell(tableConfig, row, column, nextDate);
    };

    input.addEventListener('change', saveDate);
    input.addEventListener('blur', cleanup);

    document.body.appendChild(input);
    input.focus({ preventScroll: true });

    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
      } catch (err) {
        input.click();
      }
    } else {
      input.click();
    }
  }

  function getStatusLabel(column) {
    return column.statusLabel || column.name || 'Status';
  }

  function getStatusClass(value) {
    return `status-button status-button--${normalizeStatusValue(value)}`;
  }


  function createStatusButton(column, value, isDetail = false, row = null) {
    const renderedValue = column.renderFromField && row
      ? String(row?.[column.renderFromField] || '').trim()
      : '';
    const renderedToValue = column.renderToField && row
      ? String(row?.[column.renderToField] || '').trim()
      : '';

    if (column.weekFromSaljintro && row) {
      const statusShell = document.createElement('span');
      statusShell.className = `${getStatusClass(value)} status-button--week status-button--week-value${isDetail ? ' status-button--detail' : ''}`;
      statusShell.setAttribute('role', 'button');
      statusShell.setAttribute('tabindex', '0');
      statusShell.title = `${column.name}: klicka för att byta status, vecka speglas från SÄLJINTRO`;

      const weekLabel = getDigProdKlartWeekValue(row);
      const displayLabel = weekLabel && weekLabel !== '--' ? weekLabel.toUpperCase() : '--';
      statusShell.setAttribute('aria-label', `${column.name}: ${displayLabel}, status ${normalizeStatusValue(value)}`);

      const wrap = document.createElement('span');
      wrap.className = 'status-week-cell status-week-cell--single-readonly';

      const label = document.createElement('span');
      label.className = 'status-week-cell__readonly-label';
      label.textContent = displayLabel;
      wrap.appendChild(label);
      statusShell.appendChild(wrap);
      return statusShell;
    }

    if (column.dateDisplayMode === 'weekReadonly' && column.renderFromField && row) {
      const statusShell = document.createElement('span');
      statusShell.className = `${getStatusClass(value)} status-button--week status-button--week-value${isDetail ? ' status-button--detail' : ''}`;
      statusShell.setAttribute('role', 'button');
      statusShell.setAttribute('tabindex', '0');
      statusShell.title = column.lockManualStatus
        ? `${column.name}: vecka speglas från ${column.renderFromField}, status speglas från DIG PROD`
        : `${column.name}: klicka för att byta status, vecka speglas från ${column.renderFromField}`;

      const dateValue = String(row?.[column.renderFromField] || '').trim();
      const weekLabel = formatWeekFromDateValue(dateValue) || '--';
      const displayLabel = weekLabel && weekLabel !== '--' ? weekLabel.toUpperCase() : '--';
      statusShell.setAttribute('aria-label', `${column.name}: ${displayLabel}, status ${normalizeStatusValue(value)}`);

      const wrap = document.createElement('span');
      wrap.className = 'status-week-cell status-week-cell--single-readonly';

      const label = document.createElement('span');
      label.className = 'status-week-cell__readonly-label';
      label.textContent = displayLabel;
      wrap.appendChild(label);
      statusShell.appendChild(wrap);
      return statusShell;
    }

    if (column.weekValueField && row) {
      const statusShell = document.createElement('span');
      statusShell.className = `${getStatusClass(value)} status-button--week status-button--week-value${isDetail ? ' status-button--detail' : ''}`;
      statusShell.setAttribute('role', 'button');
      statusShell.setAttribute('tabindex', '0');
      statusShell.title = column.lockManualStatus
        ? `${column.name}: status speglas från DIG PROD, vecka från ${column.weekValueField}`
        : `${column.name}: klicka för att byta status`;

      const rawWeek = row?.[column.weekValueField];
      const weekLabel = formatWeekValue(rawWeek);
      const displayLabel = weekLabel && weekLabel !== '--' ? weekLabel.toUpperCase() : '--';
      statusShell.setAttribute('aria-label', `${column.name}: ${displayLabel}, status ${normalizeStatusValue(value)}`);

      const wrap = document.createElement('span');
      wrap.className = column.weekValueEditable
        ? 'status-week-cell status-week-cell--single-editable'
        : 'status-week-cell status-week-cell--single-readonly';

      if (column.weekValueEditable) {
        const select = document.createElement('select');
        select.className = 'status-week-cell__week-select';
        select.dataset.statusWeekField = column.weekValueField;
        select.setAttribute('aria-label', `${column.name}: välj vecka`);
        select.title = `${column.name}: välj vecka`;
        select.style.border = '0';
        select.style.borderRadius = '999px';
        select.style.background = 'rgba(255,255,255,0.45)';
        select.style.color = 'currentColor';
        select.style.font = 'inherit';
        select.style.fontSize = '12px';
        select.style.fontWeight = '700';
        select.style.textAlign = 'center';
        select.style.textAlignLast = 'center';
        select.style.minWidth = '4.5em';
        select.style.padding = '2px 4px';
        select.style.cursor = 'pointer';

        const dropdownName = column.weekValueDropdown || 'dropdown_saljintro_vecka';
        const options = APP_CONFIG.dropdowns?.[dropdownName]?.options || ['--'];
        const normalizedWeek = formatWeekValue(rawWeek);
        const values = options.includes(normalizedWeek) ? options : [normalizedWeek, ...options];

        values.forEach((optionValue) => {
          const option = document.createElement('option');
          option.value = optionValue;
          option.textContent = String(optionValue || '--').toLocaleUpperCase('sv-SE');
          if (optionValue === normalizedWeek) option.selected = true;
          select.appendChild(option);
        });

        wrap.appendChild(select);
      } else {
        const label = document.createElement('span');
        label.className = 'status-week-cell__readonly-label';
        label.textContent = displayLabel;
        wrap.appendChild(label);
      }

      statusShell.appendChild(wrap);
      return statusShell;
    }

    if (column.renderFromField && (column.dateDisplayMode === 'week' || column.dateDisplayMode === 'weekRange' || state.activeTableName === 'SÄLJINTRO')) {
      const statusShell = document.createElement('span');
      const isRange = !!column.renderToField;
      statusShell.className = `${getStatusClass(value)} status-button--week${isRange ? ' status-button--week-range' : ''}${isDetail ? ' status-button--detail' : ''}`;
      statusShell.setAttribute('role', 'button');
      statusShell.setAttribute('tabindex', '0');
      statusShell.title = isRange
        ? `${column.name}: klicka i mitten för att byta status, klicka vänster/höger vecka för datum`
        : `${column.name}: klicka utanför veckan för att byta status, klicka på veckan för datum`;

      const fromLabel = formatWeekFromDateValue(renderedValue) || '📅';
      const toLabel = formatWeekFromDateValue(renderedToValue) || '📅';
      statusShell.setAttribute('aria-label', isRange
        ? `${column.name}: byt status (${normalizeStatusValue(value)}), från ${fromLabel}, till ${toLabel}`
        : `${column.name}: byt status (${normalizeStatusValue(value)}), datum ${fromLabel}`
      );

      const wrap = document.createElement('span');
      wrap.className = isRange ? 'status-week-cell status-week-cell--range' : 'status-week-cell';

      const createDateTrigger = (dateValue, dateField, sideLabel) => {
        const trigger = document.createElement('span');
        trigger.className = dateValue
          ? 'status-week-cell__date-trigger'
          : 'status-week-cell__date-trigger status-week-cell__date-trigger--empty';
        if (isRange) trigger.classList.add(`status-week-cell__date-trigger--${sideLabel}`);
        trigger.title = dateValue ? `Ändra ${sideLabel === 'from' ? 'från' : 'till'}-datum` : `Välj ${sideLabel === 'from' ? 'från' : 'till'}-datum`;
        trigger.setAttribute('aria-label', `${column.name}: ${dateValue ? 'ändra' : 'välj'} ${sideLabel === 'from' ? 'från' : 'till'}-datum`);

        const label = document.createElement('span');
        label.className = 'status-week-cell__date-label';
        label.textContent = formatWeekFromDateValue(dateValue) || '📅';

        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.className = 'status-week-cell__date-input';
        dateInput.value = getDateInputValue(dateValue);
        dateInput.dataset.statusDateField = dateField;
        dateInput.setAttribute('aria-label', `${column.name}: ${dateValue ? 'ändra' : 'välj'} ${sideLabel === 'from' ? 'från' : 'till'}-datum`);
        dateInput.title = dateValue ? 'Ändra datum' : 'Välj datum';

        trigger.appendChild(label);
        trigger.appendChild(dateInput);
        return trigger;
      };

      wrap.appendChild(createDateTrigger(renderedValue, column.renderFromField, 'from'));
      if (isRange) {
        const rangeSeparator = document.createElement('span');
        rangeSeparator.className = 'status-week-cell__range-separator';
        rangeSeparator.textContent = '–';
        wrap.appendChild(rangeSeparator);
        wrap.appendChild(createDateTrigger(renderedToValue, column.renderToField, 'to'));
      }

      statusShell.appendChild(wrap);
      return statusShell;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${getStatusClass(value)}${isDetail ? ' status-button--detail' : ''}`;
    button.setAttribute('aria-label', `${column.name}: ${getStatusLabel(column)} (${normalizeStatusValue(value)})`);

    const label = document.createElement('span');
    label.className = 'status-button__label';
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

  function createInlineRowActions(tableName, tableConfig, row) {
    const wrap = document.createElement('div');
    wrap.className = 'row-actions row-actions--inline';

    if (!row?.id || isVirtualModalTodoRow(row)) return wrap;

    const makeButton = ({ label, title, className = 'row-actions__button', action }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = label;
      if (title) button.title = title;
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await action();
      });
      return button;
    };

    if (tableName === 'PRE DEV') {
      wrap.appendChild(makeButton({
        label: 'Arkiv',
        title: 'Lägg raden i Arkiv',
        action: async () => runRowAction(tableName, tableConfig, row, 'archive'),
      }));
      wrap.appendChild(makeButton({
        label: 'Design',
        title: 'Skapa rad i Design och lägg denna rad i Arkiv',
        action: async () => runRowAction(tableName, tableConfig, row, 'promote_pre_dev'),
      }));
      wrap.appendChild(makeButton({
        label: '🗑',
        title: 'Ta bort raden',
        className: 'row-actions__button row-actions__button--danger',
        action: async () => runRowAction(tableName, tableConfig, row, 'delete'),
      }));
      return wrap;
    }

    if (tableName === 'UTVECKLING') {
      wrap.appendChild(makeButton({
        label: 'Arkiv',
        title: 'Lägg raden i Arkiv',
        action: async () => runRowAction(tableName, tableConfig, row, 'archive'),
      }));
      wrap.appendChild(makeButton({
        label: 'Säljintro',
        title: 'Skapa rad i Säljintro och lägg denna rad i Arkiv',
        action: async () => createSaljintroFromUtveckling(row),
      }));
      wrap.appendChild(makeButton({
        label: '🗑',
        title: 'Ta bort raden',
        className: 'row-actions__button row-actions__button--danger',
        action: async () => runRowAction(tableName, tableConfig, row, 'delete'),
      }));
      return wrap;
    }



    if (tableName === 'INKÖP' || tableName === 'MARKNAD' || tableName === 'SÄLJ') {
      wrap.appendChild(makeButton({
        label: '🗑',
        title: 'Ta bort raden',
        className: 'row-actions__button row-actions__button--danger',
        action: async () => runRowAction(tableName, tableConfig, row, 'delete'),
      }));
      return wrap;
    }


    if (tableName === 'SÄLJINTRO') {
      wrap.appendChild(makeButton({
        label: 'Arkiv',
        title: 'Lägg Säljintro-raden i Arkiv och arkivera kopplade DIG PROD-rader',
        action: async () => archiveSaljintroRowWithDigProd(row),
      }));
      wrap.appendChild(makeButton({
        label: '🗑',
        title: 'Ta bort Säljintro-raden och arkivera kopplade DIG PROD-rader',
        className: 'row-actions__button row-actions__button--danger',
        action: async () => deleteSaljintroRowWithDigProdArchive(row),
      }));
      return wrap;
    }
    return wrap;
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

    if (isActionsColumn(column)) {
      const active = getActiveConfig();
      const [, tableConfig] = active || [];
      return createInlineRowActions(state.activeTableName, tableConfig, row);
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
      const displayValue = normalizeDropdownCellValue(column, text);
      chip.textContent = displayValue || '—';
      return maybeWrapOwnerContent(chip);
    }

    const span = document.createElement('span');
    let className = text ? 'cell-text' : 'cell-text cell-text--muted';
    if (isMultilineTextColumn(column)) className += ' cell-text--multiline';
    span.className = className;
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
    const isMultiline = isMultilineTextColumn(column);
    const input = document.createElement(isMultiline ? 'textarea' : 'input');
    input.className = isMultiline ? 'cell-editor cell-editor--textarea' : 'cell-editor';
    if (!isMultiline) input.type = 'text';
    input.value = row[column.field] ?? '';

    const commit = async () => {
      await saveCellValue(tableConfig, row, column, input.value);
    };

    input.addEventListener('keydown', async (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        state.editingCell = null;
        render();
        return;
      }

      if (!isMultiline && event.key === 'Enter') {
        event.preventDefault();
        await commit();
        return;
      }

      if (isMultiline && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        await commit();
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

    const currentValue = normalizeDropdownCellValue(column, row[column.field]);
    let committing = false;

    dropdown.options.forEach((option) => {
      const opt = document.createElement('option');
      opt.value = option;
      opt.textContent = getDropdownOptionLabel(option);
      if (currentValue === normalizeDropdownCellValue(column, option)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    select.value = currentValue;

    const commit = async () => {
      if (committing) return;
      committing = true;
      await saveCellValue(tableConfig, row, column, select.value);
      committing = false;
    };

    select.addEventListener('change', commit);
    select.addEventListener('blur', async () => {
      if (state.editingCell && !committing) {
        await commit();
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
        opt.textContent = getDropdownOptionLabel(option);
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
        opt.textContent = getDropdownOptionLabel(option);
        if (formatQuarterValue(row[column.field]) === option) {
          opt.selected = true;
        }
        control.appendChild(opt);
      });
    } else if (dropdown?.options?.length) {
      control = document.createElement('select');
      control.className = 'detail-field__control';
      const currentDropdownValue = normalizeDropdownCellValue(column, row[column.field]);
      dropdown.options.forEach((option) => {
        const opt = document.createElement('option');
        opt.value = option;
        opt.textContent = getDropdownOptionLabel(option);
        if (currentDropdownValue === option) {
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
    if (tableName === 'PROJEKT') return 'project_name';
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

  function formatArchiveWeekKey(item) {
    const raw = String(item?.week_key || '').trim();
    if (raw) {
      const match = raw.match(/^(\d{4})[- ]?W?(\d{1,2})$/i);
      if (match) return `${match[1]}-W${String(match[2]).padStart(2, '0')}`;
      return raw;
    }

    const payload = item?.payload_json || {};
    const fallbackValue = payload.klart_datum || item?.archived_at || payload.updated_at || payload.created_at;
    const date = new Date(fallbackValue);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getUTCFullYear()}-W${String(getISOWeekNumber(date)).padStart(2, '0')}`;
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
        const titleText = String(payload[titleField] || 'Arkiverad rad').trim();

        if (tableName === 'TODO') {
          const row = document.createElement('div');
          row.className = 'archive-todo-row';

          const title = document.createElement('span');
          title.className = 'archive-todo-row__title';
          title.textContent = titleText;

          const week = document.createElement('span');
          week.className = 'archive-todo-row__week';
          const weekKey = formatArchiveWeekKey(item);
          week.textContent = weekKey ? `Vecka: ${weekKey}` : 'Vecka: --';

          row.appendChild(title);
          row.appendChild(week);
          card.appendChild(row);
          list.appendChild(card);
          return;
        }

        const title = document.createElement('h3');
        title.className = 'detail-card__title';
        title.textContent = titleText;

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
          const { signOutUser } = await import('./auth.js?v=178');
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

  function createStatisticsView() {
    const shell = document.createElement('section');
    shell.className = 'statistics-view';

    const renderStatistics = window.USP?.Statistics?.render || window.renderStatisticsView;
    if (typeof renderStatistics !== 'function') {
      const message = document.createElement('p');
      message.className = 'empty-state';
      message.textContent = 'Kunde inte ladda statistikvyn.';
      shell.appendChild(message);
      return shell;
    }

    void renderStatistics(state, shell);
    return shell;
  }


  const SORTABLE_VIRTUAL_TYPES = new Set(['ui_open', 'ui_notes', 'ui_todo', 'ui_actions']);

  function isSortableColumn(column) {
    if (!column || !column.field) return false;
    if (String(column.field).startsWith('__')) return false;
    if (SORTABLE_VIRTUAL_TYPES.has(column.type)) return false;
    if (column.sortable === false) return false;
    return true;
  }

  function getSortState(tableName) {
    return state.sortByTable?.[tableName] || null;
  }

  function cycleSort(tableName, column) {
    if (!isSortableColumn(column)) return;
    if (!state.sortByTable) state.sortByTable = {};

    const current = state.sortByTable[tableName];
    if (!current || current.field !== column.field) {
      state.sortByTable[tableName] = { field: column.field, direction: 'asc' };
    } else if (current.direction === 'asc') {
      state.sortByTable[tableName] = { field: column.field, direction: 'desc' };
    } else {
      delete state.sortByTable[tableName];
    }

    render();
  }

  function normalizeSortText(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function parseSortDate(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '--' || raw === '-- -- --') return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }

  function parseSortWeek(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '--') return null;
    const yearWeek = raw.match(/^(\d{2,4})[- ]?w?\s*v?(\d{1,2})$/i);
    if (yearWeek) {
      const year = Number(yearWeek[1].length === 2 ? `20${yearWeek[1]}` : yearWeek[1]);
      return year * 100 + Number(yearWeek[2]);
    }
    const week = raw.match(/^v?(\d{1,2})$/i);
    return week ? Number(week[1]) : null;
  }

  function parseSortQuarter(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '--') return null;
    const match = raw.match(/^(?:(\d{2,4})[- ]?)?q(\d)$/i);
    if (!match) return null;
    const year = match[1] ? Number(match[1].length === 2 ? `20${match[1]}` : match[1]) : 0;
    return year * 10 + Number(match[2]);
  }

  function getSortValue(row, column) {
    if (!row || !column) return '';

    if (column.type === 'status') {
      const statusIndex = STATUS_ORDER.indexOf(String(row[column.field] ?? '').toLowerCase());
      const statusValue = statusIndex >= 0 ? statusIndex : 0;
      const dateValue = parseSortDate(row[column.renderToField]) ?? parseSortDate(row[column.renderFromField]);
      return { kind: 'status', value: statusValue, secondary: dateValue ?? 0 };
    }

    if (column.type === 'date') {
      return { kind: 'number', value: parseSortDate(row[column.field]) ?? Number.POSITIVE_INFINITY };
    }

    if (column.type === 'veckonummer') {
      return { kind: 'number', value: parseSortWeek(row[column.field]) ?? Number.POSITIVE_INFINITY };
    }

    if (column.type === 'kvartal') {
      return { kind: 'number', value: parseSortQuarter(row[column.field]) ?? Number.POSITIVE_INFINITY };
    }

    const weekValue = parseSortWeek(row[column.field]);
    if (weekValue !== null && /^v?\d{1,2}$/i.test(String(row[column.field] ?? '').trim())) {
      return { kind: 'number', value: weekValue };
    }

    return { kind: 'text', value: normalizeSortText(row[column.field]) };
  }

  function compareSortValues(a, b) {
    if (a?.kind === 'status' || b?.kind === 'status') {
      const primary = (a?.value ?? 0) - (b?.value ?? 0);
      if (primary !== 0) return primary;
      return (a?.secondary ?? 0) - (b?.secondary ?? 0);
    }

    if (a?.kind === 'number' || b?.kind === 'number') {
      return (a?.value ?? Number.POSITIVE_INFINITY) - (b?.value ?? Number.POSITIVE_INFINITY);
    }

    return String(a?.value ?? '').localeCompare(String(b?.value ?? ''), 'sv', { numeric: true, sensitivity: 'base' });
  }

  function getFilteredRows(tableName, tableConfig) {
    const rows = getFilteredRowsBase(tableName, tableConfig);
    const sort = getSortState(tableName);
    if (!sort?.field) return rows;

    const column = getVisibleColumns(tableConfig).find((item) => item.field === sort.field);
    if (!isSortableColumn(column)) return rows;

    const direction = sort.direction === 'desc' ? -1 : 1;
    return [...rows].sort((rowA, rowB) => {
      const compared = compareSortValues(getSortValue(rowA, column), getSortValue(rowB, column));
      return compared * direction;
    });
  }

  function enhanceSortableHeaders() {
    const active = getActiveConfig();
    if (!active) return;
    const [tableName, tableConfig] = active;
    if (tableConfig.customView || tableName === 'PROJEKT') return;

    const table = app.querySelector('.data-table');
    if (!table) return;

    const visibleColumns = getVisibleColumns(tableConfig);
    const currentSort = getSortState(tableName);
    table.querySelectorAll('thead th').forEach((th, index) => {
      const column = visibleColumns[index];
      if (!isSortableColumn(column)) return;

      th.classList.add('is-sortable');
      th.title = 'Klicka för att sortera';

      const label = th.querySelector('.column-header__label');
      if (label && !label.dataset.baseText) label.dataset.baseText = label.textContent || column.name || '';
      if (label) {
        const baseText = label.dataset.baseText || column.name || '';
        const indicator = currentSort?.field === column.field
          ? (currentSort.direction === 'desc' ? ' ↓' : ' ↑')
          : '';
        label.textContent = `${baseText}${indicator}`;
      }

      th.addEventListener('click', (event) => {
        if (event.target?.closest?.('button,a,input,select,textarea')) return;
        cycleSort(tableName, column);
      });
    });
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
    enhanceSortableHeaders,
    createCustomView: (tableName) => {
      if (tableName === 'PROJEKT') return projectsController.createView();
      if (tableName === 'STATISTICS') return createStatisticsView();
      return null;
    },
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
    editStatusDateCell,
    saveStatusDateCell,
    saveStatusWeekValue,
    toggleTodoDone,
    startEditing,
  });

  async function render() {
    const result = await renderController.render();
    enhanceSortableHeaders();
    return result;
  }

  settingsButton?.addEventListener('click', () => {
    openSettingsMenu();
  });

  await Promise.all(
    tableEntries.filter(([, tableConfig]) => !!tableConfig.dbTable && !tableConfig.customView).map(([tableName, tableConfig]) => loadTableRowsFromData(state, tableName, tableConfig))
  );
  await repairDigProdLinksFromSaljintro();
  await syncAllSaljintroReadyFromDigProd();
  async function runWeeklyArchiveCleanup() {
    const archivedTodoRows = await archiveCompletedTodosFromPreviousWeeks();
    const archivedOperationalRows = await archiveGreenOperationalRowsFromPreviousWeeks();
    return archivedTodoRows || archivedOperationalRows;
  }

  await runWeeklyArchiveCleanup();
  window.setInterval(() => {
    void runWeeklyArchiveCleanup().then((archived) => {
      if (archived) render();
    });
  }, 30 * 60 * 1000);
  await loadDocumentLinks();
  await loadColumnChecklists();
  await loadLinks();
  await loadPlanningUsers();
  await loadMessages();
  await loadModalTodoRows();
  await projectsController.loadProjects();
  if (state.activeTableName) {
    await loadUnreadCountsForTable(state.activeTableName);
  }

  render();
}
