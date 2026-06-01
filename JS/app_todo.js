function getTodayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function getStartOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() + diff);
  return monday;
}

function parseDateValue(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '--' || raw === '-- -- --') return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  date.setHours(0, 0, 0, 0);
  return date;
}

function parseTodoDoneDate(row) {
  return (
    parseDateValue(row?.klart_datum) ||
    parseDateValue(row?.updated_at) ||
    parseDateValue(row?.created_at)
  );
}

function isCompletedTodoRow(row) {
  if (!row) return false;
  if (row.is_done === true) return true;
  if (String(row.is_done).toLowerCase() === 'true') return true;
  if (String(row.status || '').trim().toLowerCase() === 'green') return true;
  if (String(row.klart || '').trim().toLowerCase() === 'green') return true;
  return false;
}

export function createTodoController({
  supabase,
  state,
  APP_CONFIG,
  TODO_TABLE,
  UI_OPEN_COLUMN,
  getCellKey,
  isVirtualModalTodoRow,
  normalizeRow,
  render,
}) {
  async function archiveRowSilently(tableConfig, row, archiveReason, note) {
    if (!row?.id) return false;

    const { error } = await supabase.rpc('planning_archive_row', {
      p_source_table: tableConfig.dbTable,
      p_row_id: row.id,
      p_mark_done: true,
      p_archive_reason: archiveReason,
      p_note: note,
    });

    if (error) {
      console.warn(`Could not auto-archive ${tableConfig.dbTable} row ${row.id}:`, error.message);
      return false;
    }

    return true;
  }

  async function archiveCompletedTodosFromPreviousWeeks() {
    const todoConfig = APP_CONFIG.tables?.[TODO_TABLE];
    if (!todoConfig) return false;

    const startOfCurrentWeek = getStartOfCurrentWeek();
    const rows = state.rowsByTable[TODO_TABLE] || [];

    const rowsToArchive = rows.filter((row) => {
      if (!row?.id || !isCompletedTodoRow(row)) return false;
      const doneDate = parseTodoDoneDate(row);
      return !!doneDate && doneDate < startOfCurrentWeek;
    });

    if (!rowsToArchive.length) return false;

    const archivedIds = [];

    for (const row of rowsToArchive) {
      const archived = await archiveRowSilently(todoConfig, row, 'weekly_todo_cleanup', 'Automatiskt arkiverad vid ny vecka.');
      if (archived) archivedIds.push(row.id);
    }

    if (!archivedIds.length) return false;

    state.rowsByTable[TODO_TABLE] = rows.filter((row) => !archivedIds.includes(row.id));

    if (state.detailRowId && archivedIds.includes(state.detailRowId)) {
      state.detailRowId = null;
    }

    return true;
  }


  function isGreenOperationalRow(row) {
    return String(row?.status || '').trim().toLowerCase() === 'green';
  }

  function parseOperationalDoneDate(row) {
    return (
      parseDateValue(row?.klart_datum) ||
      parseDateValue(row?.updated_at) ||
      parseDateValue(row?.created_at)
    );
  }

  async function archiveGreenOperationalRowsFromPreviousWeeks() {
    const tableNames = ['INKÖP', 'MARKNAD', 'SÄLJ'];
    const startOfCurrentWeek = getStartOfCurrentWeek();
    let archivedSomething = false;

    for (const tableName of tableNames) {
      const tableConfig = APP_CONFIG.tables?.[tableName];
      if (!tableConfig?.dbTable) continue;

      const rows = state.rowsByTable[tableName] || [];
      const rowsToArchive = rows.filter((row) => {
        if (!row?.id || !isGreenOperationalRow(row)) return false;
        const doneDate = parseOperationalDoneDate(row);
        return !!doneDate && doneDate < startOfCurrentWeek;
      });

      if (!rowsToArchive.length) continue;

      const archivedIds = [];
      for (const row of rowsToArchive) {
        const archived = await archiveRowSilently(
          tableConfig,
          row,
          'weekly_status_cleanup',
          'Automatiskt arkiverad vid ny vecka när status är grön.'
        );
        if (archived) archivedIds.push(row.id);
      }

      if (!archivedIds.length) continue;

      state.rowsByTable[tableName] = rows.filter((row) => !archivedIds.includes(row.id));
      if (state.activeTableName === tableName && state.detailRowId && archivedIds.includes(state.detailRowId)) {
        state.detailRowId = null;
      }

      archivedSomething = true;
    }

    return archivedSomething;
  }

  async function toggleTodoDone(tableName, tableConfig, row) {
    if (tableName !== TODO_TABLE || !row?.id || isVirtualModalTodoRow(row)) return;

    const key = getCellKey(row, UI_OPEN_COLUMN);
    const nextIsDone = !row.is_done;
    const previousIsDone = row.is_done;
    const previousDoneDate = row.klart_datum;
    const nextDoneDate = nextIsDone ? getTodayDateValue() : '-- -- -- ';

    state.savingCell = key;
    row.is_done = nextIsDone;
    row.klart_datum = nextDoneDate;
    render();

    const { data, error } = await supabase
      .from(tableConfig.dbTable)
      .update({
        is_done: nextIsDone,
        klart_datum: nextDoneDate,
      })
      .eq('id', row.id)
      .select('*')
      .single();

    state.savingCell = null;

    if (error) {
      row.is_done = previousIsDone;
      row.klart_datum = previousDoneDate;
      alert(`Kunde inte uppdatera TODO-raden: ${error.message}`);
      render();
      return;
    }

    const normalizedData = normalizeRow(tableName, tableConfig, data);
    state.rowsByTable[tableName] = (state.rowsByTable[tableName] || []).map((item) =>
      item.id === row.id ? normalizedData : item
    );

    render();
  }

  return {
    archiveCompletedTodosFromPreviousWeeks,
    archiveGreenOperationalRowsFromPreviousWeeks,
    toggleTodoDone,
  };
}
