(function () {
  const spec = window.PlanningSpec;
  const app = document.getElementById('app');
  const nav = document.getElementById('tableNav');
  const settingsButton = document.getElementById('settingsButton');

  if (!spec || !spec.APP_CONFIG || !spec.APP_CONFIG.tables) {
    app.innerHTML = '<p>Kunde inte läsa spec.js.</p>';
    return;
  }

  const { APP_CONFIG } = spec;
  const tableEntries = Object.entries(APP_CONFIG.tables);
  let activeTableName = tableEntries[0]?.[0] || '';

  function getFieldTypeConfig(typeName) {
    return APP_CONFIG.fieldTypes[typeName] || null;
  }

  function getAlignment(column) {
    const fieldTypeConfig = getFieldTypeConfig(column.type);
    return column.mods?.align || fieldTypeConfig?.defaultAlign || 'left';
  }

  function getPlaceholderText(column) {
    if (column.type === 'date') {
      return 'Datum';
    }
    if (column.type === 'veckonummer') {
      return 'Vecka';
    }
    if (column.type === 'kvartal') {
      return 'Kvartal';
    }
    if (column.type === 'pdf') {
      return 'PDF';
    }
    if (String(column.type).startsWith('dropdown_')) {
      return 'Val';
    }
    if (column.field === '_action') {
      return 'Action';
    }
    return 'Text';
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
      });

      nav.appendChild(button);
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

    const tbody = document.createElement('tbody');
    const previewRow = document.createElement('tr');

    tableConfig.columns.forEach((column) => {
      const td = document.createElement('td');
      const alignment = getAlignment(column);
      if (alignment === 'center') {
        td.classList.add('cell--center');
      }

      const placeholder = document.createElement('span');
      placeholder.className = 'cell-placeholder';
      placeholder.textContent = getPlaceholderText(column);

      if (alignment === 'center') {
        td.appendChild(placeholder);
      } else {
        td.textContent = getPlaceholderText(column);
      }

      previewRow.appendChild(td);
    });

    tbody.appendChild(previewRow);
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);

    return wrap;
  }

  function renderView() {
    const tableConfig = APP_CONFIG.tables[activeTableName];
    if (!tableConfig) {
      app.innerHTML = '';
      return;
    }

    app.innerHTML = '';

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
    subtitle.textContent = `Första UI-vy för ${tableConfig.title}. Här visas rubrik och kolumnrubriker enligt specen, och du kan växla mellan flikarna i topbaren.`;

    header.appendChild(eyebrow);
    header.appendChild(title);
    header.appendChild(subtitle);

    const footer = document.createElement('div');
    footer.className = 'view-card__footer';
    footer.textContent = `Databas- och redigeringslogik är pausad i denna vy. Fokus här är struktur, färg, rubrik och flikbyte för ${tableConfig.dbTable}.`;

    card.appendChild(header);
    card.appendChild(renderTablePreview(activeTableName, tableConfig));
    card.appendChild(footer);

    app.appendChild(card);
  }

  settingsButton.addEventListener('click', () => {
    window.alert('Settings – To be continued');
  });

  createNav();
  renderView();
})();
