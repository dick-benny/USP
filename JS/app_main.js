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
} from './app_constants.js?v=211';
import { createTodoController } from './app_todo.js?v=211';
import { createRowTodoController } from './app_row_todo.js?v=211';
import { createNotesController } from './app_notes.js?v=211';
import { createSettingsController } from './app_settings.js?v=211';
import { createMessagesController } from './app_messages.js?v=211';
import { createRenderController } from './app_render.js?v=211';
import { createDataController } from './app_data.js?v=211';
import { createActionController } from './app_actions.js?v=211';
import { createFilterController } from './app_filters.js?v=211';
import { createColumnToolsController } from './app_column_tools.js?v=211';
import { createExcelPlanController } from './app_excel_plan.js?v=211';
import { createProjectsController } from './app_projects.js?v=211';
import { createWorkflowController } from './app_workflows.js?v=211';
import { createArchiveController } from './app_archive.js?v=211';
import './app_statistics.js?v=211';

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

  function getMoodFilesForTable(tableName) {
    return state.moodFilesByTable?.[tableName] || [];
  }

  function getMoodFileForSlot(tableName, slot) {
    return getMoodFilesForTable(tableName).find((item) => Number(item.slot) === Number(slot)) || null;
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
        const tableName = String(item.table_name || '').trim();
        if (!isMoodEnabledTable(tableName)) return;
        if (!grouped[tableName]) grouped[tableName] = [];
        grouped[tableName].push(item);
      });
      state.moodFilesByTable = grouped;
    } catch (err) {
      console.warn('Could not load Mood files:', err.message);
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
      console.error('Could not open Mood panel:', err);
      alert(`Kunde inte öppna Mood: ${err?.message || err}`);
    }
  }

  window.TodoPlanningOpenMood = (tableName) => openMoodPanel(tableName || getActiveMoodTableName());

  function closeMoodPanel() {
    state.moodPanelOpen = false;
    state.moodPanelTableName = '';
    const existingMoodPanel = document.querySelector('.side-panel-overlay[data-panel="mood"]');
    if (existingMoodPanel) existingMoodPanel.remove();
  }

  async function replaceMoodFile(tableName, slot, file) {
    if (!isAdmin()) {
      alert('Endast admin kan ladda upp eller byta Mood-fil.');
      return;
    }
    if (!isMoodEnabledTable(tableName)) return;
    if (!isPdfFile(file)) {
      alert('Välj en PDF-fil.');
      return;
    }

    const oldFile = getMoodFileForSlot(tableName, slot);
    const oldPath = normalizePdfPath(oldFile?.storage_path);

    state.moodLoading = true;
    render();

    try {
      const storagePath = await uploadPdfFile(file, { type: 'pdf' });
      const payload = {
        table_name: tableName,
        slot: Number(slot),
        storage_path: storagePath,
        original_name: file.name || null,
        uploaded_by: window.CurrentUser?.email || window.CurrentUser?.initials || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('planning_mood_files')
        .upsert(payload, { onConflict: 'table_name,slot' });

      if (error) throw error;

      if (oldPath && oldPath !== storagePath) {
        try {
          await removePdfFromStorage(oldPath);
        } catch (cleanupError) {
          console.warn('Old Mood file cleanup failed:', cleanupError);
        }
      }

      await loadMoodFiles();
    } catch (err) {
      alert(`Kunde inte spara Mood-fil: ${err.message}`);
    } finally {
      state.moodLoading = false;
      render();
    }
  }

  async function removeMoodFile(tableName, slot) {
    if (!isAdmin()) {
      alert('Endast admin kan ta bort Mood-fil.');
      return;
    }
    const item = getMoodFileForSlot(tableName, slot);
    if (!item) return;
    const confirmed = window.confirm('Ta bort Mood-fil?');
    if (!confirmed) return;

    state.moodLoading = true;
    render();

    try {
      const oldPath = normalizePdfPath(item.storage_path);
      const { error } = await supabase
        .from('planning_mood_files')
        .delete()
        .eq('table_name', tableName)
        .eq('slot', Number(slot));

      if (error) throw error;

      if (oldPath) {
        try {
          await removePdfFromStorage(oldPath);
        } catch (cleanupError) {
          console.warn('Mood file cleanup failed:', cleanupError);
        }
      }

      await loadMoodFiles();
    } catch (err) {
      alert(`Kunde inte ta bort Mood-fil: ${err.message}`);
    } finally {
      state.moodLoading = false;
      render();
    }
  }

  function createMoodPanel() {
    if (!state.moodPanelOpen || !isMoodEnabledTable(state.moodPanelTableName)) return null;

    const tableName = state.moodPanelTableName;
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
    dialog.setAttribute('aria-label', `Mood ${getMoodViewLabel(tableName)}`);

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const title = document.createElement('div');
    title.className = 'side-panel__title';
    title.textContent = `Mood – ${getMoodViewLabel(tableName)}`;
    header.appendChild(title);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Stäng Mood');
    closeButton.addEventListener('click', closeMoodPanel);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    const intro = document.createElement('p');
    intro.className = 'empty-state';
    intro.textContent = isAdmin()
      ? 'Adminläge: ladda upp, byt eller ta bort upp till två Mood-PDF:er för vyn.'
      : 'Du kan öppna Mood-PDF:er. Uppladdning och byte visas bara för admin.';
    body.appendChild(intro);

    [1, 2].forEach((slot) => {
      const item = getMoodFileForSlot(tableName, slot);
      const displayName = item?.original_name || getPdfDisplayName(item?.storage_path) || '';

      const field = document.createElement('div');
      field.className = 'detail-field detail-field--pdf';

      const label = document.createElement('span');
      label.className = 'detail-field__label';
      label.textContent = `Mood ${slot}`;
      field.appendChild(label);

      const wrap = document.createElement('div');
      wrap.className = 'rutiner-pdf-field';

      const info = document.createElement('div');
      info.className = 'rutiner-pdf-field__info';

      const name = document.createElement('div');
      name.className = displayName ? 'rutiner-pdf-field__name' : 'rutiner-pdf-field__name rutiner-pdf-field__name--empty';
      name.textContent = displayName || 'Ingen fil uppladdad';
      info.appendChild(name);

      const helper = document.createElement('div');
      helper.className = 'rutiner-pdf-field__helper';
      helper.textContent = displayName ? 'PDF-fil kopplad till denna vy.' : 'Ingen Mood-PDF är kopplad ännu.';
      info.appendChild(helper);

      const actions = document.createElement('div');
      actions.className = 'rutiner-pdf-field__actions';

      if (displayName) {
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'secondary-button';
        openButton.textContent = 'Öppna PDF';
        openButton.addEventListener('click', async () => {
          await openPdfDocument(item.storage_path, { type: 'pdf' });
        });
        actions.appendChild(openButton);
      }

      if (isAdmin()) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/pdf,.pdf';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          await replaceMoodFile(tableName, slot, file);
          fileInput.value = '';
        });

        const uploadButton = document.createElement('button');
        uploadButton.type = 'button';
        uploadButton.className = 'secondary-button';
        uploadButton.disabled = state.moodLoading;
        uploadButton.textContent = displayName ? 'Byt fil' : 'Ladda upp PDF';
        uploadButton.addEventListener('click', () => fileInput.click());
        actions.appendChild(uploadButton);

        if (displayName) {
          const removeButton = document.createElement('button');
          removeButton.type = 'button';
          removeButton.className = 'secondary-button secondary-button--danger';
          removeButton.disabled = state.moodLoading;
          removeButton.textContent = 'Ta bort fil';
          removeButton.addEventListener('click', async () => {
            await removeMoodFile(tableName, slot);
          });
          actions.appendChild(removeButton);
        }

        wrap.appendChild(fileInput);
      }

      wrap.appendChild(info);
      wrap.appendChild(actions);
      field.appendChild(wrap);
      body.appendChild(field);
    });

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
        wrap.appendChild(createHeaderActionButton('Arkiv', openArchivePanel));
      }

      wrap.appendChild(createHeaderActionButton('Print', () => printActiveView(tableName)));

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

    wrap.appendChild(createHeaderActionButton('Print', () => printActiveView(tableName)));

    if (isMoodEnabledTable(tableName)) {
      wrap.appendChild(createMoodToolbarButton(tableName));
    }

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



  async function deleteRelatedRecordsForSource(sourceTable, sourceRowId) {
    return archiveController.deleteRelatedRecordsForSource(sourceTable, sourceRowId);
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
    moodButton.textContent = 'Mood';
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
  if (state.activeTableName) {
    await loadUnreadCountsForTable(state.activeTableName);
  }

  render();
}
