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
} from './app_constants.js?v=254';
import { createTodoController } from './app_todo.js?v=254';
import { createRowTodoController } from './app_row_todo.js?v=254';
import { createNotesController } from './app_notes.js?v=254';
import { createSettingsController } from './app_settings.js?v=279';
import { createMessagesController } from './app_messages.js?v=254';
import { createRenderController } from './app_render.js?v=254';
import { createDataController } from './app_data.js?v=254';
import { createActionController } from './app_actions.js?v=254';
import { createFilterController } from './app_filters.js?v=254';
import { createColumnToolsController } from './app_column_tools.js?v=254';
import { createExcelPlanController } from './app_excel_plan.js?v=254';
import { createProjectsController } from './app_projects.js?v=254';
import { createWorkflowController } from './app_workflows.js?v=254';
import { createArchiveController } from './app_archive.js?v=259';
import './app_statistics.js?v=254';

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
  const cdmpIndex = tableEntries.findIndex(([tableName]) => tableName === 'CDMP');
  const cdmpEntry = cdmpIndex >= 0 ? tableEntries.splice(cdmpIndex, 1)[0] : null;
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
    ...(cdmpEntry ? [cdmpEntry] : []),
    ...(inkopEntry ? [inkopEntry] : []),
    ...(marknadEntry ? [marknadEntry] : []),
    ...(saljEntry ? [saljEntry] : []),
  ];

  if (insertIndex >= 0) {
    tableEntries.splice(insertIndex + 1, 0, ...orderedEntries);
  } else {
    tableEntries.push(...orderedEntries);
  }

  const isAdmin = () => {
    const user = window.CurrentUser || {};
    const role = String(user.role || user.user_role || '').trim().toLowerCase();
    return (
      user.isAdmin === true ||
      user.is_admin === true ||
      user.admin === true ||
      role === 'admin' ||
      role === 'administrator' ||
      role === 'superadmin'
    );
  };

  let activeFloatingActionMenu = null;

  function closeFloatingActionMenu() {
    if (!activeFloatingActionMenu) return;
    activeFloatingActionMenu.cleanup?.();
    activeFloatingActionMenu.node?.remove();
    activeFloatingActionMenu = null;
  }

  function openFloatingActionMenu(anchor, items = []) {
    closeFloatingActionMenu();
    if (!anchor || !items.length) return;

    const menu = document.createElement('div');
    menu.className = 'row-actions__floating-menu';
    menu.setAttribute('role', 'menu');

    items.forEach(({ label, title, danger = false, action }) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `row-actions__floating-menu-item${danger ? ' row-actions__floating-menu-item--danger' : ''}`;
      item.textContent = label;
      item.setAttribute('role', 'menuitem');
      if (title) item.title = title;
      item.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeFloatingActionMenu();
        await action();
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);

    const placeMenu = () => {
      const rect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const margin = 8;
      const left = Math.max(margin, Math.min(window.innerWidth - menuRect.width - margin, rect.right - menuRect.width));
      let top = rect.bottom + 6;
      if (top + menuRect.height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - menuRect.height - 6);
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    };

    placeMenu();

    const onPointerDown = (event) => {
      if (menu.contains(event.target) || anchor.contains(event.target)) return;
      closeFloatingActionMenu();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeFloatingActionMenu();
    };
    const cleanup = () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', closeFloatingActionMenu, true);
      window.removeEventListener('scroll', closeFloatingActionMenu, true);
    };

    activeFloatingActionMenu = { node: menu, cleanup };
    setTimeout(() => document.addEventListener('pointerdown', onPointerDown, true), 0);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', closeFloatingActionMenu, true);
    window.addEventListener('scroll', closeFloatingActionMenu, true);
  }

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
    moodFilesByTable: {},
    moodPanelOpen: false,
    moodPanelTableName: '',
    moodLoading: false,
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
    cdmpProvmattorPanelOpen: false,
    cdmpProvmattorRowId: null,
    cdmpProvmattorRowsByCdmpId: {},
    cdmpProvmattorCountsByCdmpId: {},
    cdmpProvmattorLoading: false,
    digprodPlanPanelOpen: false,
    digprodPlanPanelMode: 'plan',
    digprodPlanRowId: null,
    lanseringsplanIntroSourceId: null,
    digprodPlanRowsBySourceId: {},
    digprodPlanCountsBySourceId: {},
    digprodPlanDeadlinesBySourceId: {},
    digprodPlanLoading: false,
    lanseringsplanTimeRules: {},
    lanseringsplanTimeRulesLoading: false,
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

  const archiveController = createArchiveController({ supabase });

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
    archiveController,
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
    archiveController,
  });
  const { getActionConfig, runRowAction } = actionController;

  const workflowController = createWorkflowController({
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
    deleteRelatedRecordsForSource: archiveController.deleteRelatedRecordsForSource,
    archiveController,
    loadModalTodoRows,
  });
  const {
    createDigProdRowsFromSaljintro,
    syncSaljintroReadyFromDigProd,
    syncDigProdProductNameFromSaljintro,
    syncDigProdDescriptionFromSaljintro,
    archiveSaljintroRowWithDigProd,
    deleteSaljintroRowWithDigProdArchive,
    syncAllSaljintroReadyFromDigProd,
    createSaljintroFromUtveckling,
  } = workflowController;

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

  function getActiveDigProdIntroCategory() {
    const value = String(state.filtersByTable?.['DIG PROD']?.kategori || 'B2B-intro').trim();
    return normalizeDigProdIntroCategory(value) || 'B2B-intro';
  }

  function isColumnVisibleForActiveDigProdCategory(column) {
    if (state.activeTableName !== 'DIG PROD') return true;
    const categories = Array.isArray(column?.digprodCategories) ? column.digprodCategories : null;
    if (!categories || !categories.length) return true;
    return categories.includes(getActiveDigProdIntroCategory());
  }

  function getVisibleColumns(tableConfig) {
    const hiddenRowTodoTables = ['PRE DEV', 'UTVECKLING', 'LANSERINGSPLAN', 'SÄLJINTRO', 'DIG PROD'];
    const tableName = state.activeTableName;
    const inlineOnlyTables = ['SÄLJINTRO', 'UTVECKLING', 'LANSERINGSPLAN', 'PRE DEV', 'DIG PROD', 'CDMP', 'INKÖP', 'MARKNAD', 'SÄLJ'];
    const inlineActionTables = ['TODO', 'PRE DEV', 'UTVECKLING', 'LANSERINGSPLAN', 'SÄLJINTRO', 'CDMP', 'INKÖP', 'MARKNAD', 'SÄLJ'];
    const utilityColumns = inlineOnlyTables.includes(tableName)
      ? []
      : [UI_OPEN_COLUMN, ...(tableName === TODO_TABLE ? [] : [UI_NOTES_COLUMN])];
    const columns = [
      ...tableConfig.columns.filter((column) => column.field !== 'id' && !column.hiddenInTable && column.field !== UI_TODO_COLUMN.field && column.type !== UI_TODO_COLUMN.type && isColumnVisibleForActiveDigProdCategory(column)),
      ...utilityColumns,
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

  const notesController = createNotesController({
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
  });
  const {
    loadUnreadCountsForTable,
    openNotesPanel,
    createNotesButton,
    createNotesPanel,
  } = notesController;

  const projectsController = createProjectsController({
    supabase,
    state,
    tableEntries,
    render,
    getCurrentUserInitials,
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

  const settingsController = createSettingsController({
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
  });
  const {
    openSettingsMenu,
    createSettingsPanel,
  } = settingsController;


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

  function normalizeMoodTableName(tableName) {
    const value = String(tableName || '').trim().toLocaleUpperCase('sv-SE');
    if (value === 'UTVECKLING' || value === 'DESIGN') return 'UTVECKLING';
    if (value === 'SÄLJINTRO' || value === 'SALJINTRO') return 'SÄLJINTRO';
    return value;
  }

  function isMoodEnabledTable(tableName) {
    const normalized = normalizeMoodTableName(tableName);
    return normalized === 'UTVECKLING' || normalized === 'SÄLJINTRO';
  }

  function getMoodViewLabel(tableName) {
    const normalized = normalizeMoodTableName(tableName);
    if (normalized === 'UTVECKLING') return 'Design';
    if (normalized === 'SÄLJINTRO') return 'Säljintro';
    return tableName || '';
  }

  function getMoodLinksForTable(tableName) {
    const normalized = normalizeMoodTableName(tableName);
    return state.moodFilesByTable?.[normalized] || [];
  }

  function getMoodLinkUrl(item) {
    return String(item?.storage_path || item?.url || '').trim();
  }

  function getMoodLinkName(item) {
    return String(item?.original_name || item?.name || '').trim();
  }

  function getNextMoodSlot(tableName) {
    const usedSlots = new Set(
      getMoodLinksForTable(tableName)
        .map((item) => Number(item.slot || 0))
        .filter((value) => Number.isInteger(value) && value > 0),
    );

    let nextSlot = 1;
    while (usedSlots.has(nextSlot)) nextSlot += 1;
    return nextSlot;
  }

  async function loadMoodFiles() {
    try {
      const { data, error } = await supabase
        .from('planning_mood_files')
        .select('*')
        .in('table_name', ['UTVECKLING', 'SÄLJINTRO'])
        .order('table_name', { ascending: true })
        .order('slot', { ascending: true });

      if (error) throw error;

      const grouped = {};
      (Array.isArray(data) ? data : []).forEach((item) => {
        const tableName = normalizeMoodTableName(item.table_name);
        if (!isMoodEnabledTable(tableName)) return;
        if (!grouped[tableName]) grouped[tableName] = [];
        grouped[tableName].push(item);
      });
      state.moodFilesByTable = grouped;
    } catch (err) {
      console.warn('Could not load Collections links:', err.message);
      state.moodFilesByTable = {};
    }
  }

  function mountMoodPanel() {
    const existingMoodPanel = document.querySelector('.side-panel-overlay[data-panel="mood"]');
    if (existingMoodPanel) existingMoodPanel.remove();

    if (!state.moodPanelOpen || !isMoodEnabledTable(state.moodPanelTableName)) return;

    const panel = createMoodPanel();
    if (!panel) return;
    panel.dataset.panel = 'mood';
    document.body.appendChild(panel);
  }

  function openMoodPanel(tableName) {
    try {
      const normalized = normalizeMoodTableName(tableName || getActiveMoodTableName?.());
      if (!isMoodEnabledTable(normalized)) return;
      state.moodPanelOpen = true;
      state.moodPanelTableName = normalized;
      state.linksPanelOpen = false;
      state.settingsPanelOpen = false;
      state.archivePanelOpen = false;
      state.notesPanelOpen = false;
      state.rowTodoPanelOpen = false;
      state.rowTodoRowId = null;
      state.detailRowId = null;

      mountMoodPanel();
      void loadMoodFiles().then(() => {
        if (state.moodPanelOpen && state.moodPanelTableName === normalized) mountMoodPanel();
      });
    } catch (err) {
      console.error('Could not open Collections panel:', err);
      alert(`Kunde inte öppna Collections: ${err?.message || err}`);
    }
  }

  window.TodoPlanningOpenMood = (tableName) => openMoodPanel(tableName || getActiveMoodTableName());

  function closeMoodPanel() {
    state.moodPanelOpen = false;
    state.moodPanelTableName = '';
    const existingMoodPanel = document.querySelector('.side-panel-overlay[data-panel="mood"]');
    if (existingMoodPanel) existingMoodPanel.remove();
  }

  function openMoodLink(item) {
    const url = getMoodLinkUrl(item);
    if (!url) return;
    if (getNormalizedExternalLink(url)) {
      openExternalLinkInNewWindow(url);
      return;
    }
    void openPdfDocument(url, { type: 'pdf' });
  }

  async function saveMoodLink(tableName, item, nextName, nextUrl) {
    if (!isAdmin()) {
      alert('Endast admin kan lägga till eller ändra Collections-länkar.');
      return false;
    }

    const normalized = normalizeMoodTableName(tableName);
    if (!isMoodEnabledTable(normalized)) return false;

    const name = String(nextName || '').trim();
    const url = String(nextUrl || '').trim();
    if (!name) {
      alert('Ange ett namn för länken.');
      return false;
    }
    if (!getNormalizedExternalLink(url)) {
      alert('Ange en giltig http/https-länk.');
      return false;
    }

    state.moodLoading = true;
    mountMoodPanel();

    try {
      const payload = {
        table_name: normalized,
        slot: Number(item?.slot || getNextMoodSlot(normalized)),
        original_name: name,
        storage_path: url,
        uploaded_by: window.CurrentUser?.email || window.CurrentUser?.initials || null,
        updated_at: new Date().toISOString(),
      };

      let response;
      if (item?.id) {
        response = await supabase
          .from('planning_mood_files')
          .update(payload)
          .eq('id', item.id);
      } else {
        response = await supabase
          .from('planning_mood_files')
          .upsert(payload, { onConflict: 'table_name,slot' });
      }

      if (response.error) throw response.error;
      await loadMoodFiles();
      return true;
    } catch (err) {
      alert(`Kunde inte spara Collections-länk: ${err.message}`);
      return false;
    } finally {
      state.moodLoading = false;
      mountMoodPanel();
    }
  }

  async function removeMoodLink(tableName, item) {
    if (!isAdmin()) {
      alert('Endast admin kan ta bort Collections-länkar.');
      return;
    }
    const normalized = normalizeMoodTableName(tableName);
    if (!item || !isMoodEnabledTable(normalized)) return;
    const confirmed = window.confirm('Ta bort Collections-länk?');
    if (!confirmed) return;

    state.moodLoading = true;
    mountMoodPanel();

    try {
      let query = supabase.from('planning_mood_files').delete();
      if (item.id) {
        query = query.eq('id', item.id);
      } else {
        query = query.eq('table_name', normalized).eq('slot', Number(item.slot));
      }
      const { error } = await query;
      if (error) throw error;
      await loadMoodFiles();
    } catch (err) {
      alert(`Kunde inte ta bort Collections-länk: ${err.message}`);
    } finally {
      state.moodLoading = false;
      mountMoodPanel();
    }
  }

  async function moveMoodLink(tableName, item, direction) {
    if (!isAdmin()) return;
    const normalized = normalizeMoodTableName(tableName);
    if (!item || !isMoodEnabledTable(normalized)) return;

    const links = getMoodLinksForTable(normalized)
      .slice()
      .sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0));
    const currentIndex = links.findIndex((link) => (
      item.id ? link.id === item.id : Number(link.slot) === Number(item.slot)
    ));
    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= links.length) return;

    const current = links[currentIndex];
    const target = links[targetIndex];
    const currentSlot = Number(current.slot || 0);
    const targetSlot = Number(target.slot || 0);
    if (!currentSlot || !targetSlot) return;

    const tempSlot = Math.max(...links.map((link) => Number(link.slot || 0)), 0) + 1000;

    state.moodLoading = true;
    mountMoodPanel();

    try {
      let first = supabase.from('planning_mood_files').update({ slot: tempSlot, updated_at: new Date().toISOString() });
      first = current.id ? first.eq('id', current.id) : first.eq('table_name', normalized).eq('slot', currentSlot);
      let response = await first;
      if (response.error) throw response.error;

      let second = supabase.from('planning_mood_files').update({ slot: currentSlot, updated_at: new Date().toISOString() });
      second = target.id ? second.eq('id', target.id) : second.eq('table_name', normalized).eq('slot', targetSlot);
      response = await second;
      if (response.error) throw response.error;

      let third = supabase.from('planning_mood_files').update({ slot: targetSlot, updated_at: new Date().toISOString() });
      third = current.id ? third.eq('id', current.id) : third.eq('table_name', normalized).eq('slot', tempSlot);
      response = await third;
      if (response.error) throw response.error;

      await loadMoodFiles();
    } catch (err) {
      alert(`Kunde inte sortera Collections-länkar: ${err.message}`);
    } finally {
      state.moodLoading = false;
      mountMoodPanel();
    }
  }

  function openMoodLinkModal(tableName, item = null) {
    if (!isAdmin()) return;
    const normalized = normalizeMoodTableName(tableName);
    if (!isMoodEnabledTable(normalized)) return;

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal mood-link-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });

    const dialog = document.createElement('div');
    dialog.className = 'overlay-modal__dialog';

    const panel = document.createElement('section');
    panel.className = 'side-panel mood-link-modal__panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'todo-modal__heading';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'side-panel__eyebrow';
    eyebrow.textContent = `Collections – ${getMoodViewLabel(normalized)}`;

    const title = document.createElement('h2');
    title.className = 'side-panel__title';
    title.textContent = item ? 'Ändra länk' : 'Lägg till länk';

    const help = document.createElement('p');
    help.className = 'side-panel__text';
    help.textContent = 'Ange namn och länkadress. Användare ser bara namnet.';

    titleWrap.appendChild(eyebrow);
    titleWrap.appendChild(title);
    titleWrap.appendChild(help);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => overlay.remove());

    header.appendChild(titleWrap);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    const nameField = document.createElement('label');
    nameField.className = 'detail-field';
    const nameLabel = document.createElement('span');
    nameLabel.className = 'detail-field__label';
    nameLabel.textContent = 'Namn';
    const nameInput = document.createElement('input');
    nameInput.className = 'detail-field__control';
    nameInput.type = 'text';
    nameInput.placeholder = 'Ex. Moodboard';
    nameInput.value = getMoodLinkName(item);
    nameField.appendChild(nameLabel);
    nameField.appendChild(nameInput);

    const urlField = document.createElement('label');
    urlField.className = 'detail-field';
    const urlLabel = document.createElement('span');
    urlLabel.className = 'detail-field__label';
    urlLabel.textContent = 'Länkadress';
    const urlInput = document.createElement('input');
    urlInput.className = 'detail-field__control';
    urlInput.type = 'url';
    urlInput.inputMode = 'url';
    urlInput.placeholder = 'https://...';
    urlInput.value = getMoodLinkUrl(item);
    urlField.appendChild(urlLabel);
    urlField.appendChild(urlInput);

    body.appendChild(nameField);
    body.appendChild(urlField);

    const footer = document.createElement('div');
    footer.className = 'side-panel__footer';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-button';
    saveButton.textContent = 'Spara';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'secondary-button';
    cancelButton.textContent = 'Avbryt';
    cancelButton.addEventListener('click', () => overlay.remove());

    const runSave = async () => {
      saveButton.disabled = true;
      cancelButton.disabled = true;
      const saved = await saveMoodLink(normalized, item, nameInput.value, urlInput.value);
      if (saved) {
        overlay.remove();
        return;
      }
      saveButton.disabled = false;
      cancelButton.disabled = false;
    };

    saveButton.addEventListener('click', runSave);
    [nameInput, urlInput].forEach((input) => {
      input.addEventListener('keydown', async (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          overlay.remove();
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          await runSave();
        }
      });
    });

    footer.appendChild(saveButton);
    footer.appendChild(cancelButton);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    dialog.appendChild(panel);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 0);
  }

  function createMoodPanel() {
    if (!state.moodPanelOpen || !isMoodEnabledTable(state.moodPanelTableName)) return null;

    const tableName = state.moodPanelTableName;
    const links = getMoodLinksForTable(tableName);
    const overlay = document.createElement('div');
    overlay.className = 'side-panel-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'flex-end';
    overlay.style.background = 'rgba(15, 23, 42, 0.28)';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeMoodPanel();
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel';
    dialog.style.width = 'min(520px, 96vw)';
    dialog.style.maxWidth = '96vw';
    dialog.style.height = '100%';
    dialog.style.overflow = 'auto';
    dialog.style.background = '#fff';
    dialog.style.boxShadow = '0 24px 80px rgba(15, 23, 42, 0.24)';
    dialog.style.padding = '24px';
    dialog.setAttribute('aria-label', `Collections ${getMoodViewLabel(tableName)}`);

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'todo-modal__heading';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'side-panel__eyebrow';
    eyebrow.textContent = 'Collections';

    const title = document.createElement('h2');
    title.className = 'side-panel__title';
    title.textContent = getMoodViewLabel(tableName);

    const help = document.createElement('p');
    help.className = 'side-panel__text';
    help.textContent = isAdmin()
      ? 'Lägg till eller hantera dokumentlänkar. Användare ser bara länkarnas namn.'
      : 'Öppna dokumentlänkar.';

    titleWrap.appendChild(eyebrow);
    titleWrap.appendChild(title);
    titleWrap.appendChild(help);
    header.appendChild(titleWrap);

    const headerActions = document.createElement('div');
    headerActions.className = 'side-panel__header-actions';

    if (isAdmin()) {
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'primary-button';
      addButton.disabled = state.moodLoading;
      addButton.textContent = '+ Lägg till';
      addButton.addEventListener('click', () => openMoodLinkModal(tableName));
      headerActions.appendChild(addButton);
    }

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Stäng Collections');
    closeButton.addEventListener('click', closeMoodPanel);
    headerActions.appendChild(closeButton);
    header.appendChild(headerActions);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    if (!links.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = isAdmin() ? 'Inga Collections-länkar ännu. Lägg till första länken.' : 'Inga Collections-länkar är publicerade ännu.';
      body.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'settings-list__rows mood-link-list';

      links.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'settings-list__row mood-link-row';

        const info = document.createElement('div');
        info.className = 'settings-list__info';

        const linkButton = document.createElement('button');
        linkButton.type = 'button';
        linkButton.className = 'message-card__row-link mood-link-row__name';
        linkButton.textContent = getMoodLinkName(item) || 'Namnlös länk';
        linkButton.title = 'Öppna länk i nytt fönster';
        linkButton.addEventListener('click', () => openMoodLink(item));
        info.appendChild(linkButton);

        row.appendChild(info);

        if (isAdmin()) {
          const actions = document.createElement('div');
          actions.className = 'settings-list__actions';

          const sortedLinks = links
            .slice()
            .sort((a, b) => Number(a.slot || 0) - Number(b.slot || 0));
          const rowIndex = sortedLinks.findIndex((link) => (
            item.id ? link.id === item.id : Number(link.slot) === Number(item.slot)
          ));

          const upButton = document.createElement('button');
          upButton.type = 'button';
          upButton.className = 'secondary-button';
          upButton.disabled = state.moodLoading || rowIndex <= 0;
          upButton.textContent = '↑';
          upButton.title = 'Flytta upp';
          upButton.setAttribute('aria-label', 'Flytta upp');
          upButton.addEventListener('click', () => moveMoodLink(tableName, item, 'up'));
          actions.appendChild(upButton);

          const downButton = document.createElement('button');
          downButton.type = 'button';
          downButton.className = 'secondary-button';
          downButton.disabled = state.moodLoading || rowIndex < 0 || rowIndex >= sortedLinks.length - 1;
          downButton.textContent = '↓';
          downButton.title = 'Flytta ned';
          downButton.setAttribute('aria-label', 'Flytta ned');
          downButton.addEventListener('click', () => moveMoodLink(tableName, item, 'down'));
          actions.appendChild(downButton);

          const editButton = document.createElement('button');
          editButton.type = 'button';
          editButton.className = 'secondary-button';
          editButton.disabled = state.moodLoading;
          editButton.textContent = 'Ändra';
          editButton.addEventListener('click', () => openMoodLinkModal(tableName, item));
          actions.appendChild(editButton);

          const removeButton = document.createElement('button');
          removeButton.type = 'button';
          removeButton.className = 'secondary-button secondary-button--danger';
          removeButton.disabled = state.moodLoading;
          removeButton.textContent = 'Ta bort';
          removeButton.addEventListener('click', async () => removeMoodLink(tableName, item));
          actions.appendChild(removeButton);

          row.appendChild(actions);
        }

        list.appendChild(row);
      });

      body.appendChild(list);
    }

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    return overlay;
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

  function getRowTitleField(tableName) {
    if (tableName === 'PRE DEV') return 'utv_ide';
    if (tableName === 'UTVECKLING') return 'produktide';
    if (tableName === 'LANSERINGSPLAN') return 'produkt';
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

  const rowTodoController = createRowTodoController({
    supabase,
    state,
    tableEntries,
    hasRowTodo,
    getRowTodoCategories,
    getRowById,
    getActiveConfig,
    getCurrentUserInitials,
    loadModalTodoRows,
    render,
    isVirtualModalTodoRow,
    getRowTitleField,
    getDropdownOptionLabel,
    formatDateTimeValue,
  });
  const {
    getRowTodoKey,
    resetRowTodoDraft,
    openRowTodoPanel,
    closeRowTodoPanel,
    createTodoButton,
    createRowTodoPanel,
  } = rowTodoController;

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
          mail_notif: 'gray',
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
    const navTitle = String(tableConfig?.navTitle || '').trim();
    if (navTitle) return navTitle;
    const title = String(tableConfig?.title || '').trim();
    if (title) return title;
    if (tableName === 'STATISTICS') return 'FSG';
    return tableName;
  }

  function createNav() {
    nav.innerHTML = '';

    tableEntries
      .filter(([tableName]) => !['RUTINER', 'STATISTICS', 'SÄLJINTRO', 'DIG PROD'].includes(tableName))
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
    const printClassName = tableName === 'SÄLJINTRO' ? 'is-saljintro-print-ready' : '';
    document.title = `${getTableDisplayName(tableName, active?.[1])} - TODO Planning`;

    if (printClassName) {
      document.body?.classList?.add(printClassName);
    }

    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        document.title = previousTitle;
        if (printClassName) {
          document.body?.classList?.remove(printClassName);
        }
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

    return await saveNewRow(tableName, tableConfig, normalizeRow(tableName, tableConfig, draft));
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


  const LANSERINGSPLAN_TIME_RULES_TABLE = 'lanseringsplan_tidsregler';
  const LANSERINGSPLAN_ROW_TIME_RULES_TABLE = 'lanseringsplan_row_tidsregler';
  const LANSERINGSPLAN_TIME_RULE_DEFS = [
    {
      key: 'b2c_from_po_lager',
      label: 'B2C <- PO-Lager',
      help: 'Antal veckor mellan PO-Lager och B2C-säljstart.',
      defaultWeeks: 1,
    },
    {
      key: 'b2c_from_fullsize',
      label: 'B2C <- Fullsize',
      help: 'Antal veckor mellan Fullsize och B2C-säljstart.',
      defaultWeeks: 1,
    },
    {
      key: 'b2b_from_po_sample',
      label: 'B2B <- PO-Sample',
      help: 'Antal veckor från PO-Sample till B2B-start.',
      defaultWeeks: 1,
    },
    {
      key: 'po_lager_from_b2b',
      label: 'PO-Lager <- B2B',
      help: 'Antal veckor mellan B2B-start och PO-Lager.',
      defaultWeeks: 1,
    },
  ];

  const LANSERINGSPLAN_DATE_FIELDS = [
    'po_sample_slut_datum',
    'b2b_slut_datum',
    'po_lager_slut_datum',
    'fullsize_slut_datum',
    'b2c_slut_datum',
  ];


  function clampLanseringsplanWeeks(value, fallback = 1) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(25, parsed));
  }

  function getLanseringsplanDefaultTimeRules() {
    return LANSERINGSPLAN_TIME_RULE_DEFS.reduce((acc, rule) => {
      acc[rule.key] = clampLanseringsplanWeeks(rule.defaultWeeks, 1);
      return acc;
    }, {});
  }

  function getLanseringsplanTimeRules() {
    return { ...getLanseringsplanDefaultTimeRules(), ...(state.lanseringsplanTimeRules || {}) };
  }

  function buildLanseringsplanTimeRulesFromRows(rows, fallbackRules = null) {
    const fallback = fallbackRules || getLanseringsplanTimeRules();
    const nextRules = { ...fallback };
    (rows || []).forEach((item) => {
      const key = String(item?.rule_key || '').trim();
      if (!LANSERINGSPLAN_TIME_RULE_DEFS.some((rule) => rule.key === key)) return;
      nextRules[key] = clampLanseringsplanWeeks(item?.weeks, fallback[key] || 1);
    });
    return nextRules;
  }

  async function loadLanseringsplanRowTimeRules(rowId) {
    const fallback = getLanseringsplanTimeRules();
    if (!rowId) return fallback;

    const { data, error } = await supabase
      .from(LANSERINGSPLAN_ROW_TIME_RULES_TABLE)
      .select('rule_key, weeks')
      .eq('lanseringsplan_id', rowId);

    if (error) throw error;

    return buildLanseringsplanTimeRulesFromRows(data, fallback);
  }

  async function saveLanseringsplanRowTimeRules(rowId, nextRules) {
    if (!rowId) throw new Error('Saknar Lanseringsplan-rad för tidsregler.');

    const merged = { ...getLanseringsplanTimeRules(), ...(nextRules || {}) };
    const payload = LANSERINGSPLAN_TIME_RULE_DEFS.map((rule) => ({
      lanseringsplan_id: rowId,
      rule_key: rule.key,
      label: rule.label,
      weeks: clampLanseringsplanWeeks(merged[rule.key], rule.defaultWeeks),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from(LANSERINGSPLAN_ROW_TIME_RULES_TABLE)
      .upsert(payload, { onConflict: 'lanseringsplan_id,rule_key' });

    if (error) throw error;
  }

  async function loadLanseringsplanRowsWithCustomTimeRules() {
    const { data, error } = await supabase
      .from(LANSERINGSPLAN_ROW_TIME_RULES_TABLE)
      .select('lanseringsplan_id');

    if (error) throw error;

    return new Set((data || []).map((item) => String(item?.lanseringsplan_id || '')).filter(Boolean));
  }

  async function loadLanseringsplanTimeRules() {
    state.lanseringsplanTimeRulesLoading = true;
    const defaults = getLanseringsplanDefaultTimeRules();

    const { data, error } = await supabase
      .from(LANSERINGSPLAN_TIME_RULES_TABLE)
      .select('rule_key, weeks');

    state.lanseringsplanTimeRulesLoading = false;

    if (error) {
      console.warn('Could not load Lanseringsplan time rules:', error.message);
      state.lanseringsplanTimeRules = defaults;
      return;
    }

    const nextRules = { ...defaults };
    (data || []).forEach((item) => {
      const key = String(item?.rule_key || '').trim();
      if (!LANSERINGSPLAN_TIME_RULE_DEFS.some((rule) => rule.key === key)) return;
      nextRules[key] = clampLanseringsplanWeeks(item?.weeks, defaults[key] || 1);
    });
    state.lanseringsplanTimeRules = nextRules;
  }

  async function saveLanseringsplanTimeRules(nextRules) {
    const merged = { ...getLanseringsplanDefaultTimeRules(), ...(nextRules || {}) };
    const payload = LANSERINGSPLAN_TIME_RULE_DEFS.map((rule) => ({
      rule_key: rule.key,
      label: rule.label,
      weeks: clampLanseringsplanWeeks(merged[rule.key], rule.defaultWeeks),
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from(LANSERINGSPLAN_TIME_RULES_TABLE)
      .upsert(payload, { onConflict: 'rule_key' });

    if (error) throw error;

    state.lanseringsplanTimeRules = payload.reduce((acc, item) => {
      acc[item.rule_key] = item.weeks;
      return acc;
    }, {});
  }

  function parseISODateOnly(value) {
    const raw = String(value || '').slice(0, 10);
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return date;
  }

  function formatISODateOnly(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addWeeksToISODate(dateValue, weeks) {
    const date = parseISODateOnly(dateValue);
    if (!date) return '';
    date.setUTCDate(date.getUTCDate() + (Number(weeks) || 0) * 7);
    return formatISODateOnly(date);
  }

  function calculateLanseringsplanDatesFromAnchor(anchorField, anchorDateValue, rulesOverride = null) {
    const anchorDate = String(anchorDateValue || '').slice(0, 10);
    if (!LANSERINGSPLAN_DATE_FIELDS.includes(anchorField) || !parseISODateOnly(anchorDate)) return null;

    const rules = rulesOverride || getLanseringsplanTimeRules();
    const b2cFromPoLager = clampLanseringsplanWeeks(rules.b2c_from_po_lager, 1);
    const b2cFromFullsize = clampLanseringsplanWeeks(rules.b2c_from_fullsize, 1);
    const b2bFromPoSample = clampLanseringsplanWeeks(rules.b2b_from_po_sample, 1);
    const poLagerFromB2b = clampLanseringsplanWeeks(rules.po_lager_from_b2b, 1);

    let poSampleDate = '';
    let b2bDate = '';
    let poLagerDate = '';
    let fullsizeDate = '';
    let b2cDate = '';

    if (anchorField === 'b2c_slut_datum') {
      b2cDate = anchorDate;
      fullsizeDate = addWeeksToISODate(b2cDate, -b2cFromFullsize);
      poLagerDate = addWeeksToISODate(b2cDate, -b2cFromPoLager);
      b2bDate = addWeeksToISODate(poLagerDate, -poLagerFromB2b);
      poSampleDate = addWeeksToISODate(b2bDate, -b2bFromPoSample);
    } else if (anchorField === 'fullsize_slut_datum') {
      fullsizeDate = anchorDate;
      b2cDate = addWeeksToISODate(fullsizeDate, b2cFromFullsize);
      poLagerDate = addWeeksToISODate(b2cDate, -b2cFromPoLager);
      b2bDate = addWeeksToISODate(poLagerDate, -poLagerFromB2b);
      poSampleDate = addWeeksToISODate(b2bDate, -b2bFromPoSample);
    } else if (anchorField === 'po_lager_slut_datum') {
      poLagerDate = anchorDate;
      b2cDate = addWeeksToISODate(poLagerDate, b2cFromPoLager);
      fullsizeDate = addWeeksToISODate(b2cDate, -b2cFromFullsize);
      b2bDate = addWeeksToISODate(poLagerDate, -poLagerFromB2b);
      poSampleDate = addWeeksToISODate(b2bDate, -b2bFromPoSample);
    } else if (anchorField === 'b2b_slut_datum') {
      b2bDate = anchorDate;
      poSampleDate = addWeeksToISODate(b2bDate, -b2bFromPoSample);
      poLagerDate = addWeeksToISODate(b2bDate, poLagerFromB2b);
      b2cDate = addWeeksToISODate(poLagerDate, b2cFromPoLager);
      fullsizeDate = addWeeksToISODate(b2cDate, -b2cFromFullsize);
    } else if (anchorField === 'po_sample_slut_datum') {
      poSampleDate = anchorDate;
      b2bDate = addWeeksToISODate(poSampleDate, b2bFromPoSample);
      poLagerDate = addWeeksToISODate(b2bDate, poLagerFromB2b);
      b2cDate = addWeeksToISODate(poLagerDate, b2cFromPoLager);
      fullsizeDate = addWeeksToISODate(b2cDate, -b2cFromFullsize);
    }

    if (!poSampleDate || !b2bDate || !poLagerDate || !fullsizeDate || !b2cDate) return null;

    return {
      po_sample_slut_datum: poSampleDate,
      b2b_slut_datum: b2bDate,
      po_lager_slut_datum: poLagerDate,
      fullsize_slut_datum: fullsizeDate,
      b2c_slut_datum: b2cDate,
    };
  }

  function calculateLanseringsplanChangedDateCount(row, nextDates, anchorField = '') {
    if (!row || !nextDates) return 0;
    return LANSERINGSPLAN_DATE_FIELDS.reduce((count, field) => {
      if (field === anchorField) return count;
      const previousValue = String(row[field] || '').slice(0, 10);
      const nextValue = String(nextDates[field] || '').slice(0, 10);
      return previousValue !== nextValue ? count + 1 : count;
    }, 0);
  }

  async function updateLanseringsplanRowDates(row, nextDates) {
    if (!row?.id || !nextDates) return { changedCount: 0 };

    const changedCount = calculateLanseringsplanChangedDateCount(row, nextDates);
    LANSERINGSPLAN_DATE_FIELDS.forEach((field) => {
      row[field] = nextDates[field] || '';
    });

    const { error } = await supabase
      .from('lanseringsplan')
      .update({
        po_sample_slut_datum: nextDates.po_sample_slut_datum || null,
        b2b_slut_datum: nextDates.b2b_slut_datum || null,
        po_lager_slut_datum: nextDates.po_lager_slut_datum || null,
        fullsize_slut_datum: nextDates.fullsize_slut_datum || null,
        b2c_slut_datum: nextDates.b2c_slut_datum || null,
      })
      .eq('id', row.id);

    if (error) throw error;

    await syncDesignFullsizeFromLanseringsplan(row, { date: true });
    return { changedCount };
  }

  async function applyLanseringsplanTimeRulesToRow(row, anchorField, anchorDateValue, options = {}) {
    if (!row?.id) return { recalculated: false, changedCount: 0, reason: 'missing_row' };
    const rules = await loadLanseringsplanRowTimeRules(row.id);
    const nextDates = calculateLanseringsplanDatesFromAnchor(anchorField, anchorDateValue, rules);
    if (!nextDates) return { recalculated: false, changedCount: 0, reason: 'missing_date' };

    const changedCount = calculateLanseringsplanChangedDateCount(row, nextDates, anchorField);
    await updateLanseringsplanRowDates(row, nextDates);

    if (options.showAlert) {
      if (changedCount > 0) {
        alert(`${changedCount} veckonummer räknades om i Lanseringsplan.`);
      } else {
        alert('Inga omberäkningar behövdes. Övriga veckonummer stämde redan med tidsreglerna.');
      }
    }

    return { recalculated: true, changedCount };
  }

  async function recalculateLanseringsplanRowsFromB2C() {
    const customRuleRowIds = await loadLanseringsplanRowsWithCustomTimeRules();
    const defaultRules = getLanseringsplanTimeRules();

    const { data, error } = await supabase
      .from('lanseringsplan')
      .select('id, po_sample_slut_datum, b2b_slut_datum, po_lager_slut_datum, fullsize_slut_datum, b2c_slut_datum');

    if (error) throw error;

    let recalculatedRows = 0;
    let changedDateCount = 0;
    let skippedRows = 0;
    let skippedCustomRows = 0;

    for (const row of data || []) {
      if (customRuleRowIds.has(String(row.id))) {
        skippedCustomRows += 1;
        continue;
      }
      if (!parseISODateOnly(row.b2c_slut_datum)) {
        skippedRows += 1;
        continue;
      }
      const nextDates = calculateLanseringsplanDatesFromAnchor('b2c_slut_datum', row.b2c_slut_datum, defaultRules);
      if (!nextDates) {
        skippedRows += 1;
        continue;
      }
      const result = await updateLanseringsplanRowDates(row, nextDates);
      recalculatedRows += 1;
      changedDateCount += result.changedCount || 0;
    }

    return { recalculatedRows, changedDateCount, skippedRows, skippedCustomRows };
  }

  async function recalculateLanseringsplanSingleRowFromB2C(row, rulesOverride = null) {
    if (!row?.id || !parseISODateOnly(row.b2c_slut_datum)) {
      return { recalculated: false, changedCount: 0, reason: 'missing_b2c' };
    }
    const nextDates = calculateLanseringsplanDatesFromAnchor('b2c_slut_datum', row.b2c_slut_datum, rulesOverride || getLanseringsplanTimeRules());
    if (!nextDates) return { recalculated: false, changedCount: 0, reason: 'missing_b2c' };
    const result = await updateLanseringsplanRowDates(row, nextDates);
    return { recalculated: true, changedCount: result.changedCount || 0 };
  }

  function createLanseringsplanWeekSelect(value) {
    const select = document.createElement('select');
    select.className = 'detail-field__control lanseringsplan-time-rules-modal__select';
    for (let week = 1; week <= 25; week += 1) {
      const option = document.createElement('option');
      option.value = String(week);
      option.textContent = String(week);
      select.appendChild(option);
    }
    select.value = String(clampLanseringsplanWeeks(value, 1));
    return select;
  }

  async function openLanseringsplanTimeRulesModal(row = null) {
    const rowId = row?.id || null;
    const isRowSpecific = Boolean(rowId);
    if (state.lanseringsplanTimeRulesLoading) return;
    if (!state.lanseringsplanTimeRules || !Object.keys(state.lanseringsplanTimeRules).length) {
      await loadLanseringsplanTimeRules();
    }
    const rowRules = isRowSpecific ? await loadLanseringsplanRowTimeRules(rowId) : null;

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal lanseringsplan-time-rules-modal';

    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });

    const dialog = document.createElement('div');
    dialog.className = 'overlay-modal__dialog';

    const panel = document.createElement('section');
    panel.className = 'side-panel lanseringsplan-time-rules-modal__panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'todo-modal__heading';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'side-panel__eyebrow';
    eyebrow.textContent = 'Lanseringsplan';

    const title = document.createElement('h2');
    title.className = 'side-panel__title';
    title.textContent = isRowSpecific ? `Tidsregler – ${row?.produkt || 'rad'}` : 'Tidsregler';

    const help = document.createElement('p');
    help.className = 'side-panel__text';
    help.textContent = isRowSpecific
      ? 'Reglerna sparas bara för denna rad. Om raden saknar egna regler visas default-reglerna som startvärden.'
      : 'Default-reglerna används för nya rader och för rader som inte har egna tidsregler.';

    titleWrap.append(eyebrow, title, help);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', closeModal);

    header.append(titleWrap, closeButton);

    const body = document.createElement('form');
    body.className = 'side-panel__body lanseringsplan-time-rules-modal__form';

    const tableWrap = document.createElement('div');
    tableWrap.className = 'analysis-table-wrap lanseringsplan-time-rules-modal__table-wrap';
    const table = document.createElement('table');
    table.className = 'analysis-table lanseringsplan-time-rules-modal__table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Regel', 'Antal veckor'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const selectsByKey = {};
    const currentRules = rowRules || getLanseringsplanTimeRules();
    LANSERINGSPLAN_TIME_RULE_DEFS.forEach((rule) => {
      const tr = document.createElement('tr');
      const labelTd = document.createElement('td');
      const label = document.createElement('strong');
      label.textContent = rule.label;
      const hint = document.createElement('div');
      hint.className = 'detail-field__hint';
      hint.textContent = rule.help;
      labelTd.append(label, hint);
      tr.appendChild(labelTd);

      const selectTd = document.createElement('td');
      const select = createLanseringsplanWeekSelect(currentRules[rule.key]);
      selectsByKey[rule.key] = select;
      selectTd.appendChild(select);
      tr.appendChild(selectTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    body.appendChild(tableWrap);

    const footer = document.createElement('div');
    footer.className = 'side-panel__footer';

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'primary-button';
    saveButton.textContent = 'Save';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'secondary-button';
    cancelButton.textContent = 'Avbryt';
    cancelButton.addEventListener('click', closeModal);

    footer.append(saveButton, cancelButton);

    const handleSaveTimeRules = async () => {
      const nextRules = {};
      LANSERINGSPLAN_TIME_RULE_DEFS.forEach((rule) => {
        nextRules[rule.key] = clampLanseringsplanWeeks(selectsByKey[rule.key]?.value, rule.defaultWeeks);
      });

      saveButton.disabled = true;
      cancelButton.disabled = true;
      saveButton.textContent = 'Sparar...';

      try {
        let result;
        if (isRowSpecific) {
          await saveLanseringsplanRowTimeRules(rowId, nextRules);
          const savedRules = await loadLanseringsplanRowTimeRules(rowId);
          result = await recalculateLanseringsplanSingleRowFromB2C(row, savedRules);
        } else {
          await saveLanseringsplanTimeRules(nextRules);
          result = await recalculateLanseringsplanRowsFromB2C();
        }
        closeModal();
        await loadTableRowsFromData(state, 'LANSERINGSPLAN', APP_CONFIG.tables.LANSERINGSPLAN);
        render();
        if (isRowSpecific) {
          if (result?.recalculated && (result.changedCount || 0) > 0) {
            alert(`Tidsregler för raden sparades. ${result.changedCount} veckonummer räknades om.`);
          } else if (result?.recalculated) {
            alert('Tidsregler för raden sparades. Inga veckonummer behövde ändras.');
          } else {
            alert('Tidsregler för raden sparades. Raden kunde inte räknas om eftersom B2C-vecka saknas.');
          }
        } else if ((result.changedDateCount || 0) > 0) {
          alert(`Default-tidsregler sparades. ${result.changedDateCount} veckonummer räknades om på ${result.recalculatedRows} rader.`);
        } else if ((result.recalculatedRows || 0) > 0) {
          alert(`Default-tidsregler sparades. Inga veckonummer behövde ändras på ${result.recalculatedRows} rader.`);
        } else {
          alert('Default-tidsregler sparades. Inga rader kunde räknas om eftersom B2C-vecka saknas eller raderna har egna tidsregler.');
        }
      } catch (error) {
        alert(`Kunde inte spara tidsregler eller räkna om veckonummer: ${error.message}`);
      } finally {
        if (overlay.isConnected) {
          saveButton.disabled = false;
          cancelButton.disabled = false;
          saveButton.textContent = 'Save';
        }
      }
    };

    body.addEventListener('submit', (event) => {
      event.preventDefault();
      void handleSaveTimeRules();
    });

    saveButton.addEventListener('click', (event) => {
      event.preventDefault();
      void handleSaveTimeRules();
    });

    panel.append(header, body, footer);
    dialog.appendChild(panel);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    window.setTimeout(() => Object.values(selectsByKey)[0]?.focus?.(), 0);
  }

  function getLanseringsplanCollectionOptions() {
    const dropdown = APP_CONFIG.dropdowns?.dropdown_design_collection;
    return Array.isArray(dropdown?.options) ? dropdown.options : [];
  }

  function createLanseringsplanCollectionSelect() {
    return createCategorySelect({
      options: getLanseringsplanCollectionOptions(),
      ariaLabel: 'Collection för ny Lanseringsplan-rad',
      placeholderText: 'VÄLJ COLLECTION',
    });
  }

  function createLanseringsplanProductInput() {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'detail-field__control';
    input.placeholder = 'Produkt';
    input.setAttribute('aria-label', 'Produkt för ny Lanseringsplan-rad');
    input.style.minWidth = '22ch';
    return input;
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

  function createHeaderActionButton(label, onClick, options = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = options.className || 'secondary-button';
    button.textContent = label;
    if (options.dataset && typeof options.dataset === 'object') {
      Object.entries(options.dataset).forEach(([key, value]) => {
        button.dataset[key] = String(value);
      });
    }
    if (options.title) button.title = options.title;
    if (typeof onClick === 'function') {
      button.addEventListener('click', onClick);
    }
    return button;
  }

  function openDesignNewRowModal(tableName, tableConfig) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal design-new-row-modal';

    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });

    const dialog = document.createElement('div');
    dialog.className = 'overlay-modal__dialog';

    const panel = document.createElement('section');
    panel.className = 'side-panel design-new-row-modal__panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'todo-modal__heading';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'side-panel__eyebrow';
    eyebrow.textContent = 'Design';

    const title = document.createElement('h2');
    title.className = 'side-panel__title';
    title.textContent = 'Ny rad';

    const help = document.createElement('p');
    help.className = 'side-panel__text';
    help.textContent = 'Välj kategori för den nya Design-raden.';

    titleWrap.append(eyebrow, title, help);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', closeModal);

    header.append(titleWrap, closeButton);

    const form = document.createElement('form');
    form.className = 'side-panel__body design-new-row-modal__form';

    const kategoriSelect = createDesignNewRowCategorySelect();

    const kategoriField = document.createElement('label');
    kategoriField.className = 'detail-field';
    const kategoriLabel = document.createElement('span');
    kategoriLabel.className = 'detail-field__label';
    kategoriLabel.textContent = 'Välj kategori';
    kategoriField.append(kategoriLabel, kategoriSelect);

    const footer = document.createElement('div');
    footer.className = 'side-panel__footer';

    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.className = 'primary-button';
    saveButton.textContent = 'Save';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'secondary-button';
    cancelButton.textContent = 'Avbryt';
    cancelButton.addEventListener('click', closeModal);

    footer.append(saveButton, cancelButton);

    form.append(kategoriField);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const kategori = String(kategoriSelect.value || '').trim();
      if (!kategori) {
        alert('Välj kategori innan ny Design-rad skapas.');
        kategoriSelect.focus();
        return;
      }

      saveButton.disabled = true;
      cancelButton.disabled = true;
      saveButton.textContent = 'Sparar...';

      try {
        const createdRow = await createInlineNewRow(tableName, tableConfig, { kategori });
        if (createdRow) closeModal();
      } finally {
        if (overlay.isConnected) {
          saveButton.disabled = false;
          cancelButton.disabled = false;
          saveButton.textContent = 'Save';
        }
      }
    });

    panel.append(header, form, footer);
    dialog.appendChild(panel);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    window.setTimeout(() => kategoriSelect.focus(), 0);
  }

  function openLanseringsplanNewRowModal(tableName, tableConfig) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal lanseringsplan-new-row-modal';

    const closeModal = () => overlay.remove();
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });

    const dialog = document.createElement('div');
    dialog.className = 'overlay-modal__dialog';

    const panel = document.createElement('section');
    panel.className = 'side-panel lanseringsplan-new-row-modal__panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'todo-modal__heading';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'side-panel__eyebrow';
    eyebrow.textContent = 'Lanseringsplan';

    const title = document.createElement('h2');
    title.className = 'side-panel__title';
    title.textContent = 'Ny rad';

    const help = document.createElement('p');
    help.className = 'side-panel__text';
    help.textContent = 'Välj kollektion och skriv produktnamn för den nya raden.';

    titleWrap.append(eyebrow, title, help);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', closeModal);

    header.append(titleWrap, closeButton);

    const form = document.createElement('form');
    form.className = 'side-panel__body lanseringsplan-new-row-modal__form';

    const collectionSelect = createLanseringsplanCollectionSelect();
    const produktInput = createLanseringsplanProductInput();

    const collectionField = document.createElement('label');
    collectionField.className = 'detail-field';
    const collectionLabel = document.createElement('span');
    collectionLabel.className = 'detail-field__label';
    collectionLabel.textContent = 'Välj kollektion';
    collectionField.append(collectionLabel, collectionSelect);

    const productField = document.createElement('label');
    productField.className = 'detail-field';
    const productLabel = document.createElement('span');
    productLabel.className = 'detail-field__label';
    productLabel.textContent = 'Produkt';
    productField.append(productLabel, produktInput);

    const footer = document.createElement('div');
    footer.className = 'side-panel__footer';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-button';
    saveButton.textContent = 'Save';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'secondary-button';
    cancelButton.textContent = 'Avbryt';
    cancelButton.addEventListener('click', closeModal);

    footer.append(saveButton, cancelButton);

    form.append(collectionField, productField);

    const saveLanseringsplanNewRow = async () => {
      const collection = String(collectionSelect.value || '').trim();
      const produkt = String(produktInput.value || '').trim();

      if (!collection) {
        alert('Välj Collection innan ny Lanseringsplan-rad skapas.');
        collectionSelect.focus();
        return;
      }

      if (!produkt) {
        alert('Skriv in Produkt innan ny Lanseringsplan-rad skapas.');
        produktInput.focus();
        return;
      }

      saveButton.disabled = true;
      cancelButton.disabled = true;
      saveButton.textContent = 'Sparar...';

      try {
        const createdRow = await createInlineNewRow(tableName, tableConfig, { collection, produkt });
        if (createdRow) closeModal();
      } catch (err) {
        alert(`Kunde inte skapa ny rad i Lanseringsplan: ${err.message || err}`);
      } finally {
        if (overlay.isConnected) {
          saveButton.disabled = false;
          cancelButton.disabled = false;
          saveButton.textContent = 'Save';
        }
      }
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void saveLanseringsplanNewRow();
    });

    saveButton.addEventListener('click', (event) => {
      event.preventDefault();
      void saveLanseringsplanNewRow();
    });

    panel.append(header, form, footer);
    dialog.appendChild(panel);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    window.setTimeout(() => collectionSelect.focus(), 0);
  }

  function createTopActions(tableName, tableConfig) {
    const wrap = document.createElement('div');
    wrap.className = 'view-actions';

    const designCategorySelect = null;
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
        wrap.appendChild(createHeaderActionButton('Arkiv', openArchivePanel));
      }

      if (tableName !== 'CDMP') {
      wrap.appendChild(createHeaderActionButton('Print', () => printActiveView(tableName)));
    }

      return wrap;
    }

    const newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.className = 'secondary-button';
    newButton.textContent = '+ Ny rad';

    newButton.addEventListener('click', async () => {
        if (tableName === 'UTVECKLING') {
          openDesignNewRowModal(tableName, tableConfig);
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

        if (tableName === 'LANSERINGSPLAN') {
          openLanseringsplanNewRowModal(tableName, tableConfig);
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

    if (tableName === 'LANSERINGSPLAN') {
      const timeRulesButton = document.createElement('button');
      timeRulesButton.type = 'button';
      timeRulesButton.className = 'secondary-button';
      timeRulesButton.textContent = 'Tidsregler';
      timeRulesButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openLanseringsplanTimeRulesModal();
      });
      wrap.appendChild(timeRulesButton);
    }

    if (tableName !== 'RUTINER') {
      wrap.appendChild(createHeaderActionButton('Arkiv', openArchivePanel));
    }

    if (tableName === TODO_TABLE) {
      wrap.appendChild(createHeaderActionButton('Mina Todo', () => {
        state.todoMineOnly = !state.todoMineOnly;
        render();
      }, {
        className: `secondary-button${state.todoMineOnly ? ' is-active' : ''}`,
        title: 'Visa mina ansvariga och privata todo',
      }));
    }
    if (tableName === 'SÄLJINTRO') {
      wrap.appendChild(createHeaderActionButton('Excel-plan', openSalesIntroExcelPlan));
    }

    if (tableName !== 'CDMP') {
      wrap.appendChild(createHeaderActionButton('Print', () => printActiveView(tableName)));
    }

    if (isMoodEnabledTable(tableName)) {
      wrap.appendChild(createMoodToolbarButton(tableName));
    }

    return wrap;
  }

  function isMultilineTextColumn(column) {
    return column?.type === 'text' && (column?.mods?.displayMode === 'textarea' || column?.mods?.multiline === true || column?.multiline === true);
  }

  function isExcelLinkColumn(column) {
    return column?.mods?.displayMode === 'excel_link';
  }

  function isCdmpProvmattorColumn(column) {
    return column?.mods?.displayMode === 'provmattor_table';
  }

  function isDigprodPlanColumn(column) {
    return column?.type === 'digprod_plan' || column?.mods?.displayMode === 'digprod_plan';
  }

  function isEditableTextColumn(column) {
    return ['text', 'veckonummer', 'kvartal'].includes(column.type) && !isOpenColumn(column) && !isExcelLinkColumn(column) && !isCdmpProvmattorColumn(column) && !isDigprodPlanColumn(column) && column?.mods?.readonly !== true;
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



  async function deleteRelatedRecordsForSource(sourceTable, sourceRowId) {
    return archiveController.deleteRelatedRecordsForSource(sourceTable, sourceRowId);
  }


  async function saveNewRow(tableName, tableConfig, draftRow) {
    if (!draftRow) return;

    state.savingCell = '__new_row__';
    render();

    const payload = {};
    tableConfig.columns.forEach((column) => {
      if (column.field === 'id' || isDigprodPlanColumn(column)) return;
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
      if (tableName === 'LANSERINGSPLAN') {
        await recalculateLanseringsplanRowAfterCreate(finalRow);
      }
    } catch (err) {
      alert(`Raden skapades, men Fullsize-datum kunde inte räknas om/speglas till Design: ${err.message}`);
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
        // Ny rad i SÄLJINTRO skapas först utan produktnamn. När produktnamnet
        // sparas första gången finns därför inga DIG PROD-rader att döpa om.
        // Säkerställ då att B2B-intro och B2C-intro finns, med samma repair-logik
        // som används för datum-/länk-reparationer.
        await repairDigProdLinksFromSaljintro();
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

    if (tableConfig.dbTable === 'lanseringsplan' && column.field === 'fullsize') {
      try {
        await syncDesignFullsizeFromLanseringsplan(row, { status: true });
      } catch (syncErr) {
        alert(`Lanseringsplan sparades, men Fullsize-status kunde inte speglas till Design: ${syncErr.message}`);
      }
    }

    if (tableConfig.dbTable === 'utveckling' && column.field === 'stort_sample') {
      try {
        await syncLanseringsplanFullsizeStatusFromDesign(row);
      } catch (syncErr) {
        alert(`Design sparades, men Fullsize-status kunde inte speglas till Lanseringsplan: ${syncErr.message}`);
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

    if (tableConfig.dbTable === 'lanseringsplan' && LANSERINGSPLAN_DATE_FIELDS.includes(dateField)) {
      try {
        if (dateField === 'fullsize_slut_datum' && !nextDate) {
          await syncDesignFullsizeFromLanseringsplan(row, { date: true });
        }
        const result = await applyLanseringsplanTimeRulesToRow(row, dateField, nextDate);
        if (result.recalculated && (result.changedCount || 0) > 0) {
          alert(`${result.changedCount} veckonummer räknades om i Lanseringsplan.`);
        } else if (result.recalculated) {
          alert('Inga omberäkningar behövdes. Övriga veckonummer stämde redan med tidsreglerna.');
        } else {
          alert('Inga omberäkningar gjordes. Sätt ett giltigt veckodatum för att tidsreglerna ska kunna användas.');
        }
      } catch (syncErr) {
        alert(`Datum sparades, men tidsregler kunde inte köras: ${syncErr.message}`);
      }
      render();
      return;
    }

    render();
  }

  async function saveDateCell(tableConfig, row, column, nextDateValue, targetDateField = null) {
    const dateField = String(targetDateField || column?.field || '').trim();
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

  async function editStatusDateCell(tableConfig, row, column, targetDateField = null) {
    const dateField = String(targetDateField || column?.renderFromField || '').trim();
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
      await saveStatusDateCell(tableConfig, row, column, nextDate, dateField);
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


  function normalizeLanseringsplanProductName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('sv-SE');
  }

  function getLanseringsplanFullsizeSyncKey(value) {
    return normalizeProductLinkKey(value);
  }

  function getLanseringsplanCollectionKey(value) {
    return String(value || '').trim().toLocaleLowerCase('sv-SE');
  }

  function findDesignRowsForLanseringsplanRow(lanseringsplanRow) {
    const productKey = getLanseringsplanFullsizeSyncKey(lanseringsplanRow?.produkt);
    if (!productKey) return [];

    const collectionKey = getLanseringsplanCollectionKey(lanseringsplanRow?.collection);
    const designRows = state.rowsByTable?.['UTVECKLING'] || [];
    const productMatches = designRows.filter((candidate) => (
      getLanseringsplanFullsizeSyncKey(candidate?.produktide) === productKey
    ));

    if (!collectionKey) return productMatches;

    const collectionMatches = productMatches.filter((candidate) => (
      getLanseringsplanCollectionKey(candidate?.collection) === collectionKey
    ));

    return collectionMatches.length ? collectionMatches : productMatches;
  }

  async function fetchDesignRowsForLanseringsplanRow(lanseringsplanRow) {
    const product = String(lanseringsplanRow?.produkt || '').trim();
    if (!product) return [];

    const collection = String(lanseringsplanRow?.collection || '').trim();

    let query = supabase
      .from('utveckling')
      .select('*')
      .eq('produktide', product);

    if (collection) {
      query = query.eq('collection', collection);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (Array.isArray(data) && data.length) return data;
    if (!collection) return [];

    const fallback = await supabase
      .from('utveckling')
      .select('*')
      .eq('produktide', product);

    if (fallback.error) throw fallback.error;
    return Array.isArray(fallback.data) ? fallback.data : [];
  }

  function findLanseringsplanRowsForDesignRow(designRow) {
    const productKey = getLanseringsplanFullsizeSyncKey(designRow?.produktide);
    if (!productKey) return [];

    const collectionKey = getLanseringsplanCollectionKey(designRow?.collection);
    const lanseringsplanRows = state.rowsByTable?.['LANSERINGSPLAN'] || [];
    const productMatches = lanseringsplanRows.filter((candidate) => (
      getLanseringsplanFullsizeSyncKey(candidate?.produkt) === productKey
    ));

    if (!collectionKey) return productMatches;

    const collectionMatches = productMatches.filter((candidate) => (
      getLanseringsplanCollectionKey(candidate?.collection) === collectionKey
    ));

    return collectionMatches.length ? collectionMatches : productMatches;
  }

  function applyUpdatedRowsToState(tableName, updatedRows) {
    if (!Array.isArray(updatedRows) || !updatedRows.length) return;
    const entry = tableEntries.find(([name]) => name === tableName);
    const [, tableConfig] = entry || [];
    if (!tableConfig) return;

    const normalizedRows = updatedRows.map((item) => normalizeRow(tableName, tableConfig, item));
    const updatedById = new Map(normalizedRows.map((item) => [String(item.id), item]));
    state.rowsByTable[tableName] = (state.rowsByTable[tableName] || []).map((item) => (
      updatedById.get(String(item.id)) || item
    ));
  }

  function getLanseringsplanDateAnchorField(row) {
    const preferredOrder = [
      'b2c_slut_datum',
      'fullsize_slut_datum',
      'po_lager_slut_datum',
      'b2b_slut_datum',
      'po_sample_slut_datum',
    ];

    return preferredOrder.find((field) => parseISODateOnly(String(row?.[field] || '').slice(0, 10))) || '';
  }

  async function recalculateLanseringsplanRowAfterCreate(row) {
    if (!row?.id) return row;

    const anchorField = getLanseringsplanDateAnchorField(row);
    if (!anchorField) return row;

    const nextDates = calculateLanseringsplanDatesFromAnchor(anchorField, row[anchorField]);
    if (!nextDates) return row;

    await updateLanseringsplanRowDates(row, nextDates);
    return row;
  }

  async function syncDesignFullsizeFromLanseringsplan(lanseringsplanRow, options = {}) {
    const shouldSyncStatus = options.status === true;
    const shouldSyncDate = options.date === true;
    if (!lanseringsplanRow?.id || (!shouldSyncStatus && !shouldSyncDate)) return { changedCount: 0 };

    let matches = findDesignRowsForLanseringsplanRow(lanseringsplanRow);
    if (!matches.length) {
      matches = await fetchDesignRowsForLanseringsplanRow(lanseringsplanRow);
    }
    if (!matches.length) return { changedCount: 0 };

    const payload = {};
    if (shouldSyncStatus) payload.stort_sample = normalizeStatusValue(lanseringsplanRow.fullsize);
    if (shouldSyncDate) payload.stort_sample_slut_datum = String(lanseringsplanRow.fullsize_slut_datum || '').slice(0, 10) || null;

    const ids = matches.map((item) => item.id).filter(Boolean);
    if (!ids.length || !Object.keys(payload).length) return { changedCount: 0 };

    const { data, error } = await supabase
      .from('utveckling')
      .update(payload)
      .in('id', ids)
      .select('*');

    if (error) throw error;
    const updatedRows = Array.isArray(data) ? data : [];
    applyUpdatedRowsToState('UTVECKLING', updatedRows);
    return { changedCount: updatedRows.length };
  }

  async function syncLanseringsplanFullsizeStatusFromDesign(designRow) {
    if (!designRow?.id) return { changedCount: 0 };

    const matches = findLanseringsplanRowsForDesignRow(designRow);
    if (!matches.length) return { changedCount: 0 };

    const ids = matches.map((item) => item.id).filter(Boolean);
    if (!ids.length) return { changedCount: 0 };

    const payload = { fullsize: normalizeStatusValue(designRow.stort_sample) };
    const { data, error } = await supabase
      .from('lanseringsplan')
      .update(payload)
      .in('id', ids)
      .select('*');

    if (error) throw error;
    const updatedRows = Array.isArray(data) ? data : [];
    applyUpdatedRowsToState('LANSERINGSPLAN', updatedRows);
    return { changedCount: updatedRows.length };
  }

  function findDigProdIntroRowForLanseringsplan(row, introType) {
    const productKey = normalizeLanseringsplanProductName(row?.produkt);
    if (!productKey) return null;
    return (state.rowsByTable?.['DIG PROD'] || []).find((candidate) => (
      normalizeDigProdIntroCategory(candidate?.kategori) === introType &&
      normalizeLanseringsplanProductName(candidate?.produktnamn) === productKey
    )) || null;
  }

  async function createDigProdIntroRowsFromLanseringsplan(lanseringsplanRow) {
    const digProdConfig = APP_CONFIG.tables?.['DIG PROD'];
    if (!digProdConfig?.dbTable) {
      alert('Kunde inte hitta DIG PROD.');
      return;
    }

    const productName = String(lanseringsplanRow?.produkt || '').trim();
    if (!productName) {
      alert('Lanseringsplan-raden saknar Produkt och kan därför inte skapa DIG PROD-rader.');
      return;
    }

    const targets = [
      { category: 'B2B-intro', label: 'B2B Intro' },
      { category: 'B2C-intro', label: 'B2C Intro' },
    ];
    const createdLabels = [];
    const existingLabels = [];

    try {
      for (const target of targets) {
        const existing = findDigProdIntroRowForLanseringsplan(lanseringsplanRow, target.category);
        if (existing?.id) {
          existingLabels.push(target.label);
          continue;
        }

        const created = await createInlineNewRow('DIG PROD', digProdConfig, {
          produktnamn: productName,
          kategori: target.category,
          kommentar: '',
        });

        if (created?.id) createdLabels.push(target.label);
      }
    } catch (err) {
      alert(`Kunde inte skapa DIG PROD-rader: ${err.message || err}`);
      return;
    }

    if (createdLabels.length) {
      const existingText = existingLabels.length ? ` (${existingLabels.join(' och ')} fanns redan)` : '';
      alert(`Skapade ${createdLabels.join(' och ')} i DIG PROD för ${productName}.${existingText}`);
      return;
    }

    alert(`B2B Intro och B2C Intro finns redan i DIG PROD för ${productName}.`);
  }

  function getDigProdIntroRowsForLanseringsplan(lanseringsplanRow) {
    const productKey = normalizeLanseringsplanProductName(lanseringsplanRow?.produkt);
    if (!productKey) return [];

    return (state.rowsByTable?.['DIG PROD'] || []).filter((candidate) => {
      const category = normalizeDigProdIntroCategory(candidate?.kategori);
      return (
        (category === 'B2B-intro' || category === 'B2C-intro') &&
        normalizeLanseringsplanProductName(candidate?.produktnamn) === productKey
      );
    });
  }

  async function deleteLanseringsplanRowWithDigProdIntroRows(lanseringsplanRow) {
    const lanseringsplanConfig = APP_CONFIG.tables?.['LANSERINGSPLAN'];
    const digProdConfig = APP_CONFIG.tables?.['DIG PROD'];
    const productName = String(lanseringsplanRow?.produkt || '').trim();

    if (!lanseringsplanConfig?.dbTable || !digProdConfig?.dbTable || !lanseringsplanRow?.id) {
      alert('Kunde inte hitta rätt tabeller/rad för borttagning.');
      return;
    }

    const digProdRows = getDigProdIntroRowsForLanseringsplan(lanseringsplanRow);
    const extraText = digProdRows.length
      ? `\n\nÄven ${digProdRows.length} rad(er) i DIG PROD / B2B Intro och B2C Intro för samma produkt tas bort.`
      : '\n\nInga kopplade B2B/B2C Intro-rader hittades i DIG PROD.';

    const confirmed = window.confirm(`Ta bort raden i Lanseringsplan för ${productName || 'denna produkt'}?${extraText}`);
    if (!confirmed) return;

    try {
      if (digProdRows.length) {
        const digProdIds = digProdRows.map((item) => item.id).filter(Boolean);
        for (const digProdRow of digProdRows) {
          await deleteRelatedRecordsForSource('DIG PROD', digProdRow.id);
        }

        const { error: digProdError } = await supabase
          .from(digProdConfig.dbTable)
          .delete()
          .in('id', digProdIds);

        if (digProdError) throw digProdError;

        state.rowsByTable['DIG PROD'] = (state.rowsByTable?.['DIG PROD'] || []).filter((candidate) => (
          !digProdIds.some((id) => String(id) === String(candidate.id))
        ));
      }

      await deleteRelatedRecordsForSource('LANSERINGSPLAN', lanseringsplanRow.id);

      const { error: lanseringsplanError } = await supabase
        .from(lanseringsplanConfig.dbTable)
        .delete()
        .eq('id', lanseringsplanRow.id);

      if (lanseringsplanError) throw lanseringsplanError;

      state.rowsByTable['LANSERINGSPLAN'] = (state.rowsByTable?.['LANSERINGSPLAN'] || []).filter((candidate) => (
        String(candidate.id) !== String(lanseringsplanRow.id)
      ));

      alert(digProdRows.length
        ? `Raden i Lanseringsplan och ${digProdRows.length} kopplad(e) DIG PROD-rad(er) togs bort.`
        : 'Raden i Lanseringsplan togs bort.');
      render();
    } catch (err) {
      alert(`Kunde inte ta bort Lanseringsplan/DIG PROD-rader: ${err.message || err}`);
    }
  }

  async function createLanseringsplanFromDesign(designRow) {
    const lanseringsplanConfig = APP_CONFIG.tables?.['LANSERINGSPLAN'];
    if (!lanseringsplanConfig?.dbTable) {
      alert('Kunde inte hitta Lanseringsplan.');
      return null;
    }

    const produkt = String(designRow?.produktide || '').trim();
    const collection = String(designRow?.collection || '').trim() || '27-spring';

    if (!produkt) {
      alert('Design-raden saknar Namn/Produkt och kan därför inte kopieras till Lanseringsplan.');
      return null;
    }

    const fullsizeDate = String(designRow?.stort_sample_slut_datum || '').slice(0, 10);

    try {
      const createdRow = await createInlineNewRow('LANSERINGSPLAN', lanseringsplanConfig, {
        produkt,
        collection,
        fullsize: normalizeStatusValue(designRow?.stort_sample || 'gray'),
        fullsize_slut_datum: fullsizeDate,
      });

      if (createdRow?.id) {
        alert(`Kopia skapad i Lanseringsplan för ${produkt}.`);
      }
      return createdRow || null;
    } catch (err) {
      alert(`Kunde inte skapa kopia i Lanseringsplan: ${err.message || err}`);
      return null;
    }
  }

  async function openLanseringsplanDigProdIntroModal(lanseringsplanRow, introType) {
    const label = introType === 'B2C-intro' ? 'B2C Intro' : 'B2B Intro';
    const productName = String(lanseringsplanRow?.produkt || '').trim();
    const targetRow = findDigProdIntroRowForLanseringsplan(lanseringsplanRow, introType);

    if (!targetRow?.id) {
      alert(`Ingen ${label}-rad finns ännu för ${productName || 'denna produkt'}. Använd Skapa Dig plan när den funktionen är klar.`);
      return;
    }

    state.settingsPanelOpen = false;
    state.linksPanelOpen = false;
    state.messagesPanelOpen = false;
    state.archivePanelOpen = false;
    state.rowTodoPanelOpen = false;
    state.notesPanelOpen = false;
    state.columnChecklistPanelOpen = false;
    state.cdmpProvmattorPanelOpen = false;
    state.detailRowId = null;
    state.newRowDraft = null;
    state.digprodPlanPanelMode = 'intro_row';
    state.digprodPlanPanelOpen = true;
    state.digprodPlanRowId = targetRow.id;
    state.lanseringsplanIntroSourceId = lanseringsplanRow?.id || null;
    render();
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
      const moreButton = document.createElement('button');
      moreButton.type = 'button';
      moreButton.className = 'row-actions__button row-actions__menu-trigger';
      moreButton.textContent = '...';
      moreButton.title = 'Fler åtgärder';
      moreButton.setAttribute('aria-label', 'Fler åtgärder');
      moreButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFloatingActionMenu(moreButton, [
          {
            label: 'Arkiv',
            title: 'Lägg raden i Arkiv',
            action: async () => runRowAction(tableName, tableConfig, row, 'archive'),
          },
          {
            label: 'Ta bort',
            title: 'Ta bort raden',
            danger: true,
            action: async () => runRowAction(tableName, tableConfig, row, 'delete'),
          },
          {
            label: 'Kopia lansering',
            title: 'Skapa kopia i Lanseringsplan',
            action: async () => createLanseringsplanFromDesign(row),
          },
        ]);
      });
      wrap.appendChild(moreButton);
      return wrap;
    }




    if (tableName === 'LANSERINGSPLAN') {
      wrap.appendChild(makeButton({
        label: 'B2C',
        title: 'Öppna motsvarande DIG PROD / B2C Intro-rad',
        action: async () => openLanseringsplanDigProdIntroModal(row, 'B2C-intro'),
      }));
      wrap.appendChild(makeButton({
        label: 'B2B',
        title: 'Öppna motsvarande DIG PROD / B2B Intro-rad',
        action: async () => openLanseringsplanDigProdIntroModal(row, 'B2B-intro'),
      }));

      const moreButton = document.createElement('button');
      moreButton.type = 'button';
      moreButton.className = 'row-actions__button row-actions__menu-trigger';
      moreButton.textContent = '...';
      moreButton.title = 'Fler åtgärder';
      moreButton.setAttribute('aria-label', 'Fler åtgärder');
      moreButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFloatingActionMenu(moreButton, [
          {
            label: 'Skapa Dig Prod',
            title: 'Skapa B2B Intro och B2C Intro i DIG PROD',
            action: async () => createDigProdIntroRowsFromLanseringsplan(row),
          },
          {
            label: 'Arkiv',
            title: 'Lägg raden i Arkiv',
            action: async () => runRowAction(tableName, tableConfig, row, 'archive'),
          },
          {
            label: 'Ta bort',
            title: 'Ta bort raden och kopplade B2B/B2C Intro-rader i DIG PROD',
            danger: true,
            action: async () => deleteLanseringsplanRowWithDigProdIntroRows(row),
          },
          {
            label: 'Tidsregler',
            title: 'Redigera tidsregler för denna rad',
            action: async () => openLanseringsplanTimeRulesModal(row),
          },
        ]);
      });
      wrap.appendChild(moreButton);
      return wrap;
    }

    if (tableName === 'CDMP') {
      wrap.appendChild(makeButton({
        label: '🗑',
        title: 'Ta bort raden',
        className: 'row-actions__button row-actions__button--danger',
        action: async () => runRowAction(tableName, tableConfig, row, 'delete'),
      }));
      return wrap;
    }

    if (tableName === TODO_TABLE) {
      wrap.appendChild(makeButton({
        label: '🗑',
        title: 'Ta bort TODO-raden',
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


  function getNormalizedExternalLink(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(withProtocol);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function openExternalLinkInNewWindow(rawValue) {
    const url = getNormalizedExternalLink(rawValue);
    if (!url) {
      alert('Länken verkar inte vara en giltig http/https-adress.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }


  const DIGPROD_STATUS_LABELS = { gray: 'Grå', yellow: 'Gul', green: 'Grön', red: 'Röd' };

  const DIGPROD_B2B_PLAN_ACTIVITY_FIELDS = [
    { field: 'spec_produkt', label: 'SPEC PRODUKT' },
    { field: 'spec_variant', label: 'SPEC VARIANT' },
    { field: 'text_copy', label: 'PDP COPY' },
    { field: 'copy_to_b2c', label: 'BRANDBOOK' },
    { field: 'utskick', label: 'UTSKICK' },
  ];

  const DIGPROD_B2C_PLAN_ACTIVITY_FIELDS = [
    { field: 'packshot', label: 'PACKSHOT' },
    { field: 'kampanj', label: 'KAMPANJ' },
    { field: 'media', label: 'MEDIA/PRESS' },
    { field: 'utskick', label: 'UTSKICK' },
  ];

  function getDigprodPlanActivityFields(row) {
    return getDigprodPlanIntroType(row) === 'B2C-intro'
      ? DIGPROD_B2C_PLAN_ACTIVITY_FIELDS
      : DIGPROD_B2B_PLAN_ACTIVITY_FIELDS;
  }

  function getDigprodPlanSourceKey(rowId) {
    return String(rowId || '').trim();
  }

  function getDigprodPlanCount(rowId) {
    const key = getDigprodPlanSourceKey(rowId);
    if (!key) return 0;
    return Number(state.digprodPlanCountsBySourceId?.[key] || 0);
  }

  function getCurrentDigprodPlanRow() {
    const rowId = getDigprodPlanSourceKey(state.digprodPlanRowId);
    if (!rowId) return null;
    return (state.rowsByTable?.['DIG PROD'] || []).find((row) => String(row.id) === rowId) || null;
  }

  function getDigprodPlanRows(rowId) {
    const key = getDigprodPlanSourceKey(rowId);
    return key ? (state.digprodPlanRowsBySourceId[key] || []) : [];
  }

  function getDigprodPlanItem(rowId, activityKey) {
    const key = String(activityKey || '').trim();
    return getDigprodPlanRows(rowId).find((item) => String(item.activity_key || '').trim() === key) || null;
  }

  function getDigprodPlanIntroType(row) {
    return normalizeDigProdIntroCategory(row?.kategori) || 'B2B-intro';
  }

  function getDigprodPlanMilestone(row) {
    const saljRow = getSaljintroRowForDigProdRow(row);
    if (getDigprodPlanIntroType(row) === 'B2C-intro') {
      return {
        label: 'Lager Lev',
        note: 'Från Säljintro',
        value: saljRow?.po_lager_slut_datum || '',
      };
    }
    return {
      label: 'Sample Lev',
      note: 'Från Säljintro',
      value: saljRow?.po_beslut_slut_datum || '',
    };
  }

  function getDigprodPlanDeadlineField(row) {
    return getDigprodPlanIntroType(row) === 'B2C-intro' ? 'b2c_slut_datum' : 'b2b_slut_datum';
  }

  function getDigprodPlanDeadlineLabel(row) {
    return getDigprodPlanIntroType(row) === 'B2C-intro' ? 'B2C' : 'B2B';
  }

  function getDigprodPlanDeadlineKey(rowId) {
    return getDigprodPlanSourceKey(rowId);
  }

  function findLanseringsplanRowForDigprodRow(row) {
    const productKey = normalizeLanseringsplanProductName(row?.produktnamn);
    if (!productKey) return null;
    return (state.rowsByTable?.['LANSERINGSPLAN'] || []).find((candidate) => (
      normalizeLanseringsplanProductName(candidate?.produkt) === productKey
    )) || null;
  }

  function getDigprodPlanDeadline(row) {
    const key = getDigprodPlanDeadlineKey(row?.id);
    const cached = key ? state.digprodPlanDeadlinesBySourceId?.[key] : null;
    if (cached) return cached;
    const lanseringsplanRow = findLanseringsplanRowForDigprodRow(row);
    const field = getDigprodPlanDeadlineField(row);
    return {
      label: getDigprodPlanDeadlineLabel(row),
      value: lanseringsplanRow?.[field] || '',
    };
  }

  async function loadDigprodPlanDeadline(row) {
    const key = getDigprodPlanDeadlineKey(row?.id);
    if (!key) return null;
    const field = getDigprodPlanDeadlineField(row);
    const fromState = findLanseringsplanRowForDigprodRow(row);
    if (fromState) {
      const deadline = { label: getDigprodPlanDeadlineLabel(row), value: fromState?.[field] || '' };
      state.digprodPlanDeadlinesBySourceId[key] = deadline;
      return deadline;
    }

    const productName = String(row?.produktnamn || '').trim();
    if (!productName) {
      const deadline = { label: getDigprodPlanDeadlineLabel(row), value: '' };
      state.digprodPlanDeadlinesBySourceId[key] = deadline;
      return deadline;
    }

    const { data, error } = await supabase
      .from('lanseringsplan')
      .select(`id, produkt, b2b_slut_datum, b2c_slut_datum`)
      .ilike('produkt', productName)
      .limit(5);

    if (error) {
      console.warn('Could not load Lanseringsplan deadline for DIG PROD plan:', error.message);
      const deadline = { label: getDigprodPlanDeadlineLabel(row), value: '' };
      state.digprodPlanDeadlinesBySourceId[key] = deadline;
      return deadline;
    }

    const normalizedProduct = normalizeLanseringsplanProductName(productName);
    const match = (data || []).find((candidate) => normalizeLanseringsplanProductName(candidate?.produkt) === normalizedProduct) || (data || [])[0] || null;
    const deadline = { label: getDigprodPlanDeadlineLabel(row), value: match?.[field] || '' };
    state.digprodPlanDeadlinesBySourceId[key] = deadline;
    return deadline;
  }

  async function loadDigprodPlanCounts() {
    const rows = state.rowsByTable?.['DIG PROD'] || [];
    if (!rows.length) {
      state.digprodPlanCountsBySourceId = {};
      return;
    }

    const ids = rows.map((row) => getDigprodPlanSourceKey(row.id)).filter(Boolean);
    if (!ids.length) {
      state.digprodPlanCountsBySourceId = {};
      return;
    }

    const { data, error } = await supabase
      .from('digprod_intro_plan')
      .select('id, source_row_id, due_date, owners')
      .eq('source_table', 'dig_prod')
      .in('source_row_id', ids);

    if (error) {
      console.warn('Could not load DIG PROD plan counts:', error.message);
      return;
    }

    const counts = {};
    ids.forEach((id) => { counts[id] = 0; });
    (data || []).forEach((item) => {
      const key = getDigprodPlanSourceKey(item.source_row_id);
      if (!key) return;
      const owners = Array.isArray(item.owners) ? item.owners.filter(Boolean) : [];
      if (item.due_date || owners.length) counts[key] = (counts[key] || 0) + 1;
    });
    state.digprodPlanCountsBySourceId = counts;
  }

  async function loadDigprodPlanRows(rowId) {
    const key = getDigprodPlanSourceKey(rowId);
    if (!key) return [];

    state.digprodPlanLoading = true;
    render();

    const { data, error } = await supabase
      .from('digprod_intro_plan')
      .select('*')
      .eq('source_table', 'dig_prod')
      .eq('source_row_id', key)
      .order('sort_order', { ascending: true })
      .order('activity_label', { ascending: true });

    state.digprodPlanLoading = false;

    if (error) {
      alert(`Kunde inte läsa tidplan: ${error.message}`);
      render();
      return [];
    }

    const rows = data || [];
    state.digprodPlanRowsBySourceId[key] = rows;
    state.digprodPlanCountsBySourceId[key] = rows.filter((item) => {
      const owners = Array.isArray(item.owners) ? item.owners.filter(Boolean) : [];
      return item.due_date || owners.length;
    }).length;
    render();
    return rows;
  }

  async function openDigprodPlanPanel(row) {
    if (!row?.id) return;
    state.settingsPanelOpen = false;
    state.linksPanelOpen = false;
    state.messagesPanelOpen = false;
    state.archivePanelOpen = false;
    state.rowTodoPanelOpen = false;
    state.notesPanelOpen = false;
    state.columnChecklistPanelOpen = false;
    state.cdmpProvmattorPanelOpen = false;
    state.detailRowId = null;
    state.newRowDraft = null;
    state.digprodPlanPanelMode = 'plan';
    state.lanseringsplanIntroSourceId = null;
    state.digprodPlanPanelOpen = true;
    state.digprodPlanRowId = row.id;
    document.body?.classList?.add('is-digprod-plan-print-ready');
    await loadDigprodPlanDeadline(row);
    await loadDigprodPlanRows(row.id);
  }

  function closeDigprodPlanPanel() {
    document.body?.classList?.remove('is-digprod-plan-print-ready');
    state.digprodPlanPanelOpen = false;
    state.digprodPlanPanelMode = 'plan';
    state.digprodPlanRowId = null;
    state.lanseringsplanIntroSourceId = null;
    closeCdmpProvmattorDatePicker();
    render();
  }

  async function upsertDigprodPlanItem(row, activity, patch) {
    if (!row?.id || !activity?.field) return;
    const key = getDigprodPlanSourceKey(row.id);
    const previousRows = getDigprodPlanRows(key);
    const existing = previousRows.find((item) => String(item.activity_key) === String(activity.field));
    const nextOwners = Array.isArray(patch.owners) ? patch.owners.map((item) => String(item || '').trim()).filter(Boolean) : undefined;
    const payload = {
      source_table: 'dig_prod',
      source_row_id: key,
      intro_type: getDigprodPlanIntroType(row),
      activity_key: activity.field,
      activity_label: activity.label,
      sort_order: getDigprodPlanActivityFields(row).findIndex((item) => item.field === activity.field) * 100 + 100,
      ...(Object.prototype.hasOwnProperty.call(patch, 'due_date') ? { due_date: String(patch.due_date || '').trim() || null } : {}),
      ...(nextOwners !== undefined ? { owners: nextOwners } : {}),
    };

    let optimisticRows;
    if (existing) {
      optimisticRows = previousRows.map((item) => String(item.id) === String(existing.id) ? { ...item, ...payload } : item);
    } else {
      optimisticRows = [...previousRows, { ...payload, id: `local-${Date.now()}` }];
    }
    state.digprodPlanRowsBySourceId[key] = optimisticRows;
    state.digprodPlanCountsBySourceId[key] = optimisticRows.filter((item) => {
      const owners = Array.isArray(item.owners) ? item.owners.filter(Boolean) : [];
      return item.due_date || owners.length;
    }).length;
    render();

    const query = supabase
      .from('digprod_intro_plan')
      .upsert(payload, { onConflict: 'source_table,source_row_id,activity_key' })
      .select('*')
      .single();

    const { data, error } = await query;
    if (error) {
      state.digprodPlanRowsBySourceId[key] = previousRows;
      state.digprodPlanCountsBySourceId[key] = previousRows.filter((item) => {
        const owners = Array.isArray(item.owners) ? item.owners.filter(Boolean) : [];
        return item.due_date || owners.length;
      }).length;
      alert(`Kunde inte spara tidplan: ${error.message}`);
      render();
      return;
    }

    const refreshedRows = state.digprodPlanRowsBySourceId[key] || [];
    const replaced = refreshedRows.some((item) => String(item.activity_key) === String(activity.field));
    state.digprodPlanRowsBySourceId[key] = replaced
      ? refreshedRows.map((item) => String(item.activity_key) === String(activity.field) ? data : item)
      : [...refreshedRows, data];
    state.digprodPlanCountsBySourceId[key] = state.digprodPlanRowsBySourceId[key].filter((item) => {
      const owners = Array.isArray(item.owners) ? item.owners.filter(Boolean) : [];
      return item.due_date || owners.length;
    }).length;
    render();
  }

  function createDigprodPlanButton(row, column) {
    const hasPlan = getDigprodPlanCount(row?.id) > 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'digprod-plan-icon-button';
    button.title = hasPlan ? 'Öppna tidplan' : 'Skapa tidplan';
    button.setAttribute('aria-label', hasPlan ? 'Öppna tidplan' : 'Skapa tidplan');
    button.innerHTML = '<span class="digprod-plan-icon" aria-hidden="true">📋</span>';
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await openDigprodPlanPanel(row);
    });
    return button;
  }

  function createDigprodPlanStatusCell(row, activity) {
    const value = normalizeStatusValue(row?.[activity.field] || 'gray');
    const span = document.createElement('span');
    span.className = `cell-chip status-button--${value}`;
    span.textContent = DIGPROD_STATUS_LABELS[value] || value;
    return span;
  }

  function createDigprodPlanOwnersDisplay(selectedOwners) {
    const owners = (Array.isArray(selectedOwners) ? selectedOwners : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const span = document.createElement('span');
    span.className = owners.length ? 'cell-text' : 'cell-text cell-text--muted';
    span.textContent = owners.join(', ');
    return span;
  }

  function createDigprodPlanOwnersControl(row, activity, selectedOwners) {
    const selectedSet = new Set((Array.isArray(selectedOwners) ? selectedOwners : []).map((item) => String(item || '').trim()).filter(Boolean));
    const details = document.createElement('details');
    details.className = 'digprod-plan-owner-dropdown';

    const summary = document.createElement('summary');
    summary.className = 'digprod-plan-owner-dropdown__summary';
    const selectedText = Array.from(selectedSet).join(', ');
    summary.textContent = selectedText || '';
    summary.title = selectedText ? `Ansvarig: ${selectedText}` : 'Välj ansvarig';
    summary.setAttribute('aria-label', selectedText ? `Ansvarig: ${selectedText}` : 'Välj ansvarig');
    details.appendChild(summary);

    const menu = document.createElement('div');
    menu.className = 'digprod-plan-owner-dropdown__menu';
    getOwnerOptions('').forEach((initials) => {
      const label = document.createElement('label');
      label.className = 'digprod-plan-owner-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = initials;
      input.checked = selectedSet.has(initials);
      input.addEventListener('change', async () => {
        const nextOwners = Array.from(menu.querySelectorAll('input[type="checkbox"]'))
          .filter((item) => item.checked)
          .map((item) => item.value);
        summary.textContent = nextOwners.join(', ') || '';
        summary.title = nextOwners.length ? `Ansvarig: ${nextOwners.join(', ')}` : 'Välj ansvarig';
        summary.setAttribute('aria-label', nextOwners.length ? `Ansvarig: ${nextOwners.join(', ')}` : 'Välj ansvarig');
        await upsertDigprodPlanItem(row, activity, { owners: nextOwners });
      });
      const text = document.createElement('span');
      text.textContent = initials;
      label.appendChild(input);
      label.appendChild(text);
      menu.appendChild(label);
    });
    details.appendChild(menu);
    return details;
  }

  function getDigprodPlanPrintDate() {
    try {
      return new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (err) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function createDigprodPlanPrintView(row, rows, deadline) {
    const article = document.createElement('article');
    article.className = 'digprod-plan-print';

    const header = document.createElement('header');
    header.className = 'digprod-plan-print__header';

    const titleBlock = document.createElement('div');
    const eyebrow = document.createElement('p');
    eyebrow.className = 'digprod-plan-print__eyebrow';
    eyebrow.textContent = 'Cappelen Dimyr – DIG PROD';
    const title = document.createElement('h1');
    title.textContent = 'Tidplan';
    const meta = document.createElement('p');
    meta.className = 'digprod-plan-print__meta';
    meta.textContent = `Produkt: ${row.produktnamn || '—'} · Intro: ${getDigprodPlanIntroType(row)} · DEADLINE: ${formatWeekFromDateValue(deadline?.value) || '—'} · Utskriven: ${getDigprodPlanPrintDate()}`;
    titleBlock.appendChild(eyebrow);
    titleBlock.appendChild(title);
    titleBlock.appendChild(meta);

    const deadlineBox = document.createElement('div');
    deadlineBox.className = 'digprod-plan-print__sample';
    const deadlineLabel = document.createElement('span');
    deadlineLabel.textContent = 'DEADLINE';
    const deadlineValue = document.createElement('strong');
    deadlineValue.textContent = formatWeekFromDateValue(deadline?.value) || '—';
    deadlineBox.appendChild(deadlineLabel);
    deadlineBox.appendChild(deadlineValue);

    header.appendChild(titleBlock);
    header.appendChild(deadlineBox);
    article.appendChild(header);

    const table = document.createElement('table');
    table.className = 'digprod-plan-print__table';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Aktivitet', 'Status', 'Klart', 'Ansvar'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    getDigprodPlanActivityFields(row).forEach((activity) => {
      const item = rows.find((entry) => String(entry.activity_key || '').trim() === activity.field) || {};
      const statusValue = normalizeStatusValue(row?.[activity.field] || 'gray');
      const owners = Array.isArray(item.owners) ? item.owners.map((owner) => String(owner || '').trim()).filter(Boolean).join(', ') : '';
      const tr = document.createElement('tr');

      const activityTd = document.createElement('td');
      activityTd.textContent = activity.label;
      tr.appendChild(activityTd);

      const statusTd = document.createElement('td');
      const statusSpan = document.createElement('span');
      statusSpan.className = `digprod-plan-print__status digprod-plan-print__status--${statusValue}`;
      statusSpan.textContent = DIGPROD_STATUS_LABELS[statusValue] || statusValue;
      statusTd.appendChild(statusSpan);
      tr.appendChild(statusTd);

      const dueTd = document.createElement('td');
      dueTd.textContent = formatWeekFromDateValue(item.due_date) || '—';
      tr.appendChild(dueTd);

      const ownerTd = document.createElement('td');
      ownerTd.textContent = owners || '—';
      tr.appendChild(ownerTd);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    article.appendChild(table);

    const footer = document.createElement('footer');
    footer.className = 'digprod-plan-print__footer';
    footer.textContent = `Status speglas från DIG PROD. DEADLINE hämtas från ${deadline?.label || 'Lanseringsplan'} i Lanseringsplan.`;
    article.appendChild(footer);

    return article;
  }

  function printDigprodPlan() {
    window.setTimeout(() => window.print(), 0);
  }


  function getDigprodIntroModalColumns(row) {
    const introType = getDigprodPlanIntroType(row);
    const digConfig = APP_CONFIG.tables?.['DIG PROD'];
    return (digConfig?.columns || []).filter((column) => {
      if (!column || column.field === 'id' || column.hiddenInTable) return false;
      if (Array.isArray(column.digprodCategories) && !column.digprodCategories.includes(introType)) return false;
      if (column.field === 'kategori') return false;
      return true;
    });
  }

  function createDigprodIntroTextEditor(row, column, options = {}) {
    const isMultiline = isMultilineTextColumn(column);
    const input = document.createElement(isMultiline ? 'textarea' : 'input');
    input.className = isMultiline ? 'cell-editor cell-editor--textarea' : 'cell-editor';
    if (!isMultiline) input.type = 'text';
    input.value = row[column.field] ?? '';
    input.placeholder = column.name || '';

    let saving = false;
    const commit = async () => {
      if (saving) return;
      saving = true;
      await saveCellValue(APP_CONFIG.tables['DIG PROD'], row, column, input.value);
      saving = false;
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', async (event) => {
      if (event.key === 'Escape') {
        input.value = row[column.field] ?? '';
        input.blur();
        return;
      }
      if (!isMultiline && event.key === 'Enter') {
        event.preventDefault();
        await commit();
      }
      if (isMultiline && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        await commit();
      }
    });

    if (options.readonly) {
      input.readOnly = true;
      input.classList.add('cell-editor--readonly');
    }

    return input;
  }

  function createDigprodIntroModalCell(row, column) {
    const digConfig = APP_CONFIG.tables?.['DIG PROD'];
    const wrap = document.createElement('div');
    wrap.className = 'lanseringsplan-intro-modal__cell-content';

    if (isDigprodPlanColumn(column)) {
      wrap.appendChild(createDigprodPlanButton(row, column));
      return wrap;
    }

    if (isStatusColumn(column)) {
      const button = createStatusButton(column, row[column.field], false, row);
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await toggleStatusCell(digConfig, row, column);
      });
      wrap.appendChild(button);
      return wrap;
    }

    if (isEditableTextColumn(column)) {
      wrap.appendChild(createDigprodIntroTextEditor(row, column, { readonly: column?.mods?.readonly === true }));
      return wrap;
    }

    wrap.appendChild(createStaticCellContent(row, column));
    return wrap;
  }

  function createDigprodIntroRowModal() {
    const row = getCurrentDigprodPlanRow();
    if (!row) return document.createDocumentFragment();

    const introType = getDigprodPlanIntroType(row);
    const titleLabel = introType === 'B2C-intro' ? 'B2C Intro' : 'B2B Intro';
    const columns = getDigprodIntroModalColumns(row);

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal lanseringsplan-intro-modal lanseringsplan-intro-modal--wide';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    const dialog = document.createElement('div');
    dialog.className = 'overlay-modal__dialog';
    const panel = document.createElement('section');
    panel.className = 'side-panel lanseringsplan-intro-modal__panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    heading.className = 'todo-modal__heading';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'side-panel__eyebrow';
    eyebrow.textContent = 'DIG PROD';
    const title = document.createElement('h2');
    title.className = 'side-panel__title';
    title.textContent = `${titleLabel} – ${row.produktnamn || 'produkt'}`;
    const text = document.createElement('p');
    text.className = 'side-panel__text';
    text.textContent = 'Redigera samma DIG PROD-rad som visas i B2B/B2C Intro. Ändringarna sparas direkt.';
    heading.appendChild(eyebrow);
    heading.appendChild(title);
    heading.appendChild(text);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.addEventListener('click', closeDigprodPlanPanel);

    header.appendChild(heading);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    const tableWrap = document.createElement('div');
    tableWrap.className = 'analysis-table-wrap lanseringsplan-intro-modal__table-wrap';
    const table = document.createElement('table');
    table.className = 'analysis-table lanseringsplan-intro-modal__table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const checklistContextTableName = introType === 'B2C-intro' ? 'B2C Intro' : 'B2B Intro';
    columns.forEach((column) => {
      const th = document.createElement('th');
      const headerContent = document.createElement('span');
      headerContent.className = 'column-header__content';
      const label = document.createElement('span');
      label.className = 'column-header__label';
      label.textContent = column.name;
      headerContent.appendChild(label);
      const checklistBadge = createChecklistBadge(checklistContextTableName, column);
      if (checklistBadge) headerContent.appendChild(checklistBadge);
      th.appendChild(headerContent);
      if (column.width) th.style.width = column.width;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    columns.forEach((column) => {
      const td = document.createElement('td');
      td.className = `align-${getAlignment(column)}`;
      td.appendChild(createDigprodIntroModalCell(row, column));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    body.appendChild(tableWrap);

    panel.appendChild(header);
    panel.appendChild(body);
    dialog.appendChild(panel);
    overlay.appendChild(dialog);
    return overlay;
  }

  function createDigprodPlanPanel() {
    if (state.digprodPlanPanelMode === 'intro_row') {
      return createDigprodIntroRowModal();
    }

    const row = getCurrentDigprodPlanRow();
    if (!row) return document.createDocumentFragment();
    const rowId = getDigprodPlanSourceKey(row.id);
    const rows = getDigprodPlanRows(rowId);
    const deadline = getDigprodPlanDeadline(row);
    const showOwnerControls = isAdmin();

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal digprod-plan-modal';
    const dialog = document.createElement('div');
    dialog.className = 'overlay-modal__dialog';
    const panel = document.createElement('section');
    panel.className = 'side-panel digprod-plan-panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';
    const heading = document.createElement('div');
    heading.className = 'todo-modal__heading';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'side-panel__eyebrow';
    eyebrow.textContent = 'DIG PROD';
    const title = document.createElement('h2');
    title.className = 'side-panel__title';
    title.textContent = `Tidplan – ${row.produktnamn || 'produkt'} · DEADLINE ${formatWeekFromDateValue(deadline?.value) || '—'}`;
    const text = document.createElement('p');
    text.className = 'side-panel__text';
    text.textContent = `Status speglas från DIG PROD-kolumnerna. DEADLINE hämtas från ${deadline?.label || 'B2B/B2C'} i Lanseringsplan. Klart hanteras här. Ansvar visas för alla; admin sätter ansvarig längst till höger.`;
    heading.appendChild(eyebrow);
    heading.appendChild(title);
    heading.appendChild(text);

    const headerActions = document.createElement('div');
    headerActions.className = 'side-panel__header-actions';
    const printButton = document.createElement('button');
    printButton.type = 'button';
    printButton.className = 'secondary-button';
    printButton.textContent = 'Print / PDF';
    printButton.addEventListener('click', printDigprodPlan);
    headerActions.appendChild(printButton);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.addEventListener('click', closeDigprodPlanPanel);
    header.appendChild(heading);
    header.appendChild(headerActions);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    if (state.digprodPlanLoading) {
      const loading = document.createElement('p');
      loading.className = 'empty-state';
      loading.textContent = 'Laddar tidplan...';
      body.appendChild(loading);
    } else {
      const tableWrap = document.createElement('div');
      tableWrap.className = 'digprod-plan-table-wrap';
      const table = document.createElement('table');
      table.className = 'digprod-plan-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      (showOwnerControls ? ['Aktivitet', 'Status', 'Klart', 'Ansvar', 'Ansvarig'] : ['Aktivitet', 'Status', 'Klart', 'Ansvar']).forEach((label) => {
        const th = document.createElement('th');
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');


      getDigprodPlanActivityFields(row).forEach((activity) => {
        const item = rows.find((entry) => String(entry.activity_key || '').trim() === activity.field) || {};
        const tr = document.createElement('tr');

        const activityTd = document.createElement('td');
        activityTd.textContent = activity.label;
        tr.appendChild(activityTd);

        const statusTd = document.createElement('td');
        statusTd.appendChild(createDigprodPlanStatusCell(row, activity));
        tr.appendChild(statusTd);

        const dueTd = document.createElement('td');
        const dueButton = document.createElement('button');
        dueButton.type = 'button';
        dueButton.className = item.due_date ? 'cell-chip status-week-cell__date-trigger digprod-plan-date-button' : 'cell-chip status-week-cell__date-trigger status-week-cell__date-trigger--empty digprod-plan-date-button';
        dueButton.textContent = formatWeekFromDateValue(item.due_date) || '📅';
        dueButton.title = item.due_date ? 'Ändra Klart' : 'Välj Klart';
        dueButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openCdmpProvmattorDatePicker(dueButton, item.due_date, async (nextValue) => {
            await upsertDigprodPlanItem(row, activity, { due_date: nextValue });
          });
        });
        dueTd.appendChild(dueButton);
        tr.appendChild(dueTd);

        const ownersDisplayTd = document.createElement('td');
        ownersDisplayTd.appendChild(createDigprodPlanOwnersDisplay(item.owners));
        tr.appendChild(ownersDisplayTd);

        if (showOwnerControls) {
          const ownersActionTd = document.createElement('td');
          ownersActionTd.appendChild(createDigprodPlanOwnersControl(row, activity, item.owners));
          tr.appendChild(ownersActionTd);
        }

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);
      body.appendChild(tableWrap);
    }

    panel.appendChild(header);
    panel.appendChild(body);
    dialog.appendChild(panel);
    if (!state.digprodPlanLoading) {
      dialog.appendChild(createDigprodPlanPrintView(row, rows, deadline));
    }
    overlay.appendChild(dialog);
    return overlay;
  }

  let activeCdmpProvmattorDatePicker = null;

  function isCdmpTableConfig(tableConfig) {
    return tableConfig?.id === 'cdmp' || tableConfig?.dbTable === 'cdmp';
  }

  function getCdmpProvmattorCount(rowId) {
    const key = String(rowId || '').trim();
    if (!key) return 0;
    return Number(state.cdmpProvmattorCountsByCdmpId?.[key] || 0);
  }

  async function loadCdmpProvmattorCounts() {
    const cdmpConfig = APP_CONFIG.tables?.CDMP;
    const rows = state.rowsByTable?.CDMP || [];
    if (!cdmpConfig?.dbTable || !rows.length) {
      state.cdmpProvmattorCountsByCdmpId = {};
      return;
    }

    const ids = rows.map((row) => row.id).filter(Boolean);
    if (!ids.length) {
      state.cdmpProvmattorCountsByCdmpId = {};
      return;
    }

    const { data, error } = await supabase
      .from('cdmp_provmattor')
      .select('id, cdmp_id')
      .in('cdmp_id', ids);

    if (error) {
      console.warn('Could not load CDMP provmattor counts:', error.message);
      return;
    }

    const nextCounts = {};
    ids.forEach((id) => { nextCounts[String(id)] = 0; });
    (data || []).forEach((item) => {
      const key = String(item.cdmp_id || '').trim();
      if (!key) return;
      nextCounts[key] = (nextCounts[key] || 0) + 1;
    });
    state.cdmpProvmattorCountsByCdmpId = nextCounts;
  }

  function getCurrentCdmpProvmattorRow() {
    const rowId = String(state.cdmpProvmattorRowId || '').trim();
    if (!rowId) return null;
    return (state.rowsByTable?.CDMP || []).find((row) => String(row.id) === rowId) || null;
  }

  async function loadCdmpProvmattorRows(cdmpRowId) {
    const key = String(cdmpRowId || '').trim();
    if (!key) return [];

    state.cdmpProvmattorLoading = true;
    render();

    const { data, error } = await supabase
      .from('cdmp_provmattor')
      .select('*')
      .eq('cdmp_id', key)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    state.cdmpProvmattorLoading = false;

    if (error) {
      alert(`Kunde inte läsa provmattor: ${error.message}`);
      render();
      return [];
    }

    const rows = data || [];
    state.cdmpProvmattorRowsByCdmpId[key] = rows;
    state.cdmpProvmattorCountsByCdmpId[key] = rows.length;
    render();
    return rows;
  }

  async function openCdmpProvmattorPanel(row) {
    if (!row?.id) return;
    state.settingsPanelOpen = false;
    state.linksPanelOpen = false;
    state.messagesPanelOpen = false;
    state.archivePanelOpen = false;
    state.rowTodoPanelOpen = false;
    state.notesPanelOpen = false;
    state.columnChecklistPanelOpen = false;
    state.detailRowId = null;
    state.newRowDraft = null;
    state.cdmpProvmattorPanelOpen = true;
    state.cdmpProvmattorRowId = row.id;
    await loadCdmpProvmattorRows(row.id);
  }

  function closeCdmpProvmattorPanel() {
    state.cdmpProvmattorPanelOpen = false;
    state.cdmpProvmattorRowId = null;
    closeCdmpProvmattorDatePicker();
    render();
  }

  function closeCdmpProvmattorDatePicker() {
    if (!activeCdmpProvmattorDatePicker) return;
    const { panel, outsideHandler, keyHandler } = activeCdmpProvmattorDatePicker;
    document.removeEventListener('pointerdown', outsideHandler, true);
    document.removeEventListener('keydown', keyHandler, true);
    if (panel?.parentNode) panel.parentNode.removeChild(panel);
    activeCdmpProvmattorDatePicker = null;
  }

  function parseCdmpDateValue(value) {
    const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    return date;
  }

  function formatCdmpDateValue(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function getCdmpISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function getCdmpCalendarStartDate(monthDate) {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const mondayIndex = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayIndex);
    return start;
  }

  function getCdmpMonthLabel(date) {
    const months = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function sameCdmpDay(a, b) {
    return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function positionCdmpProvmattorDatePicker(panel, anchor) {
    const rect = anchor.getBoundingClientRect();
    panel.style.left = '0px';
    panel.style.top = '0px';
    panel.style.visibility = 'hidden';
    document.body.appendChild(panel);

    const panelRect = panel.getBoundingClientRect();
    const viewportGap = 10;
    const left = Math.min(Math.max(viewportGap, rect.left), Math.max(viewportGap, window.innerWidth - panelRect.width - viewportGap));
    const below = rect.bottom + 8;
    const above = rect.top - panelRect.height - 8;
    const top = below + panelRect.height <= window.innerHeight - viewportGap ? below : Math.max(viewportGap, above);

    panel.style.left = `${Math.round(left + window.scrollX)}px`;
    panel.style.top = `${Math.round(top + window.scrollY)}px`;
    panel.style.visibility = '';
  }

  function openCdmpProvmattorDatePicker(anchor, currentValue, onSelect) {
    if (!anchor || typeof onSelect !== 'function') return;
    closeCdmpProvmattorDatePicker();

    const selectedDate = parseCdmpDateValue(getDateInputValue(currentValue));
    const today = new Date();
    const initialDate = selectedDate || today;
    let visibleMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);

    const panel = document.createElement('div');
    panel.className = 'status-week-datepicker';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Välj datum');

    const renderCalendar = () => {
      panel.innerHTML = '';

      const header = document.createElement('div');
      header.className = 'status-week-datepicker__header';

      const prevButton = document.createElement('button');
      prevButton.type = 'button';
      prevButton.className = 'status-week-datepicker__nav';
      prevButton.textContent = '‹';
      prevButton.setAttribute('aria-label', 'Föregående månad');
      prevButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
        renderCalendar();
      });

      const title = document.createElement('div');
      title.className = 'status-week-datepicker__title';
      title.textContent = getCdmpMonthLabel(visibleMonth);

      const nextButton = document.createElement('button');
      nextButton.type = 'button';
      nextButton.className = 'status-week-datepicker__nav';
      nextButton.textContent = '›';
      nextButton.setAttribute('aria-label', 'Nästa månad');
      nextButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
        renderCalendar();
      });

      header.appendChild(prevButton);
      header.appendChild(title);
      header.appendChild(nextButton);
      panel.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'status-week-datepicker__grid';
      ['V', 'M', 'T', 'O', 'T', 'F', 'L', 'S'].forEach((heading, index) => {
        const cell = document.createElement('div');
        cell.className = index === 0 ? 'status-week-datepicker__weekday status-week-datepicker__week-heading' : 'status-week-datepicker__weekday';
        cell.textContent = heading;
        grid.appendChild(cell);
      });

      const startDate = getCdmpCalendarStartDate(visibleMonth);
      for (let week = 0; week < 6; week += 1) {
        const weekStart = new Date(startDate);
        weekStart.setDate(startDate.getDate() + week * 7);

        const weekCell = document.createElement('div');
        weekCell.className = 'status-week-datepicker__week-number';
        weekCell.textContent = String(getCdmpISOWeekNumber(weekStart)).padStart(2, '0');
        grid.appendChild(weekCell);

        for (let day = 0; day < 7; day += 1) {
          const cellDate = new Date(weekStart);
          cellDate.setDate(weekStart.getDate() + day);
          const dateValue = formatCdmpDateValue(cellDate);
          const dayButton = document.createElement('button');
          dayButton.type = 'button';
          dayButton.className = 'status-week-datepicker__day';
          if (cellDate.getMonth() !== visibleMonth.getMonth()) dayButton.classList.add('is-outside-month');
          if (sameCdmpDay(cellDate, today)) dayButton.classList.add('is-today');
          if (sameCdmpDay(cellDate, selectedDate)) dayButton.classList.add('is-selected');
          dayButton.textContent = String(cellDate.getDate());
          dayButton.setAttribute('aria-label', dateValue);
          dayButton.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeCdmpProvmattorDatePicker();
            await onSelect(dateValue);
          });
          grid.appendChild(dayButton);
        }
      }
      panel.appendChild(grid);

      const footer = document.createElement('div');
      footer.className = 'status-week-datepicker__footer';
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'status-week-datepicker__footer-button';
      clearButton.textContent = 'Rensa';
      clearButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeCdmpProvmattorDatePicker();
        await onSelect('');
      });
      const todayButton = document.createElement('button');
      todayButton.type = 'button';
      todayButton.className = 'status-week-datepicker__footer-button';
      todayButton.textContent = 'Idag';
      todayButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeCdmpProvmattorDatePicker();
        await onSelect(formatCdmpDateValue(new Date()));
      });
      footer.appendChild(clearButton);
      footer.appendChild(todayButton);
      panel.appendChild(footer);
    };

    renderCalendar();

    const outsideHandler = (event) => {
      if (panel.contains(event.target) || anchor.contains(event.target)) return;
      closeCdmpProvmattorDatePicker();
    };
    const keyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCdmpProvmattorDatePicker();
      }
    };

    activeCdmpProvmattorDatePicker = { panel, outsideHandler, keyHandler };
    positionCdmpProvmattorDatePicker(panel, anchor);
    document.addEventListener('pointerdown', outsideHandler, true);
    document.addEventListener('keydown', keyHandler, true);
  }

  async function createCdmpProvmattorRow(cdmpRowId) {
    const key = String(cdmpRowId || '').trim();
    if (!key) return;
    const existing = state.cdmpProvmattorRowsByCdmpId[key] || [];
    const nextSortOrder = existing.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0) + 100;

    const { data, error } = await supabase
      .from('cdmp_provmattor')
      .insert({ cdmp_id: key, namn: '', storlek: '', antal: '', prel_lev: null, sort_order: nextSortOrder })
      .select('*')
      .single();

    if (error) {
      alert(`Kunde inte skapa provmatta: ${error.message}`);
      return;
    }

    state.cdmpProvmattorRowsByCdmpId[key] = [...existing, data];
    state.cdmpProvmattorCountsByCdmpId[key] = state.cdmpProvmattorRowsByCdmpId[key].length;
    render();
  }

  async function saveCdmpProvmattorField(cdmpRowId, itemId, field, value) {
    const key = String(cdmpRowId || '').trim();
    const rows = state.cdmpProvmattorRowsByCdmpId[key] || [];
    const index = rows.findIndex((item) => String(item.id) === String(itemId));
    if (index < 0) return;

    const nextValue = field === 'prel_lev' ? (String(value || '').trim() || null) : String(value || '').trim();
    const previousValue = rows[index][field] ?? '';
    if (String(previousValue || '') === String(nextValue || '')) return;

    rows[index] = { ...rows[index], [field]: nextValue };
    state.cdmpProvmattorRowsByCdmpId[key] = [...rows];
    render();

    const { error } = await supabase
      .from('cdmp_provmattor')
      .update({ [field]: nextValue })
      .eq('id', itemId);

    if (error) {
      rows[index] = { ...rows[index], [field]: previousValue };
      state.cdmpProvmattorRowsByCdmpId[key] = [...rows];
      alert(`Kunde inte spara provmatta: ${error.message}`);
      render();
    }
  }

  async function deleteCdmpProvmattorRow(cdmpRowId, itemId) {
    if (!confirm('Radera provmatta?')) return;
    const key = String(cdmpRowId || '').trim();
    const previousRows = state.cdmpProvmattorRowsByCdmpId[key] || [];
    state.cdmpProvmattorRowsByCdmpId[key] = previousRows.filter((item) => String(item.id) !== String(itemId));
    state.cdmpProvmattorCountsByCdmpId[key] = state.cdmpProvmattorRowsByCdmpId[key].length;
    render();

    const { error } = await supabase
      .from('cdmp_provmattor')
      .delete()
      .eq('id', itemId);

    if (error) {
      state.cdmpProvmattorRowsByCdmpId[key] = previousRows;
      state.cdmpProvmattorCountsByCdmpId[key] = previousRows.length;
      alert(`Kunde inte radera provmatta: ${error.message}`);
      render();
    }
  }

  function createCdmpProvmattorButton(row, column) {
    const hasRows = getCdmpProvmattorCount(row?.id) > 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = hasRows
      ? 'excel-link-button excel-link-button--linked provmattor-button'
      : 'excel-link-button excel-link-button--empty provmattor-button';
    button.title = hasRows ? 'Öppna provmattor' : 'Lägg till provmattor';
    button.setAttribute('aria-label', hasRows ? 'Öppna provmattor' : 'Lägg till provmattor');
    button.innerHTML = '<span class="excel-link-button__icon" aria-hidden="true">X</span>';
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await openCdmpProvmattorPanel(row);
    });
    return button;
  }

  function createCdmpProvmattorPanel() {
    const row = getCurrentCdmpProvmattorRow();
    if (!row) return document.createDocumentFragment();
    const rowId = String(row.id);
    const rows = state.cdmpProvmattorRowsByCdmpId[rowId] || [];

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal provmattor-modal';
    const dialog = document.createElement('div');
    dialog.className = 'overlay-modal__dialog';
    const panel = document.createElement('section');
    panel.className = 'side-panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';
    const heading = document.createElement('div');
    heading.className = 'todo-modal__heading';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'side-panel__eyebrow';
    eyebrow.textContent = 'CDMP';
    const title = document.createElement('h2');
    title.className = 'side-panel__title';
    title.textContent = 'Provmattor';
    const text = document.createElement('p');
    text.className = 'side-panel__text';
    text.textContent = row.namn || 'Redigera provmattor för aktuell rad.';
    heading.appendChild(eyebrow);
    heading.appendChild(title);
    heading.appendChild(text);

    const headerActions = document.createElement('div');
    headerActions.className = 'side-panel__header-actions';
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'primary-button';
    addButton.textContent = '+ Lägg till';
    addButton.addEventListener('click', async () => createCdmpProvmattorRow(rowId));
    headerActions.appendChild(addButton);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.addEventListener('click', closeCdmpProvmattorPanel);

    header.appendChild(heading);
    header.appendChild(headerActions);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    if (state.cdmpProvmattorLoading) {
      const loading = document.createElement('p');
      loading.className = 'empty-state';
      loading.textContent = 'Laddar provmattor...';
      body.appendChild(loading);
    } else {
      const tableWrap = document.createElement('div');
      tableWrap.className = 'provmattor-table-wrap';
      const table = document.createElement('table');
      table.className = 'provmattor-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      ['Namn', 'Storlek', 'Antal', 'Prel LEV', ''].forEach((label) => {
        const th = document.createElement('th');
        th.textContent = label;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.className = 'empty-row';
        td.textContent = 'Inga provmattor ännu.';
        tr.appendChild(td);
        tbody.appendChild(tr);
      }

      rows.forEach((item) => {
        const tr = document.createElement('tr');
        ['namn', 'storlek', 'antal'].forEach((field) => {
          const td = document.createElement('td');
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'cell-editor provmattor-input';
          input.value = item[field] || '';
          input.addEventListener('blur', async () => saveCdmpProvmattorField(rowId, item.id, field, input.value));
          input.addEventListener('keydown', async (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              input.blur();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              input.value = item[field] || '';
              input.blur();
            }
          });
          td.appendChild(input);
          tr.appendChild(td);
        });

        const dateTd = document.createElement('td');
        const dateButton = document.createElement('button');
        dateButton.type = 'button';
        dateButton.className = item.prel_lev ? 'cell-chip status-week-cell__date-trigger provmattor-date-button' : 'cell-chip status-week-cell__date-trigger status-week-cell__date-trigger--empty provmattor-date-button';
        dateButton.textContent = formatWeekFromDateValue(item.prel_lev) || '📅';
        dateButton.title = item.prel_lev ? 'Ändra Prel LEV' : 'Välj Prel LEV';
        dateButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          openCdmpProvmattorDatePicker(dateButton, item.prel_lev, async (nextValue) => {
            await saveCdmpProvmattorField(rowId, item.id, 'prel_lev', nextValue);
          });
        });
        dateTd.appendChild(dateButton);
        tr.appendChild(dateTd);

        const actionTd = document.createElement('td');
        actionTd.className = 'is-center';
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'row-actions__button row-actions__button--danger';
        deleteButton.textContent = '✕';
        deleteButton.setAttribute('aria-label', 'Radera provmatta');
        deleteButton.addEventListener('click', async () => deleteCdmpProvmattorRow(rowId, item.id));
        actionTd.appendChild(deleteButton);
        tr.appendChild(actionTd);

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      tableWrap.appendChild(table);
      body.appendChild(tableWrap);
    }

    panel.appendChild(header);
    panel.appendChild(body);
    dialog.appendChild(panel);
    overlay.appendChild(dialog);
    return overlay;
  }

  function openExcelLinkModal(tableConfig, row, column) {
    if (!tableConfig || !row?.id || !column?.field) return;

    const existingValue = String(row[column.field] || '').trim();

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal excel-link-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });

    const dialog = document.createElement('div');
    dialog.className = 'overlay-modal__dialog';

    const panel = document.createElement('section');
    panel.className = 'side-panel excel-link-modal__panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'todo-modal__heading';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'side-panel__eyebrow';
    eyebrow.textContent = 'Offert';

    const title = document.createElement('h2');
    title.className = 'side-panel__title';
    title.textContent = existingValue ? 'Ändra Excel-länk' : 'Lägg till Excel-länk';

    const help = document.createElement('p');
    help.className = 'side-panel__text';
    help.textContent = 'Klistra in länken till Excel-filen i SharePoint.';

    titleWrap.appendChild(eyebrow);
    titleWrap.appendChild(title);
    titleWrap.appendChild(help);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => overlay.remove());

    header.appendChild(titleWrap);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    const field = document.createElement('label');
    field.className = 'detail-field';

    const label = document.createElement('span');
    label.className = 'detail-field__label';
    label.textContent = 'SharePoint-länk';

    const input = document.createElement('input');
    input.className = 'detail-field__control';
    input.type = 'url';
    input.inputMode = 'url';
    input.placeholder = 'https://...';
    input.value = existingValue;

    const hint = document.createElement('span');
    hint.className = 'detail-field__hint';
    hint.textContent = 'Spara enbart länken. Tabellen visar symbol och färg.';

    field.appendChild(label);
    field.appendChild(input);
    field.appendChild(hint);
    body.appendChild(field);

    const footer = document.createElement('div');
    footer.className = 'side-panel__footer';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-button';
    saveButton.textContent = 'Spara';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'secondary-button secondary-button--danger';
    clearButton.textContent = 'Rensa länk';
    clearButton.hidden = !existingValue;

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'secondary-button';
    cancelButton.textContent = 'Avbryt';
    cancelButton.addEventListener('click', () => overlay.remove());

    const saveLink = async (nextRawValue) => {
      const nextValue = String(nextRawValue || '').trim();
      if (nextValue && !getNormalizedExternalLink(nextValue)) {
        alert('Ange en giltig http/https-länk.');
        input.focus();
        return;
      }

      saveButton.disabled = true;
      clearButton.disabled = true;
      cancelButton.disabled = true;
      const saved = await saveCellValue(tableConfig, row, column, nextValue);
      if (saved) {
        overlay.remove();
        return;
      }
      saveButton.disabled = false;
      clearButton.disabled = false;
      cancelButton.disabled = false;
    };

    saveButton.addEventListener('click', async () => saveLink(input.value));
    clearButton.addEventListener('click', async () => saveLink(''));
    input.addEventListener('keydown', async (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        overlay.remove();
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        await saveLink(input.value);
      }
    });

    footer.appendChild(saveButton);
    footer.appendChild(cancelButton);
    footer.appendChild(clearButton);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    dialog.appendChild(panel);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  function createExcelLinkCellContent(row, column) {
    const hasLink = !!String(row?.[column.field] || '').trim();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = hasLink
      ? 'excel-link-button excel-link-button--linked'
      : 'excel-link-button excel-link-button--empty';
    button.title = hasLink ? 'Öppna offert. Högerklicka för att ändra länk.' : 'Lägg till offertlänk';
    button.setAttribute('aria-label', hasLink ? 'Öppna offertlänk' : 'Lägg till offertlänk');
    button.innerHTML = '<span class="excel-link-button__icon" aria-hidden="true">X</span>';

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const active = getActiveConfig();
      const [, tableConfig] = active || [];
      if (hasLink) {
        openExternalLinkInNewWindow(row[column.field]);
        return;
      }
      openExcelLinkModal(tableConfig, row, column);
    });

    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const active = getActiveConfig();
      const [, tableConfig] = active || [];
      openExcelLinkModal(tableConfig, row, column);
    });

    return button;
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

    if (isExcelLinkColumn(column)) {
      return createExcelLinkCellContent(row, column);
    }

    if (isCdmpProvmattorColumn(column)) {
      return createCdmpProvmattorButton(row, column);
    }

    if (isDigprodPlanColumn(column)) {
      return createDigprodPlanButton(row, column);
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
      if (column.dateDisplayMode === 'week') {
        const button = document.createElement('button');
        button.type = 'button';
        const weekLabel = formatWeekFromDateValue(text) || '📅';
        button.className = text
          ? 'cell-chip status-week-cell__date-trigger'
          : 'cell-chip status-week-cell__date-trigger status-week-cell__date-trigger--empty';
        button.textContent = weekLabel;
        button.dataset.dateField = column.field;
        button.dataset.dateValue = getDateInputValue(text);
        button.setAttribute('aria-label', `${column.name}: ${text ? 'ändra' : 'välj'} datum`);
        button.title = text ? 'Ändra datum' : 'Välj datum';
        return maybeWrapOwnerContent(button);
      }

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
    if (tableName === 'LANSERINGSPLAN') return 'produkt';
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
    createCdmpProvmattorPanel,
    createDigprodPlanPanel,
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
    saveDateCell,
    saveStatusWeekValue,
    toggleTodoDone,
    startEditing,
  });

  function getActiveMoodTableName() {
    const active = getActiveConfig?.();
    const fromActiveConfig = normalizeMoodTableName(active?.[0]);
    if (isMoodEnabledTable(fromActiveConfig)) return fromActiveConfig;

    const fromState = normalizeMoodTableName(state.activeTableName);
    if (isMoodEnabledTable(fromState)) return fromState;

    const activeNavText = String(document.querySelector('.table-nav__link.is-active')?.textContent || '').trim();
    const fromNav = normalizeMoodTableName(activeNavText);
    if (isMoodEnabledTable(fromNav)) return fromNav;

    const titleText = String(app.querySelector('.view-card__title')?.textContent || '').trim();
    const fromTitle = normalizeMoodTableName(titleText);
    if (isMoodEnabledTable(fromTitle)) return fromTitle;

    return '';
  }

  function bindMoodButton(button, tableName) {
    if (!button) return button;
    const normalized = normalizeMoodTableName(tableName || getActiveMoodTableName());
    button.dataset.action = 'mood';
    button.setAttribute('onclick', `window.TodoPlanningOpenMood && window.TodoPlanningOpenMood(${JSON.stringify(normalized)}); return false;`);
    button.onclick = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      event?.stopImmediatePropagation?.();
      openMoodPanel(normalized || getActiveMoodTableName());
      return false;
    };
    return button;
  }

  function createMoodToolbarButton(tableName) {
    const moodButton = document.createElement('button');
    moodButton.type = 'button';
    moodButton.className = 'secondary-button';
    moodButton.dataset.action = 'mood';
    moodButton.textContent = 'Collections';
    return bindMoodButton(moodButton, tableName);
  }

  function bindMoodToolbarDelegation() {
    if (document.body?.dataset.moodDelegationBound === 'true') return;
    if (!document.body) return;
    document.body.dataset.moodDelegationBound = 'true';
    document.body.addEventListener('click', (event) => {
      const target = event.target;
      const moodElement = target?.closest?.('[data-action="mood"], button, a');
      if (!moodElement) return;
      const action = String(moodElement.dataset?.action || '').trim().toLowerCase();
      const text = String(moodElement.textContent || '').trim().toLocaleLowerCase('sv-SE');
      if (action !== 'mood' && text !== 'mood') return;
      const tableName = getActiveMoodTableName();
      if (!isMoodEnabledTable(tableName)) return;
      event.preventDefault();
      event.stopPropagation();
      openMoodPanel(tableName);
    }, true);
  }

  async function render() {
    const result = await renderController.render();
    bindMoodToolbarDelegation();
    mountMoodPanel();
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
  await loadMoodFiles();
  await loadColumnChecklists();
  await loadLinks();
  await loadPlanningUsers();
  await loadMessages();
  await loadModalTodoRows();
  await projectsController.loadProjects();
  await loadCdmpProvmattorCounts();
  await loadDigprodPlanCounts();
  await loadLanseringsplanTimeRules();
  if (state.activeTableName) {
    await loadUnreadCountsForTable(state.activeTableName);
  }

  render();
}
