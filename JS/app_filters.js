function getUniqueSortedValues(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'sv'));
}

function createSelectOption(value, selectedValue) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = value;
  if ((selectedValue || 'Alla') === value) opt.selected = true;
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
    select.appendChild(createSelectOption(option, value));
  });

  select.addEventListener('change', () => {
    onChange(select.value);
  });

  item.appendChild(label);
  item.appendChild(select);
  return item;
}

export function createFilterController({ state, APP_CONFIG, getVisibleColumns, render }) {
  function getSaljintroProductOptions() {
    const products = (state.rowsByTable['SÄLJINTRO'] || [])
      .map((row) => String(row?.produkt || '').trim());

    return ['Alla', ...getUniqueSortedValues(products)];
  }

  function getProjektProductFromName(projectName) {
    const value = String(projectName || '').trim();
    if (!value) return '';

    const autoProjectSuffixes = [' - Media', ' - B2B-ready', ' - Shopify-ready'];
    const suffix = autoProjectSuffixes.find((item) => value.endsWith(item));

    if (!suffix) return '';
    return value.slice(0, -suffix.length).trim();
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

      if (tableName === 'PROJEKT') {
        filters.__projekt_product = 'Alla';
      }

      state.filtersByTable[tableName] = filters;
    }

    return state.filtersByTable[tableName];
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

    getVisibleColumns(tableConfig).forEach((column) => {
      if (column.type === 'status') return;
      const dropdown = APP_CONFIG.dropdowns?.[column.type];
      if (!dropdown?.filterEnabled) return;

      wrapper.appendChild(createFilterSelect({
        labelText: column.name,
        value: filters[column.field] || 'Alla',
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

  function getFilteredRows(tableName, tableConfig) {
    const filters = ensureFilters(tableName, tableConfig);
    const rows = state.rowsByTable[tableName] || [];

    return rows.filter((row) =>
      Object.entries(filters).every(([field, value]) => {
        if (field === '__projekt_product') {
          if (!value || value === 'Alla') return true;
          return getProjektProductFromName(row.projektnamn) === value;
        }

        if (!value || value === 'Alla') return true;
        return String(row[field] ?? '') === value;
      })
    );
  }

  return {
    ensureFilters,
    createFilterBar,
    getFilteredRows,
  };
}
