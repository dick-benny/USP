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

function parseTodoDoneDate(row) {
  const raw = String(row?.klart_datum || '').trim();
  if (!raw || raw === '--' || raw === '-- -- --') return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
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
  async function archiveTodoRowSilently(tableConfig, row) {
    if (!row?.id) return false;

    const { error } = await supabase.rpc('planning_archive_row', {
      p_source_table: tableConfig.dbTable,
      p_row_id: row.id,
      p_mark_done: true,
      p_archive_reason: 'weekly_todo_cleanup',
      p_note: 'Automatiskt arkiverad vid ny vecka.',
    });

    if (error) {
      console.warn(`Could not auto-archive TODO row ${row.id}:`, error.message);
      return false;
    }

    return true;
  }

  async function archiveCompletedTodosFromPreviousWeeks() {
    const todoConfig = APP_CONFIG.tables?.[TODO_TABLE];
    if (!todoConfig) return;

    const startOfCurrentWeek = getStartOfCurrentWeek();
    const rows = state.rowsByTable[TODO_TABLE] || [];

    const rowsToArchive = rows.filter((row) => {
      if (!row?.id || !row.is_done) return false;
      const doneDate = parseTodoDoneDate(row);
      return !!doneDate && doneDate < startOfCurrentWeek;
    });

    if (!rowsToArchive.length) return;

    const archivedIds = [];

    for (const row of rowsToArchive) {
      const archived = await archiveTodoRowSilently(todoConfig, row);
      if (archived) archivedIds.push(row.id);
    }

    if (!archivedIds.length) return;

    state.rowsByTable[TODO_TABLE] = rows.filter((row) => !archivedIds.includes(row.id));

    if (state.detailRowId && archivedIds.includes(state.detailRowId)) {
      state.detailRowId = null;
    }
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
    toggleTodoDone,
  };
}
