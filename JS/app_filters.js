function getUniqueSortedValues(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'sv'));
}

function getDropdownOptionLabel(value) {
  return String(value ?? '').toLocaleUpperCase('sv-SE');
}

function isAllFilterValue(value) {
  return value === 'Alla' || value === 'All';
}

function getFilterFallback(options) {
  return Array.isArray(options) && options.includes('All') ? 'All' : 'Alla';
}

function createSelectOption(value, selectedValue, options) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = getDropdownOptionLabel(value);
  if ((selectedValue || getFilterFallback(options)) === value) opt.selected = true;
  return opt;
}

function createFilterSelect({ labelText, value, options, onChange }) {
  const item = document.createElement('label');
  item.className = 'filter-item';

  const label = document.createElement('span');
  label.className = 'filter-item__label';
  label.textContent = labelText;

  const select = document.createElement('select');
  select.className = 'filter-item__control';

  options.forEach((option) => {
    select.appendChild(createSelectOption(option, value, options));
  });

  select.addEventListener('change', () => {
    onChange(select.value);
  });

  item.appendChild(label);
  item.appendChild(select);
  return item;
}

export function createFilterController({
  state,
  APP_CONFIG,
  TODO_TABLE = 'TODO',
  getVisibleColumns,
  getCurrentUserInitials,
  render,
}) {
  function getSaljintroProductOptions() {
    const products = (state.rowsByTable['SÄLJINTRO'] || [])
      .map((row) => String(row?.produkt || '').trim());

    return ['Alla', ...getUniqueSortedValues(products)];
  }

  function getProjektProductFromName(projectName) {
    const value = String(projectName || '').trim();
    if (!value) return '';

    const autoProjectSuffixes = [' - Media', ' - B2B-ready', ' - B2C-ready'];
    const suffix = autoProjectSuffixes.find((item) => value.endsWith(item));

    if (!suffix) return '';
    return value.slice(0, -suffix.length).trim();
  }

  function ensureFilters(tableName, tableConfig) {
    if (!state.filtersByTable[tableName]) {
      const filters = {};

      getFilterableColumns(tableConfig).forEach((column) => {
        const dropdown = APP_CONFIG.dropdowns?.[column.type];
        if (dropdown?.filterEnabled) {
          filters[column.field] = column.defaultFilter || tableConfig.defaultFilters?.[column.field] || getFilterFallback(dropdown.filterOptions);
        }
      });

      if (tableName === 'PROJEKT') {
        filters.__projekt_product = 'Alla';
      }

      state.filtersByTable[tableName] = filters;
    }

    return state.filtersByTable[tableName];
  }

  function getFilterableColumns(tableConfig) {
    return (tableConfig.columns || []).filter((column) => {
      if (!column || column.field === 'id' || column.type === 'status') return false;
      const dropdown = APP_CONFIG.dropdowns?.[column.type];
      return !!dropdown?.filterEnabled;
    });
  }

  function appendProjektProductFilter(wrapper, filters) {
    wrapper.appendChild(createFilterSelect({
      labelText: 'Säljintro - Produkt',
      value: filters.__projekt_product || 'Alla',
      options: getSaljintroProductOptions(),
      onChange: (nextValue) => {
        filters.__projekt_product = nextValue;
        render();
      },
    }));

    return true;
  }

  function appendDropdownFilters(wrapper, tableConfig, filters) {
    let hasFilters = false;

    getFilterableColumns(tableConfig).forEach((column) => {
      const dropdown = APP_CONFIG.dropdowns?.[column.type];
      if (!dropdown?.filterEnabled) return;

      wrapper.appendChild(createFilterSelect({
        labelText: column.name,
        value: filters[column.field] || getFilterFallback(dropdown.filterOptions),
        options: dropdown.filterOptions,
        onChange: (nextValue) => {
          filters[column.field] = nextValue;
          render();
        },
      }));

      hasFilters = true;
    });

    return hasFilters;
  }

  function createFilterBar(tableName, tableConfig) {
    const filters = ensureFilters(tableName, tableConfig);
    const wrapper = document.createElement('section');
    wrapper.className = 'filters';

    let hasFilters = false;

    if (tableName === 'PROJEKT') {
      hasFilters = appendProjektProductFilter(wrapper, filters) || hasFilters;
    }

    hasFilters = appendDropdownFilters(wrapper, tableConfig, filters) || hasFilters;

    if (!hasFilters) {
      wrapper.classList.add('filters--empty');
    }

    return wrapper;
  }

  function normalizeInitials(value) {
    return String(value || '').trim().toLocaleUpperCase('sv-SE');
  }

  function getRowOwnerInitials(row) {
    const candidates = [
      row?.owner_initials,
      row?.ansvarig,
      row?.initialer,
      row?.owner,
    ];

    return normalizeInitials(candidates.find((item) => String(item || '').trim()));
  }

  function shouldShowTodoRow(tableName, row) {
    if (tableName !== TODO_TABLE) return true;

    const currentInitials = normalizeInitials(getCurrentUserInitials?.());
    const ownerInitials = getRowOwnerInitials(row);
    const isPrivateTodo = String(row?.kategori || '').trim().toLocaleLowerCase('sv-SE') === 'privat';
    const isOwnedByMe = !!currentInitials && ownerInitials === currentInitials;

    // Private TODO rows should only ever be visible to their owner.
    if (isPrivateTodo && !isOwnedByMe) return false;

    // "Mina Todo" is strict: only rows whose initials match the logged-in user.
    if (state.todoMineOnly) return isOwnedByMe;

    return true;
  }

  function matchesFilters(tableName, row, filters) {
    return Object.entries(filters).every(([field, value]) => {
      if (field === '__projekt_product') {
        if (!value || isAllFilterValue(value)) return true;
        return getProjektProductFromName(row.projektnamn) === value;
      }

      if (!value || isAllFilterValue(value)) return true;
      return String(row[field] ?? '') === value;
    });
  }

  function getFilteredRows(tableName, tableConfig) {
    const filters = ensureFilters(tableName, tableConfig);
    const rows = state.rowsByTable[tableName] || [];

    return rows.filter((row) =>
      shouldShowTodoRow(tableName, row) && matchesFilters(tableName, row, filters)
    );
  }

  return {
    ensureFilters,
    createFilterBar,
    getFilteredRows,
  };
}
