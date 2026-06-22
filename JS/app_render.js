export function createRenderController(deps) {
  const {
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
    createCustomView,
    enhanceSortableHeaders,
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
    saveStatusDateCell,
    toggleTodoDone,
    startEditing,
  } = deps;

  function getISOWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function formatDateSv(date) {
    const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    return `${date.getDate()} ${months[date.getMonth()]}`;
  }

  function getCurrentWeekSubtitle() {
    const now = new Date();
    return `V${String(getISOWeekNumber(now)).padStart(2, '0')} - ${formatDateSv(now)}`;
  }

  function isCustomViewConfig(tableConfig) {
    return !!tableConfig?.customView;
  }

  function shouldEnhanceSortableHeaders(tableName, tableConfig, renderedCustomView) {
    return !renderedCustomView && tableName !== 'PROJEKT' && !isCustomViewConfig(tableConfig);
  }

  function createCustomViewFallback(tableName, tableConfig) {
    const shell = document.createElement('section');
    shell.className = 'view-card';

    const header = document.createElement('div');
    header.className = 'view-card__header';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'view-card__title-block';

    const title = document.createElement('h1');
    title.className = 'view-card__title';
    title.textContent = tableConfig?.title || tableName;

    const subtitle = document.createElement('p');
    subtitle.className = 'view-card__subtitle';
    subtitle.textContent = getCurrentWeekSubtitle();

    titleBlock.appendChild(title);
    titleBlock.appendChild(subtitle);
    header.appendChild(titleBlock);

    const body = document.createElement('div');
    body.className = 'empty-state';
    body.textContent = 'Specialvyn kunde inte laddas.';

    shell.appendChild(header);
    shell.appendChild(body);
    return shell;
  }

  function createPlaceholderView(tableName, tableConfig) {
    const shell = document.createElement('section');
    shell.className = 'view-card';

    const header = document.createElement('div');
    header.className = 'view-card__header';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'view-card__title-block';

    const title = document.createElement('h1');
    title.className = 'view-card__title';
    title.textContent = tableConfig.title || tableName;

    const subtitle = document.createElement('p');
    subtitle.className = 'view-card__subtitle';
    subtitle.textContent = getCurrentWeekSubtitle();

    titleBlock.appendChild(title);
    titleBlock.appendChild(subtitle);
    header.appendChild(titleBlock);

    const body = document.createElement('div');
    body.className = 'empty-state';
    body.textContent = 'To Be Continued';

    shell.appendChild(header);
    shell.appendChild(body);
    return shell;
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
    subtitle.textContent = getCurrentWeekSubtitle();

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
      if (column.width) th.style.width = column.width;
      if (getAlignment(column) === 'center') th.classList.add('is-center');
      if (isStatusColumn(column)) th.classList.add('status-column');

      const headerInner = document.createElement('div');
      headerInner.className = 'column-header';

      const label = document.createElement('span');
      label.className = 'column-header__label';
      label.textContent = column.name;
      headerInner.appendChild(label);

      if (!isOpenColumn(column) && !isNotesColumn(column) && !isTodoColumn(column)) {
        const checklistBadge = createChecklistBadge(tableName, column);
        if (checklistBadge) {
          headerInner.appendChild(checklistBadge);
        }

        const badge = createDocumentBadge(tableName, column);
        if (badge) {
          headerInner.appendChild(badge);
        }
      }

      th.appendChild(headerInner);
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);

    const tbody = document.createElement('tbody');

    rows.forEach((row) => {
      const tr = document.createElement('tr');

      if (tableName === TODO_TABLE && !isVirtualModalTodoRow(row)) {
        tr.addEventListener('contextmenu', async (event) => {
          event.preventDefault();
          await toggleTodoDone(tableName, tableConfig, row);
        });
      }

      if (tableName === TODO_TABLE && row.is_done) {
        tr.classList.add('is-done');
      }

      visibleColumns.forEach((column) => {
        const td = document.createElement('td');

        if (getAlignment(column) === 'center') td.classList.add('is-center');
        if (isStatusColumn(column)) td.classList.add('status-cell');

        if (isOpenColumn(column)) {
          td.appendChild(createOpenButton(row));
          tr.appendChild(td);
          return;
        }

        if (isNotesColumn(column)) {
          td.appendChild(createNotesButton(row));
          tr.appendChild(td);
          return;
        }

        if (isTodoColumn(column)) {
          td.appendChild(createTodoButton(row));
          tr.appendChild(td);
          return;
        }

        const cellKey = getCellKey(row, column);
        const isEditing = state.editingCell === cellKey;
        const isSaving = state.savingCell === cellKey;
        const isReadonlyRow = isVirtualModalTodoRow(row);
        const editableText = isEditableTextColumn(column) && !!row.id && !row.is_done && !isReadonlyRow;
        const editableDropdown = isEditableDropdownColumn(column) && !!row.id && !row.is_done && !isReadonlyRow;
        const statusToggle = isStatusColumn(column) && !!row.id && !row.is_done && !isReadonlyRow;
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
            const statusButton = td.querySelector('.status-button');
            const dateInputs = Array.from(td.querySelectorAll('[data-status-date-field]'));

            dateInputs.forEach((dateInput) => {
              const stopStatusToggle = (event) => {
                event.stopPropagation();
              };

              dateInput.addEventListener('pointerdown', stopStatusToggle);
              dateInput.addEventListener('mousedown', stopStatusToggle);
              dateInput.addEventListener('click', (event) => {
                event.stopPropagation();
                if (typeof dateInput.showPicker === 'function') {
                  try {
                    dateInput.showPicker();
                  } catch (err) {
                    // Native picker may already be opening, or the browser may block it.
                  }
                }
              });

              dateInput.addEventListener('change', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const dateField = String(dateInput.dataset.statusDateField || '').trim();
                if (!dateField || typeof saveStatusDateCell !== 'function') return;
                await saveStatusDateCell(tableConfig, row, column, dateInput.value, dateField);
              });
            });

            const toggleHandler = async (event) => {
              if (event.target?.closest?.('[data-status-date-field], .status-week-cell__date-trigger')) {
                event.stopPropagation();
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              await toggleStatusCell(tableConfig, row, column);
            };

            if (statusButton) {
              statusButton.addEventListener('click', toggleHandler);
            } else {
              td.addEventListener('click', toggleHandler);
            }
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


  async function render() {
    const active = getActiveConfig();
    if (!active) return;

    const [tableName, tableConfig] = active;

    if (settingsButton && !settingsButton.dataset.boundSettings) {
      settingsButton.dataset.boundSettings = 'true';
      settingsButton.addEventListener('click', openSettingsMenu);
    }

    ensureLinksButton();
    ensureMessagesButton(userArea, settingsButton);
    createNav();
    app.innerHTML = '';

    let mainView = null;
    let renderedCustomView = false;

    if (isCustomViewConfig(tableConfig)) {
      renderedCustomView = true;
      mainView = typeof createCustomView === 'function'
        ? createCustomView(tableName, tableConfig)
        : null;

      if (!mainView) {
        mainView = createCustomViewFallback(tableName, tableConfig);
      }
    } else if (tableConfig.placeholder) {
      mainView = createPlaceholderView(tableName, tableConfig);
    } else {
      mainView = createTable(tableName, tableConfig);
    }

    app.appendChild(mainView);

    if (typeof enhanceSortableHeaders === 'function' && shouldEnhanceSortableHeaders(tableName, tableConfig, renderedCustomView)) {
      enhanceSortableHeaders();
    }

    const draftRow = getCurrentDraftRow();
    const row = getCurrentDetailRow();

    if (state.settingsPanelOpen) {
      app.appendChild(createSettingsPanel());
    } else if (state.linksPanelOpen) {
      app.appendChild(createLinksPanel());
    } else if (state.messagesPanelOpen) {
      app.appendChild(createMessagesPanel());
    } else if (state.archivePanelOpen && tableName !== 'RUTINER') {
      app.appendChild(createArchivePanel());
    } else if (state.rowTodoPanelOpen) {
      app.appendChild(createRowTodoPanel());
    } else if (state.notesPanelOpen) {
      app.appendChild(createNotesPanel());
    } else if (state.columnChecklistPanelOpen) {
      const checklistPanel = createColumnChecklistPanel();
      if (checklistPanel) app.appendChild(checklistPanel);
    } else if (draftRow) {
      app.appendChild(createDetailPanel(tableName, tableConfig, draftRow, { isDraft: true }));
    } else if (row) {
      app.appendChild(createDetailPanel(tableName, tableConfig, row));
    }
  }


  return {
    createTable,
    render,
  };
}
