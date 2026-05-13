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
