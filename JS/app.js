(function () {
  const spec = window.PlanningSpec;
  const app = document.getElementById('app');
  const nav = document.getElementById('tableNav');
  const settingsButton = document.getElementById('settingsButton');
  const supabase = window.PlanningSupabase?.client || null;

  if (!spec || !spec.APP_CONFIG || !spec.APP_CONFIG.tables) {
    app.innerHTML = '<p>Kunde inte läsa spec.js.</p>';
    return;
  }

  const { APP_CONFIG, SAMPLE_ROWS = {} } = spec;
  const tableEntries = Object.entries(APP_CONFIG.tables);
  let activeTableName = tableEntries[0]?.[0] || '';
  const activeFilters = {};
  const rowsByTable = {};
  const tableState = {};

  tableEntries.forEach(([tableName]) => {
    rowsByTable[tableName] = [];
    tableState[tableName] = {
      loading: false,
      creating: false,
      error: '',
      info: ''
    };
  });

  function getFieldTypeConfig(typeName) {
    return APP_CONFIG.fieldTypes[typeName] || null;
  }

  function getDropdownConfig(typeName) {
    return APP_CONFIG.dropdowns?.[typeName] || null;
  }

  function getAlignment(column) {
    const fieldTypeConfig = getFieldTypeConfig(column.type);
    return column.mods?.align || fieldTypeConfig?.defaultAlign || 'left';
  }

  function getPlaceholderText(column) {
    if (column.type === 'date') return 'Datum';
    if (column.type === 'veckonummer') return 'Vecka';
    if (column.type === 'kvartal') return 'Kvartal';
    if (column.type === 'pdf') return 'PDF';
    if (String(column.type).startsWith('dropdown_')) return 'Val';
    if (column.field === '_action') return 'Action';
    return 'Text';
  }

  function ensureTableFilters(tableName, tableConfig) {
    if (!activeFilters[tableName]) {
      activeFilters[tableName] = {};
    }

    tableConfig.columns.forEach((column) => {
      const dropdown = getDropdownConfig(column.type);
      if (dropdown?.filterEnabled && !(column.field in activeFilters[tableName])) {
        activeFilters[tableName][column.field] = dropdown.filterOptions?.[0] || 'Alla';
      }
    });
  }

  function getFilterableColumns(tableConfig) {
    return tableConfig.columns.filter((column) => {
      const dropdown = getDropdownConfig(column.type);
      return Boolean(dropdown?.filterEnabled);
    });
  }

  function getActiveFilterCount(tableName) {
    return Object.values(activeFilters[tableName] || {}).filter((value) => value && value !== 'Alla').length;
  }

  function createNav() {
    nav.innerHTML = '';

    tableEntries.forEach(([tableName]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'table-nav__button';
      button.textContent = tableName;

      if (tableName === activeTableName) {
        button.classList.add('is-active');
      }

      button.addEventListener('click', () => {
        activeTableName = tableName;
        createNav();
        renderView();
        if (!rowsByTable[tableName].length) {
          fetchTableData(tableName);
        }
      });

      nav.appendChild(button);
    });
  }

  function formatCellValue(value, column) {
    if (value === null || value === undefined || value === '') {
      return getPlaceholderText(column);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function getDisplayRows(tableName, tableConfig) {
    const sourceRows = rowsByTable[tableName]?.length ? rowsByTable[tableName] : (SAMPLE_ROWS[tableName] || []);
    const tableFilters = activeFilters[tableName] || {};

    return sourceRows.filter((row) => {
      return getFilterableColumns(tableConfig).every((column) => {
        const filterValue = tableFilters[column.field];
        if (!filterValue || filterValue === 'Alla') {
          return true;
        }
        return String(row[column.field] ?? '') === filterValue;
      });
    });
  }

  function renderTablePreview(tableName, tableConfig) {
    const wrap = document.createElement('div');
    wrap.className = 'table-preview';

    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');

    tableConfig.columns.forEach((column) => {
      const th = document.createElement('th');
      th.textContent = column.name;
      if (getAlignment(column) === 'center') {
        th.classList.add('cell--center');
      }
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const displayRows = getDisplayRows(tableName, tableConfig);

    if (!displayRows.length) {
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = tableConfig.columns.length;
      emptyCell.className = 'table-empty';
      emptyCell.textContent = rowsByTable[tableName]?.length
        ? 'Inga rader matchar valda filter.'
        : 'Inga rader ännu. Klicka på Ny rad för att skapa första raden i databasen.';
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    } else {
      displayRows.forEach((row) => {
        const tr = document.createElement('tr');
        tableConfig.columns.forEach((column) => {
          const td = document.createElement('td');
          if (getAlignment(column) === 'center') {
            td.classList.add('cell--center');
          }
          td.textContent = formatCellValue(row[column.field], column);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    table.appendChild(tbody);
    wrap.appendChild(table);

    return wrap;
  }

  function renderFilters(tableName, tableConfig) {
    ensureTableFilters(tableName, tableConfig);

    const filterableColumns = getFilterableColumns(tableConfig);
    if (!filterableColumns.length) {
      return null;
    }

    const section = document.createElement('section');
    section.className = 'filters-panel';

    const topRow = document.createElement('div');
    topRow.className = 'filters-panel__top';

    const titleWrap = document.createElement('div');

    const title = document.createElement('h2');
    title.className = 'filters-panel__title';
    title.textContent = 'Filter';

    const subtitle = document.createElement('p');
    subtitle.className = 'filters-panel__subtitle';
    subtitle.textContent = 'Filter som är definierade i specen visas här per vy.';

    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const meta = document.createElement('div');
    meta.className = 'filters-panel__meta';

    const countBadge = document.createElement('span');
    countBadge.className = 'filters-panel__count';
    const activeCount = getActiveFilterCount(tableName);
    countBadge.textContent = activeCount > 0 ? `${activeCount} aktiv${activeCount > 1 ? 'a' : ''}` : 'Inga aktiva';

    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'filters-panel__reset';
    resetButton.textContent = 'Återställ';
    resetButton.disabled = activeCount === 0;
    resetButton.addEventListener('click', () => {
      filterableColumns.forEach((column) => {
        const dropdown = getDropdownConfig(column.type);
        activeFilters[tableName][column.field] = dropdown.filterOptions?.[0] || 'Alla';
      });
      renderView();
    });

    meta.appendChild(countBadge);
    meta.appendChild(resetButton);

    topRow.appendChild(titleWrap);
    topRow.appendChild(meta);

    const grid = document.createElement('div');
    grid.className = 'filters-grid';

    filterableColumns.forEach((column) => {
      const dropdown = getDropdownConfig(column.type);
      const filterCard = document.createElement('label');
      filterCard.className = 'filter-card';

      const labelText = document.createElement('span');
      labelText.className = 'filter-card__label';
      labelText.textContent = column.name;

      const select = document.createElement('select');
      select.className = 'filter-card__select';
      select.setAttribute('aria-label', `Filter för ${column.name}`);

      (dropdown.filterOptions || []).forEach((optionValue) => {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue;
        if (activeFilters[tableName][column.field] === optionValue) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      select.addEventListener('change', (event) => {
        activeFilters[tableName][column.field] = event.target.value;
        renderView();
      });

      const helper = document.createElement('span');
      helper.className = 'filter-card__helper';
      helper.textContent = activeFilters[tableName][column.field] === 'Alla'
        ? 'Visar alla värden'
        : `Valt: ${activeFilters[tableName][column.field]}`;

      filterCard.appendChild(labelText);
      filterCard.appendChild(select);
      filterCard.appendChild(helper);
      grid.appendChild(filterCard);
    });

    section.appendChild(topRow);
    section.appendChild(grid);
    return section;
  }

  function createDraftKey(tableName, column) {
    const stamp = new Date().toISOString().replace(/[.:TZ-]/g, '').slice(0, 14);
    return `${tableName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${column.field}_${stamp}`;
  }

  function getDefaultValueForColumn(tableName, column) {
    const sampleRow = SAMPLE_ROWS[tableName]?.[0] || {};
    const fieldTypeConfig = getFieldTypeConfig(column.type);
    const dropdown = getDropdownConfig(column.type);

    if (Object.prototype.hasOwnProperty.call(sampleRow, column.field)) {
      return sampleRow[column.field];
    }
    if (Object.prototype.hasOwnProperty.call(column, 'default')) {
      return column.default;
    }
    if (dropdown?.options?.length) {
      return dropdown.options[0];
    }
    if (fieldTypeConfig && Object.prototype.hasOwnProperty.call(fieldTypeConfig, 'defaultValue')) {
      return fieldTypeConfig.defaultValue;
    }
    return '';
  }

  function buildInsertPayload(tableName, tableConfig) {
    const payload = {};

    tableConfig.columns.forEach((column) => {
      if (column.field === '_action') {
        return;
      }

      let value = getDefaultValueForColumn(tableName, column);
      if (column.key && (value === '' || value === null || value === undefined || value === '--' || value === '---')) {
        value = createDraftKey(tableName, column);
      }
      payload[column.field] = value;
    });

    payload.is_done = false;
    return payload;
  }

  async function fetchTableData(tableName) {
    const tableConfig = APP_CONFIG.tables[tableName];
    if (!tableConfig) {
      return;
    }

    if (!supabase) {
      tableState[tableName].error = 'Supabase-klienten är inte aktiv. Kontrollera att sidan körs via localhost.';
      renderView();
      return;
    }

    tableState[tableName].loading = true;
    tableState[tableName].error = '';
    tableState[tableName].info = '';
    renderView();

    try {
      const { data, error } = await supabase.from(tableConfig.dbTable).select('*');
      if (error) {
        throw error;
      }
      rowsByTable[tableName] = Array.isArray(data) ? data : [];
      tableState[tableName].info = rowsByTable[tableName].length
        ? `${rowsByTable[tableName].length} rader hämtade från ${tableConfig.dbTable}.`
        : `Tabellen ${tableConfig.dbTable} är tom.`;
    } catch (error) {
      console.error(`Kunde inte läsa ${tableConfig.dbTable}:`, error);
      rowsByTable[tableName] = [];
      tableState[tableName].error = `Kunde inte läsa ${tableConfig.dbTable}: ${error.message || 'okänt fel'}`;
    } finally {
      tableState[tableName].loading = false;
      renderView();
    }
  }

  async function createNewRow(tableName) {
    const tableConfig = APP_CONFIG.tables[tableName];
    if (!tableConfig || !supabase) {
      tableState[tableName].error = 'Supabase-klienten är inte aktiv. Kontrollera att sidan körs via localhost.';
      renderView();
      return;
    }

    tableState[tableName].creating = true;
    tableState[tableName].error = '';
    tableState[tableName].info = 'Skapar ny rad...';
    renderView();

    try {
      const payload = buildInsertPayload(tableName, tableConfig);
      const { error } = await supabase.from(tableConfig.dbTable).insert([payload]);
      if (error) {
        throw error;
      }
      tableState[tableName].info = 'Ny rad skapad i Supabase.';
      await fetchTableData(tableName);
    } catch (error) {
      console.error(`Kunde inte skapa rad i ${tableConfig.dbTable}:`, error);
      tableState[tableName].creating = false;
      tableState[tableName].error = `Kunde inte skapa ny rad i ${tableConfig.dbTable}: ${error.message || 'okänt fel'}`;
      renderView();
      return;
    }

    tableState[tableName].creating = false;
    renderView();
  }

  function renderView() {
    const tableConfig = APP_CONFIG.tables[activeTableName];
    if (!tableConfig) {
      app.innerHTML = '';
      return;
    }

    ensureTableFilters(activeTableName, tableConfig);
    app.innerHTML = '';

    const state = tableState[activeTableName];
    const displayRows = getDisplayRows(activeTableName, tableConfig);

    const card = document.createElement('section');
    card.className = 'view-card';

    const header = document.createElement('div');
    header.className = 'view-card__header';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'view-card__eyebrow';
    eyebrow.textContent = 'USP PLANNING';

    const title = document.createElement('h1');
    title.className = 'view-card__title';
    title.textContent = tableConfig.title;

    const subtitle = document.createElement('p');
    subtitle.className = 'view-card__subtitle';
    subtitle.textContent = `Aktiv vy för ${tableConfig.title}. Här hämtas rader från ${tableConfig.dbTable} och Ny rad skapar en post direkt i Supabase.`;

    const actions = document.createElement('div');
    actions.className = 'view-card__actions';

    const rowCount = document.createElement('span');
    rowCount.className = 'view-card__badge';
    rowCount.textContent = `${displayRows.length} visade`;

    const dbBadge = document.createElement('span');
    dbBadge.className = 'view-card__badge';
    dbBadge.textContent = tableConfig.dbTable;

    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'toolbar-button toolbar-button--ghost';
    refreshButton.textContent = state.loading ? 'Laddar...' : 'Uppdatera';
    refreshButton.disabled = state.loading || state.creating;
    refreshButton.addEventListener('click', () => fetchTableData(activeTableName));

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'toolbar-button toolbar-button--primary';
    addButton.textContent = state.creating ? 'Skapar...' : 'Ny rad';
    addButton.disabled = state.creating || state.loading;
    addButton.addEventListener('click', () => createNewRow(activeTableName));

    actions.appendChild(rowCount);
    actions.appendChild(dbBadge);
    actions.appendChild(refreshButton);
    actions.appendChild(addButton);

    header.appendChild(eyebrow);
    header.appendChild(title);
    header.appendChild(subtitle);
    header.appendChild(actions);

    card.appendChild(header);

    const filtersSection = renderFilters(activeTableName, tableConfig);
    if (filtersSection) {
      card.appendChild(filtersSection);
    }

    if (state.error || state.info) {
      const status = document.createElement('div');
      status.className = `status-banner ${state.error ? 'is-error' : 'is-info'}`;
      status.textContent = state.error || state.info;
      card.appendChild(status);
    }

    card.appendChild(renderTablePreview(activeTableName, tableConfig));
    app.appendChild(card);
  }

  settingsButton.addEventListener('click', () => {
    window.alert('Settings – To be continued');
  });

  createNav();
  renderView();
  fetchTableData(activeTableName);
})();
