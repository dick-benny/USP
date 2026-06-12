export function createRowTodoController({
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
}) {
  function getRowTodoKey(tableName, rowId) {
    return `${tableName}::${rowId}`;
  }

  function getCurrentRowTodoRow() {
    if (!state.activeTableName || !state.rowTodoRowId) return null;
    return getRowById(state.activeTableName, state.rowTodoRowId);
  }

  function resetRowTodoDraft(tableName) {
    const categories = getRowTodoCategories(tableName);
    state.rowTodoDraft = {
      kategori: categories[0] || 'Alla',
      beskrivning: '',
    };
  }

  async function loadRowTodosForRow(tableName, rowId) {
    state.rowTodoLoading = true;
    render();

    try {
      const active = tableEntries.find(([name]) => name === tableName);
      if (!active) return;
      const [, tableConfig] = active;

      const { data, error } = await supabase
        .from('planning_row_todos')
        .select('*')
        .eq('source_table', tableConfig.dbTable)
        .eq('source_row_id', rowId)
        .order('is_done', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;
      state.rowTodosByKey[getRowTodoKey(tableName, rowId)] = Array.isArray(data) ? data : [];
      await loadModalTodoRows();
    } catch (err) {
      alert(`Kunde inte läsa ToDos: ${err.message}`);
      state.rowTodosByKey[getRowTodoKey(tableName, rowId)] = [];
    } finally {
      state.rowTodoLoading = false;
      render();
    }
  }

  function openRowTodoPanel(row) {
    if (!row?.id || !hasRowTodo(state.activeTableName)) return;
    state.linksPanelOpen = false;
    state.rowTodoPanelOpen = true;
    state.rowTodoRowId = row.id;
    state.detailRowId = null;
    state.newRowDraft = null;
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.notesRowId = null;
    state.settingsPanelOpen = false;
    resetRowTodoDraft(state.activeTableName);
    void loadRowTodosForRow(state.activeTableName, row.id);
    render();
  }

  function closeRowTodoPanel() {
    state.rowTodoPanelOpen = false;
    state.rowTodoRowId = null;
    resetRowTodoDraft(state.activeTableName);
    render();
  }

  async function saveRowTodoForCurrentRow() {
    const row = getCurrentRowTodoRow();
    if (!row) return;

    const kategori = 'Allmänt';
    const beskrivning = String(state.rowTodoDraft.beskrivning || '').trim();

    if (!beskrivning) {
      alert('Beskrivning saknas.');
      return;
    }

    const active = getActiveConfig();
    if (!active) return;
    const [tableName, tableConfig] = active;

    state.rowTodoLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_row_todos')
        .insert({
          source_table: tableConfig.dbTable,
          source_row_id: row.id,
          kategori,
          beskrivning,
          is_done: false,
          created_by: getCurrentUserInitials(),
        });

      if (error) throw error;

      await loadRowTodosForRow(tableName, row.id);
    } catch (err) {
      alert(`Kunde inte spara ToDo: ${err.message}`);
    } finally {
      state.rowTodoLoading = false;
      render();
    }
  }

  async function toggleRowTodoDone(item) {
    state.rowTodoLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_row_todos')
        .update({ is_done: !item.is_done })
        .eq('id', item.id);

      if (error) throw error;

      await loadRowTodosForRow(state.activeTableName, state.rowTodoRowId);
    } catch (err) {
      alert(`Kunde inte uppdatera ToDo: ${err.message}`);
    } finally {
      state.rowTodoLoading = false;
      render();
    }
  }

  async function deleteRowTodo(item) {
    const confirmed = window.confirm('Ta bort denna ToDo?');
    if (!confirmed) return;

    state.rowTodoLoading = true;
    render();

    try {
      const { error } = await supabase
        .from('planning_row_todos')
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      await loadRowTodosForRow(state.activeTableName, state.rowTodoRowId);
    } catch (err) {
      alert(`Kunde inte ta bort ToDo: ${err.message}`);
    } finally {
      state.rowTodoLoading = false;
      render();
    }
  }

  function createTodoButton(row) {
    const wrap = document.createElement('div');
    wrap.className = 'row-actions';

    if (isVirtualModalTodoRow(row)) {
      return wrap;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notes-button';
    button.textContent = '✓';
    button.title = 'ToDo';
    button.setAttribute('aria-label', 'Öppna ToDo');
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openRowTodoPanel(row);
    });

    wrap.appendChild(button);
    return wrap;
  }

  function createRowTodoPanel() {
    const tableName = state.activeTableName;
    const row = getCurrentRowTodoRow();
    const rowKey = row ? getRowTodoKey(tableName, row.id) : '';
    const todos = state.rowTodosByKey[rowKey] || [];
    const titleField = getRowTitleField(tableName);
    const rowTitle = row ? (row[titleField] || 'Rad') : 'Rad';
    const tableLabel = tableName;
    const categories = getRowTodoCategories(tableName);
    const selectedCategory = String(state.rowTodoDraft.kategori || 'Alla');
    const filteredTodos = selectedCategory === 'Alla'
      ? todos
      : todos.filter((item) => String(item.kategori || '') === selectedCategory);

    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        event.preventDefault();
        event.stopPropagation();
      }
    });

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog notes-panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    heading.className = 'todo-modal__heading';
    heading.innerHTML = `
      <p class="side-panel__eyebrow">${tableLabel}</p>
      <h2 class="side-panel__title">ToDo</h2>
      <p class="side-panel__text">${rowTitle}</p>
    `;

    const headerActions = document.createElement('div');
    headerActions.className = 'side-panel__header-actions';

    const cancelButtonTop = document.createElement('button');
    cancelButtonTop.type = 'button';
    cancelButtonTop.className = 'secondary-button';
    cancelButtonTop.textContent = 'Avbryt';
    cancelButtonTop.addEventListener('click', () => {
      resetRowTodoDraft(tableName);
      render();
    });

    const saveButtonTop = document.createElement('button');
    saveButtonTop.type = 'button';
    saveButtonTop.className = 'secondary-button';
    saveButtonTop.textContent = state.rowTodoLoading ? 'Sparar...' : 'Spara';
    saveButtonTop.disabled = state.rowTodoLoading;
    saveButtonTop.addEventListener('click', async () => {
      await saveRowTodoForCurrentRow();
    });

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.title = 'Stäng';
    closeButton.addEventListener('click', closeRowTodoPanel);

    headerActions.appendChild(cancelButtonTop);
    headerActions.appendChild(saveButtonTop);

    header.appendChild(heading);
    header.appendChild(headerActions);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    const formCard = document.createElement('section');
    formCard.className = 'detail-card notes-form';

    const formTitle = document.createElement('h3');
    formTitle.className = 'detail-card__title';
    formTitle.textContent = 'Ny ToDo';

    const categoryLabel = document.createElement('label');
    categoryLabel.className = 'detail-field';
    const categorySpan = document.createElement('span');
    categorySpan.className = 'detail-field__label';
    categorySpan.textContent = 'Kategori';
    const categorySelect = document.createElement('select');
    categorySelect.className = 'detail-field__control';
    categories.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = getDropdownOptionLabel(value);
      if ((state.rowTodoDraft.kategori || 'Alla') === value) option.selected = true;
      categorySelect.appendChild(option);
    });
    categorySelect.addEventListener('change', () => {
      state.rowTodoDraft.kategori = categorySelect.value;
      render();
    });
    categoryLabel.appendChild(categorySpan);
    categoryLabel.appendChild(categorySelect);

    const bodyLabel = document.createElement('label');
    bodyLabel.className = 'detail-field';
    const bodySpan = document.createElement('span');
    bodySpan.className = 'detail-field__label';
    bodySpan.textContent = 'Beskrivning';
    const bodyInput = document.createElement('textarea');
    bodyInput.className = 'detail-field__control notes-form__body todo-modal__textarea';
    bodyInput.rows = 6;
    bodyInput.value = state.rowTodoDraft.beskrivning || '';
    bodyInput.addEventListener('input', () => {
      state.rowTodoDraft.beskrivning = bodyInput.value;
    });
    bodyLabel.appendChild(bodySpan);
    bodyLabel.appendChild(bodyInput);

    formCard.appendChild(formTitle);
    formCard.appendChild(categoryLabel);
    formCard.appendChild(bodyLabel);

    const historyCard = document.createElement('section');
    historyCard.className = 'detail-card notes-history';

    const historyTitle = document.createElement('h3');
    historyTitle.className = 'detail-card__title';
    historyTitle.textContent = 'ToDos';

    historyCard.appendChild(historyTitle);

    if (state.rowTodoLoading) {
      const loading = document.createElement('p');
      loading.className = 'empty-state';
      loading.textContent = 'Laddar ToDos...';
      historyCard.appendChild(loading);
    } else if (!filteredTodos.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = selectedCategory === 'Alla' ? 'Inga ToDos ännu.' : 'Inga ToDos i vald kategori.';
      historyCard.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'notes-history__list';

      filteredTodos.forEach((item) => {
        const card = document.createElement('article');
        card.className = `todo-item${item.is_done ? ' is-done' : ''}`;

        const topRow = document.createElement('div');
        topRow.className = 'todo-item__top';

        const title = document.createElement('div');
        title.className = 'todo-item__category';
        title.textContent = item.kategori || 'Alla';

        const rightGroup = document.createElement('div');
        rightGroup.className = 'todo-item__right';

        const meta = document.createElement('div');
        meta.className = 'todo-item__meta';
        meta.textContent = `${formatDateTimeValue(item.created_at)}${item.created_by ? ` · ${item.created_by}` : ''}`;

        const actions = document.createElement('div');
        actions.className = 'todo-item__actions';

        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className = item.is_done ? 'secondary-button' : 'primary-button';
        doneButton.textContent = item.is_done ? 'Öppna igen' : 'Klar';
        doneButton.addEventListener('click', async () => {
          await toggleRowTodoDone(item);
        });

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'secondary-button secondary-button--danger';
        deleteButton.textContent = 'Ta bort';
        deleteButton.addEventListener('click', async () => {
          await deleteRowTodo(item);
        });

        actions.appendChild(doneButton);
        actions.appendChild(deleteButton);
        rightGroup.appendChild(meta);
        rightGroup.appendChild(actions);

        topRow.appendChild(title);
        topRow.appendChild(rightGroup);

        const text = document.createElement('div');
        text.className = 'todo-item__body';
        text.textContent = item.beskrivning || '';

        card.appendChild(topRow);
        card.appendChild(text);

        list.appendChild(card);
      });

      historyCard.appendChild(list);
    }

    body.appendChild(formCard);
    body.appendChild(historyCard);

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    return overlay;
  }

  return {
    getRowTodoKey,
    getCurrentRowTodoRow,
    resetRowTodoDraft,
    loadRowTodosForRow,
    openRowTodoPanel,
    closeRowTodoPanel,
    saveRowTodoForCurrentRow,
    toggleRowTodoDone,
    deleteRowTodo,
    createTodoButton,
    createRowTodoPanel,
  };
}
