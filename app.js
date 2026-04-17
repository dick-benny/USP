import { supabase } from './supabase.js';

(async function () {
  const spec = window.PlanningSpec;
  const app = document.getElementById('app');
  const nav = document.getElementById('tableNav');
  const settingsButton = document.getElementById('settingsButton');

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
  const STATUS_ORDER = ['gray', 'yellow', 'green', 'red'];
  const TODO_TABLE = 'TODO';
  const PDF_BUCKET = 'rutiner-pdf';
  const PDF_PREFIX = 'rutiner';

  const state = {
    activeTableName: tableEntries[0]?.[0] || null,
    rowsByTable: {},
    filtersByTable: {},
    editingCell: null,
    savingCell: null,
    detailRowId: null,
    newRowDraft: null,
  };

  function getActiveConfig() {
    return tableEntries.find(([tableName]) => tableName === state.activeTableName) || null;
  }

  function getVisibleColumns(tableConfig) {
    return [
      ...tableConfig.columns.filter((column) => column.field !== 'id'),
      UI_OPEN_COLUMN,
    ];
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

  function formatDateValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '--' || raw === '-- -- --') return '—';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat('sv-SE').format(date);
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
        render();
      });

      nav.appendChild(button);
    });
  }

  function createTopActions(tableName, tableConfig) {
    const wrap = document.createElement('div');
    wrap.className = 'view-actions';

    const newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.className = 'primary-button';
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
      state.detailRowId = null;
      state.editingCell = null;
      render();
    });

    wrap.appendChild(newButton);
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
    const rows = state.rowsByTable[tableName] || [];
    const filters = ensureFilters(tableName, tableConfig);

    return rows.filter((row) =>
      Object.entries(filters).every(([field, value]) => {
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
    state.detailRowId = row.id;
    state.editingCell = null;
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

    render();
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

    render();
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

    render();
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
      const button = document.createElement('button');
      button.type = 'button';
      button.className = getStatusClass(text);
      button.textContent = getStatusLabel(column);
      button.setAttribute('aria-label', `${column.name}: ${getStatusLabel(column)} (${normalizeStatusValue(text)})`);
      return button;
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
      button.className = 'pdf-link-button';
      button.textContent = displayName;
      button.title = displayName;
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

  function createOpenButton(row) {
    const wrap = document.createElement('div');
    wrap.className = 'row-actions';

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
    field.className = 'detail-field';

    const label = document.createElement('span');
    label.className = 'detail-field__label';
    label.textContent = column.name;

    const wrap = document.createElement('div');
    wrap.className = 'pdf-field';

    const info = document.createElement('div');
    info.className = 'pdf-field__info';

    const draftFile = isDraft ? getDraftPdfFile(row, column.field) : null;
    const displayName = draftFile ? stripCommonStoragePrefix(draftFile.name) : getPdfDisplayName(row[column.field]);
    info.textContent = displayName || 'Ingen PDF vald';

    const actions = document.createElement('div');
    actions.className = 'view-actions';

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
      control = document.createElement('button');
      control.type = 'button';
      control.className = getStatusClass(row[column.field]);
      control.textContent = getStatusLabel(column);
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
      th.textContent = column.name;
      if (column.width) th.style.width = column.width;
      if (getAlignment(column) === 'center') th.classList.add('is-center');
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

        if (isOpenColumn(column)) {
          td.appendChild(createOpenButton(row));
          tr.appendChild(td);
          return;
        }

        const cellKey = getCellKey(row, column);
        const isEditing = state.editingCell === cellKey;
        const isSaving = state.savingCell === cellKey;
        const editableText = isEditableTextColumn(column) && !!row.id && !row.is_done;
        const editableDropdown = isEditableDropdownColumn(column) && !!row.id && !row.is_done;
        const statusToggle = isStatusColumn(column) && !!row.id && !row.is_done;
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
            td.addEventListener('click', async () => {
              await toggleStatusCell(tableConfig, row, column);
            });
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
    alert('Settings — To be continued');
  });

  function render() {
    const active = getActiveConfig();
    if (!active) return;

    const [tableName, tableConfig] = active;
    createNav();
    app.innerHTML = '';
    app.appendChild(createTable(tableName, tableConfig));

    const draftRow = getCurrentDraftRow();
    const row = getCurrentDetailRow();
    if (draftRow) {
      app.appendChild(createDetailPanel(tableName, tableConfig, draftRow, { isDraft: true }));
    } else if (row) {
      app.appendChild(createDetailPanel(tableName, tableConfig, row));
    }
  }

  await Promise.all(
    tableEntries.map(([tableName, tableConfig]) => loadTableRows(tableName, tableConfig))
  );

  render();
})();
