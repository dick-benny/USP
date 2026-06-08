(function () {
  'use strict';

  window.USP = window.USP || {};
  window.USP.Analysis = window.USP.Analysis || {};

  const Analysis = window.USP.Analysis;

  const API_ENDPOINT = 'https://cappelndimyr-draft-order-listener.onrender.com/totalSales';
  const ENV_MAP = {
    all: 'B2BLive,Live',
    b2b: 'B2BLive',
    b2c: 'Live',
  };

  const SORT_COLUMNS = ['productTitle', 'sku', 'quantity', 'qtyPerMo', 'unitPrice', 'totalAmount'];

  function createDefaultState() {
    return {
      envChoice: 'all',
      months: 1,
      collectionFilter: 'all',
      search: '',
      data: null,
      loading: false,
      error: null,
      sortCol: 'totalAmount',
      sortDir: 'desc',
      abortController: null,
      lastQueryKey: '',
    };
  }

  function formatCurrency(value, currencyCode) {
    const currency = String(currencyCode || 'EUR').toUpperCase();
    const safeValue = Number.isFinite(value) ? value : 0;
    try {
      return new Intl.NumberFormat('sv-SE', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(safeValue);
    } catch (error) {
      return `${safeValue.toFixed(2)} ${currency}`;
    }
  }

  function formatNumber(value, fractionDigits = 0) {
    const safeValue = Number.isFinite(value) ? value : 0;
    return new Intl.NumberFormat('sv-SE', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(safeValue);
  }

  function getCurrencyCode(data) {
    const firstItemCurrency = data?.items?.[0]?.currencyCode;
    return String(firstItemCurrency || 'EUR').toUpperCase();
  }

  function toSearchableValue(item) {
    return `${String(item?.productTitle || '')} ${String(item?.sku || '')}`.toLowerCase();
  }

  function getCollectionOptions(data) {
    const set = new Set();
    (data?.items || []).forEach((item) => {
      (item?.collections || []).forEach((collection) => {
        const title = String(collection?.title || '').trim();
        if (title) set.add(title);
      });
    });
    return Array.from(set).sort((left, right) => left.localeCompare(right, 'sv'));
  }

  function getFilteredItems(data, collectionFilter, search) {
    const needle = String(search || '').trim().toLowerCase();
    return (data?.items || []).filter((item) => {
      if (collectionFilter !== 'all') {
        const hasCollection = (item?.collections || []).some(
          (collection) => String(collection?.title || '').trim() === collectionFilter
        );
        if (!hasCollection) return false;
      }

      if (!needle) return true;
      return toSearchableValue(item).includes(needle);
    });
  }

  function getSortValue(item, sortCol, months) {
    if (sortCol === 'qtyPerMo') return Number(item?.quantity || 0) / Math.max(Number(months) || 1, 1);
    if (sortCol === 'quantity') return Number(item?.quantity || 0);
    if (sortCol === 'unitPrice') return Number(item?.unitPrice || 0);
    if (sortCol === 'totalAmount') return Number(item?.totalAmount || 0);
    if (sortCol === 'productTitle') return String(item?.productTitle || '');
    if (sortCol === 'sku') return String(item?.sku || '');
    return '';
  }

  function getSortedItems(items, sortCol, sortDir, months) {
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...items].sort((left, right) => {
      const leftValue = getSortValue(left, sortCol, months);
      const rightValue = getSortValue(right, sortCol, months);

      if (typeof leftValue === 'string' || typeof rightValue === 'string') {
        return String(leftValue).localeCompare(String(rightValue), 'sv', {
          sensitivity: 'base',
          numeric: true,
        }) * direction;
      }

      return (Number(leftValue) - Number(rightValue)) * direction;
    });
  }

  function getTotals(items, months) {
    const safeMonths = Math.max(Number(months) || 1, 1);
    const totalUnits = items.reduce((sum, item) => sum + Number(item?.quantity || 0), 0);
    const totalRevenue = items.reduce((sum, item) => sum + Number(item?.totalAmount || 0), 0);
    return {
      totalUnits,
      totalRevenue,
      avgUnitsPerMonth: totalUnits / safeMonths,
      avgRevenuePerMonth: totalRevenue / safeMonths,
    };
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  async function render(state, viewElement) {
    if (!viewElement) return;

    viewElement.innerHTML = '';

    const localState = viewElement.__analysisState || createDefaultState();
    viewElement.__analysisState = localState;

    const shell = createElement('section', 'analysis-view');

    const header = createElement('div', 'analysis-header');
    const titleWrap = createElement('div', 'analysis-header__title-wrap');
    const icon = createElement('span', 'analysis-header__icon', '📊');
    const heading = createElement('h2', 'analysis-header__title', 'Analys');
    const subtitle = createElement('p', 'analysis-header__subtitle', 'Försäljningsöversikt per produkt med filter och sortering.');
    titleWrap.appendChild(icon);
    titleWrap.appendChild(heading);
    header.appendChild(titleWrap);
    header.appendChild(subtitle);

    const filters = createElement('div', 'analysis-filters');

    const envField = createElement('label', 'analysis-field');
    const envLabel = createElement('span', 'analysis-field__label', 'Miljö');
    const envSelect = createElement('select', 'analysis-field__control');
    [
      { value: 'all', label: 'All' },
      { value: 'b2b', label: 'B2B' },
      { value: 'b2c', label: 'B2C' },
    ].forEach((optionData) => {
      const option = document.createElement('option');
      option.value = optionData.value;
      option.textContent = optionData.label;
      envSelect.appendChild(option);
    });
    envField.appendChild(envLabel);
    envField.appendChild(envSelect);

    const monthsField = createElement('label', 'analysis-field');
    const monthsLabel = createElement('span', 'analysis-field__label', 'Period');
    const monthsSelect = createElement('select', 'analysis-field__control');
    [1, 3, 6].forEach((month) => {
      const option = document.createElement('option');
      option.value = String(month);
      option.textContent = `${month} månader`;
      monthsSelect.appendChild(option);
    });
    monthsField.appendChild(monthsLabel);
    monthsField.appendChild(monthsSelect);

    const collectionField = createElement('label', 'analysis-field');
    const collectionLabel = createElement('span', 'analysis-field__label', 'Kollektion');
    const collectionSelect = createElement('select', 'analysis-field__control');
    collectionField.appendChild(collectionLabel);
    collectionField.appendChild(collectionSelect);

    const searchField = createElement('label', 'analysis-field analysis-field--wide');
    const searchLabel = createElement('span', 'analysis-field__label', 'Sök');
    const searchInput = document.createElement('input');
    searchInput.className = 'analysis-field__control';
    searchInput.type = 'search';
    searchInput.placeholder = 'Product name or SKU';
    searchField.appendChild(searchLabel);
    searchField.appendChild(searchInput);

    filters.appendChild(envField);
    filters.appendChild(monthsField);
    filters.appendChild(collectionField);
    filters.appendChild(searchField);

    const content = createElement('div', 'analysis-content');

    const cards = createElement('div', 'analysis-cards');
    const revenueCard = createElement('article', 'analysis-card');
    const unitsCard = createElement('article', 'analysis-card');
    const productsCard = createElement('article', 'analysis-card');
    cards.appendChild(revenueCard);
    cards.appendChild(unitsCard);
    cards.appendChild(productsCard);

    const tableWrap = createElement('div', 'analysis-table-wrap');
    const table = createElement('table', 'analysis-table');
    tableWrap.appendChild(table);

    const errorMessage = createElement('p', 'analysis-error');

    const loadingOverlay = createElement('div', 'analysis-loading-overlay');
    const spinner = createElement('div', 'analysis-spinner');
    const loadingText = createElement('span', 'analysis-loading-text', 'Laddar analys...');
    loadingOverlay.appendChild(spinner);
    loadingOverlay.appendChild(loadingText);

    content.appendChild(cards);
    content.appendChild(errorMessage);
    content.appendChild(tableWrap);
    shell.appendChild(header);
    shell.appendChild(filters);
    shell.appendChild(content);
    shell.appendChild(loadingOverlay);
    viewElement.appendChild(shell);

    function getQueryKey() {
      return `${localState.envChoice}:${localState.months}`;
    }

    function fillCollectionOptions() {
      const options = getCollectionOptions(localState.data);
      const nextValue = options.includes(localState.collectionFilter) ? localState.collectionFilter : 'all';
      localState.collectionFilter = nextValue;

      collectionSelect.innerHTML = '';
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'All';
      collectionSelect.appendChild(allOption);

      options.forEach((title) => {
        const option = document.createElement('option');
        option.value = title;
        option.textContent = title;
        collectionSelect.appendChild(option);
      });

      collectionSelect.value = localState.collectionFilter;
    }

    function applySort(column) {
      if (!SORT_COLUMNS.includes(column)) return;
      if (localState.sortCol !== column) {
        localState.sortCol = column;
        localState.sortDir = 'asc';
      } else {
        localState.sortDir = localState.sortDir === 'asc' ? 'desc' : 'asc';
      }
      renderView();
    }

    function getSortIndicator(column) {
      if (localState.sortCol !== column) return '';
      return localState.sortDir === 'asc' ? '↑' : '↓';
    }

    function renderCards(filteredItems) {
      const totals = getTotals(filteredItems, localState.months);
      const currencyCode = getCurrencyCode(localState.data);
      const uniqueProducts = filteredItems.length;
      const scannedOrders = Number(localState.data?.scannedOrders || 0);

      revenueCard.innerHTML = '';
      revenueCard.appendChild(createElement('p', 'analysis-card__label', 'Total Revenue'));
      revenueCard.appendChild(createElement('p', 'analysis-card__value', formatCurrency(totals.totalRevenue, currencyCode)));
      revenueCard.appendChild(createElement('p', 'analysis-card__hint', `${formatCurrency(totals.avgRevenuePerMonth, currencyCode)} / mån`));

      unitsCard.innerHTML = '';
      unitsCard.appendChild(createElement('p', 'analysis-card__label', 'Total Units'));
      unitsCard.appendChild(createElement('p', 'analysis-card__value', formatNumber(totals.totalUnits)));
      unitsCard.appendChild(createElement('p', 'analysis-card__hint', `(${formatNumber(totals.avgUnitsPerMonth, 1)} / mån)`));

      productsCard.innerHTML = '';
      productsCard.appendChild(createElement('p', 'analysis-card__label', 'Unique Products / Scanned Orders'));
      productsCard.appendChild(createElement('p', 'analysis-card__value', `${formatNumber(uniqueProducts)} / ${formatNumber(scannedOrders)}`));
      productsCard.appendChild(createElement('p', 'analysis-card__hint', `Miljö: ${ENV_MAP[localState.envChoice] || ENV_MAP.all}`));
    }

    function renderTable(sortedItems) {
      const currencyCode = getCurrencyCode(localState.data);
      const safeMonths = Math.max(Number(localState.months) || 1, 1);

      table.innerHTML = '';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');

      [
        { key: 'productTitle', label: 'Product' },
        { key: 'sku', label: 'SKU' },
        { key: 'quantity', label: 'Qty' },
        { key: 'qtyPerMo', label: 'Qty/mo' },
        { key: 'unitPrice', label: 'Unit Price' },
        { key: 'totalAmount', label: 'Total' },
      ].forEach((column) => {
        const th = document.createElement('th');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'analysis-sort';
        button.textContent = `${column.label} ${getSortIndicator(column.key)}`.trim();
        button.addEventListener('click', () => applySort(column.key));
        th.appendChild(button);
        headRow.appendChild(th);
      });

      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      if (!sortedItems.length) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 6;
        emptyCell.className = 'analysis-empty';
        emptyCell.textContent = 'Inga produkter matchar filtreringen.';
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
      } else {
        sortedItems.forEach((item) => {
          const row = document.createElement('tr');

          const quantity = Number(item?.quantity || 0);
          const qtyPerMo = quantity / safeMonths;
          const unitPrice = Number(item?.unitPrice || 0);
          const totalAmount = Number(item?.totalAmount || 0);

          [
            String(item?.productTitle || '-'),
            String(item?.sku || '-'),
            formatNumber(quantity),
            formatNumber(qtyPerMo, 1),
            formatCurrency(unitPrice, currencyCode),
            formatCurrency(totalAmount, currencyCode),
          ].forEach((value, index) => {
            const cell = document.createElement('td');
            if (index >= 2) cell.classList.add('is-right');
            cell.textContent = value;
            row.appendChild(cell);
          });

          tbody.appendChild(row);
        });
      }

      table.appendChild(tbody);
    }

    function setLoading(isLoading) {
      localState.loading = isLoading;
      shell.classList.toggle('is-loading', isLoading);
      loadingOverlay.classList.toggle('is-visible', isLoading);

      [envSelect, monthsSelect, collectionSelect, searchInput].forEach((control) => {
        control.disabled = isLoading;
      });
    }

    function renderView() {
      envSelect.value = localState.envChoice;
      monthsSelect.value = String(localState.months);
      searchInput.value = localState.search;
      fillCollectionOptions();

      const filteredItems = getFilteredItems(localState.data, localState.collectionFilter, localState.search);
      const sortedItems = getSortedItems(filteredItems, localState.sortCol, localState.sortDir, localState.months);

      renderCards(filteredItems);
      renderTable(sortedItems);

      if (localState.error) {
        errorMessage.textContent = localState.error;
        errorMessage.classList.add('is-visible');
      } else {
        errorMessage.textContent = '';
        errorMessage.classList.remove('is-visible');
      }

      setLoading(localState.loading);
    }

    async function loadData() {
      const queryKey = getQueryKey();
      localState.lastQueryKey = queryKey;

      if (localState.abortController) {
        localState.abortController.abort();
      }

      const abortController = new AbortController();
      localState.abortController = abortController;
      localState.error = null;
      setLoading(true);
      renderView();

      try {
        const envParam = ENV_MAP[localState.envChoice] || ENV_MAP.all;
        const url = `${API_ENDPOINT}?months=${localState.months}&env=${encodeURIComponent(envParam)}`;
        const response = await fetch(url, {
          method: 'GET',
          signal: abortController.signal,
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`API-fel: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        localState.data = {
          success: !!json?.success,
          env: Array.isArray(json?.env) ? json.env : [],
          months: Number(json?.months || localState.months),
          totalOrderAmount: Number(json?.totalOrderAmount || 0),
          scannedOrders: Number(json?.scannedOrders || 0),
          items: Array.isArray(json?.items) ? json.items : [],
        };
      } catch (error) {
        if (error?.name === 'AbortError') {
          return;
        }
        localState.data = {
          success: false,
          env: [],
          months: localState.months,
          totalOrderAmount: 0,
          scannedOrders: 0,
          items: [],
        };
        localState.error = error?.message || 'Kunde inte hämta analysdata.';
      } finally {
        if (localState.abortController === abortController) {
          localState.abortController = null;
        }
        setLoading(false);
        renderView();
      }
    }

    envSelect.addEventListener('change', () => {
      localState.envChoice = envSelect.value;
      void loadData();
    });

    monthsSelect.addEventListener('change', () => {
      const parsed = Number(monthsSelect.value);
      localState.months = parsed === 3 || parsed === 6 ? parsed : 1;
      void loadData();
    });

    collectionSelect.addEventListener('change', () => {
      localState.collectionFilter = collectionSelect.value;
      renderView();
    });

    searchInput.addEventListener('input', () => {
      localState.search = searchInput.value;
      renderView();
    });

    if (!localState.data || localState.lastQueryKey !== getQueryKey()) {
      void loadData();
    } else {
      renderView();
    }
  }

  Analysis.render = render;
  window.renderAnalysisView = render;
})();
