const TABLE = 'planning_meetings';
const FIELDS = 'id,meeting_at,visitor,comment,host_initials,created_at,created_by';

export function localDayStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function localDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseLocalDateTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  // Reject invalid dates and times skipped when daylight saving time begins.
  return localDateTime(date) === value ? date.toISOString() : null;
}

export function visibleMeetings(rows, archived, now = new Date()) {
  const boundary = localDayStart(now).getTime();
  return rows.filter((row) => {
    const time = new Date(row.meeting_at).getTime();
    return archived ? time < boundary : time >= boundary;
  }).sort((a, b) => {
    const delta = new Date(a.meeting_at) - new Date(b.meeting_at);
    return (archived ? -delta : delta) || String(a.id).localeCompare(String(b.id));
  });
}

export function createMeetingsController({ supabase, getHostOptions, getCurrentUser }) {
  let archived = false;
  let activeView = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createView() {
    const shell = element('section', 'view-card meetings-view');
    const header = element('div', 'view-card__header');
    const heading = element('div');
    const title = element('h1', 'view-card__title');
    heading.append(title);
    const actions = element('div', 'meetings-actions');
    const add = element('button', 'primary-button', '+ Nytt meeting');
    const toggle = element('button', 'secondary-button');
    const retry = element('button', 'secondary-button', 'Försök igen');
    [add, toggle, retry].forEach((button) => { button.type = 'button'; });
    retry.hidden = true;
    actions.append(add, toggle, retry);
    header.append(heading, actions);
    const status = element('p', 'meetings-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const wrap = element('div', 'meetings-table-wrap');
    const table = element('table', 'meetings-table');
    const head = element('thead');
    const headings = element('tr');
    ['Tid', 'Besökare', 'Kommentar', 'Värd', 'Åtgärd'].forEach((label) => {
      const th = element('th', '', label);
      th.scope = 'col';
      headings.append(th);
    });
    head.append(headings);
    const body = element('tbody');
    table.append(head, body);
    wrap.append(table);
    shell.append(header, status, wrap);

    let rows = [];
    let loading = true;
    let loadFailed = false;
    let pending = 0;
    let day = localDayStart().getTime();
    let needsPaint = false;
    const busyRows = new Set();

    function controls() {
      add.disabled = loading || loadFailed || pending > 0;
      toggle.disabled = loading || pending > 0;
    }

    function paintWhenReady() {
      if (!needsPaint || pending || body.contains(document.activeElement)) return;
      paint();
    }

    function requestPaint() {
      needsPaint = true;
      paintWhenReady();
    }

    function report(error, prefix) {
      status.textContent = `${prefix}: ${error.message || error}`;
      status.dataset.error = 'true';
    }

    async function mutate(row, tr, operation, success) {
      if (busyRows.has(row.id)) return;
      busyRows.add(row.id);
      pending += 1;
      controls();
      tr.querySelectorAll('input,textarea,select,button').forEach((control) => { control.disabled = true; });
      status.textContent = 'Sparar…';
      delete status.dataset.error;
      try {
        const { data, error } = await operation();
        if (error) throw error;
        if (!data) throw new Error('Mötet finns inte kvar eller kunde inte sparas.');
        success(data);
        status.textContent = 'Sparat';
      } catch (error) {
        report(error, 'Kunde inte spara');
        // Restore only this row, leaving edits in other rows untouched.
        if (tr.isConnected) tr.replaceWith(createRow(row));
      } finally {
        busyRows.delete(row.id);
        pending -= 1;
        tr.querySelectorAll('input,textarea,select,button').forEach((control) => { control.disabled = false; });
        controls();
        paintWhenReady();
      }
    }

    function createRow(row) {
      const tr = element('tr');
      tr.dataset.meetingId = row.id;
      const definitions = [
        ['meeting_at', 'Tid', 'input'],
        ['visitor', 'Besökare', 'input'],
        ['comment', 'Kommentar', 'textarea'],
        ['host_initials', 'Värd', 'select'],
      ];
      definitions.forEach(([field, label, tag]) => {
        const td = element('td');
        const control = element(tag, 'meetings-control');
        control.setAttribute('aria-label', label);
        if (field === 'meeting_at') {
          control.type = 'datetime-local';
          control.step = '60';
          control.required = true;
          control.value = localDateTime(row[field]);
        } else if (field === 'host_initials') {
          const values = ['', ...getHostOptions(row[field])];
          [...new Set(values)].forEach((value) => {
            const option = element('option', '', value || '—');
            option.value = value;
            control.append(option);
          });
          control.value = row[field] || '';
        } else {
          if (tag === 'input') control.type = 'text';
          if (tag === 'textarea') control.rows = 2;
          control.value = row[field] || '';
        }
        control.addEventListener('input', () => control.setCustomValidity(''));
        control.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            control.value = field === 'meeting_at' ? localDateTime(row[field]) : row[field] || '';
            control.setCustomValidity('');
            control.blur();
          } else if (event.key === 'Enter' && tag === 'input') {
            event.preventDefault();
            control.blur();
          }
        });
        // Save text/date on leaving the cell, so the date picker can be completed.
        control.addEventListener(tag === 'select' ? 'change' : 'blur', async () => {
          const next = field === 'meeting_at' ? parseLocalDateTime(control.value) : control.value;
          if (next === null) {
            control.setCustomValidity('Ange ett giltigt datum och klockslag.');
            control.reportValidity();
            status.textContent = 'Tid sparades inte. Ange ett giltigt datum och klockslag.';
            return;
          }
          const previous = field === 'meeting_at' ? localDateTime(row[field]) : row[field] || '';
          if (control.value === previous) return;
          await mutate(row, tr,
            () => supabase.from(TABLE).update({ [field]: next }).eq('id', row.id).select(FIELDS).single(),
            (saved) => {
              Object.assign(row, saved);
              if (field === 'meeting_at') requestPaint();
            });
        });
        td.append(control);
        tr.append(td);
      });
      const td = element('td');
      const remove = element('button', 'secondary-button meetings-delete', 'Ta bort');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (!window.confirm('Ta bort mötet?')) return;
        await mutate(row, tr,
          () => supabase.from(TABLE).delete().eq('id', row.id).select('id').single(),
          () => {
            rows = rows.filter((item) => item.id !== row.id);
            tr.remove();
            requestPaint();
          });
      });
      td.append(remove);
      tr.append(td);
      return tr;
    }

    function paint() {
      needsPaint = false;
      day = localDayStart().getTime();
      title.textContent = archived ? 'Meetings · Arkiv' : 'Meetings';
      toggle.textContent = archived ? 'Aktiva möten' : 'Arkiv';
      toggle.setAttribute('aria-pressed', String(archived));
      body.replaceChildren();
      const visible = visibleMeetings(rows, archived);
      visible.forEach((row) => body.append(createRow(row)));
      if (!visible.length) {
        const tr = element('tr');
        const td = element('td', 'empty-row', loading ? 'Läser möten…' : archived ? 'Inga arkiverade möten.' : 'Inga kommande möten.');
        td.colSpan = 5;
        tr.append(td);
        body.append(tr);
      }
      controls();
    }

    async function load() {
      loading = true;
      loadFailed = false;
      controls();
      retry.hidden = true;
      status.textContent = 'Läser möten…';
      delete status.dataset.error;
      try {
        // Page explicitly: Supabase otherwise truncates the list at its row limit.
        const loaded = [];
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase.from(TABLE).select(FIELDS)
            .order('meeting_at', { ascending: true }).order('id', { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          loaded.push(...(data || []));
          if (!data || data.length < pageSize) break;
        }
        rows = loaded;
        status.textContent = '';
      } catch (error) {
        loadFailed = true;
        report(error, 'Kunde inte läsa möten');
        retry.hidden = false;
      } finally {
        loading = false;
        paint();
      }
    }

    add.addEventListener('click', async () => {
      if (pending || loading || loadFailed) return;
      pending += 1;
      controls();
      delete status.dataset.error;
      status.textContent = 'Skapar möte…';
      try {
        const user = getCurrentUser();
        if (!user?.id) throw new Error('Logga in igen för att skapa ett möte.');
        const now = new Date();
        now.setSeconds(0, 0);
        const { data, error } = await supabase.from(TABLE).insert({
          meeting_at: now.toISOString(), visitor: '', comment: '',
          host_initials: user.initials || '', created_by: user.id,
        }).select(FIELDS).single();
        if (error) throw error;
        if (!data) throw new Error('Mötet kunde inte skapas.');
        rows.push(data);
        archived = false;
        paint();
        status.textContent = 'Mötet har skapats. Redigera direkt i raden.';
        const tr = [...body.children].find((node) => node.dataset.meetingId === data.id);
        tr?.querySelector('input')?.focus();
      } catch (error) {
        report(error, 'Kunde inte skapa mötet');
      } finally {
        pending -= 1;
        controls();
      }
    });
    toggle.addEventListener('click', () => { archived = !archived; paint(); });
    retry.addEventListener('click', () => { void load(); });
    shell.addEventListener('focusout', () => { window.setTimeout(paintWhenReady, 0); });
    activeView = {
      shell,
      refreshDay() {
        if (localDayStart().getTime() !== day) requestPaint();
      },
    };
    paint();
    void load();
    return shell;
  }

  function refreshDay() {
    if (activeView?.shell.isConnected) activeView.refreshDay();
  }
  // Re-evaluate local midnight, including DST and waking a sleeping browser.
  window.setInterval(refreshDay, 1000);
  document.addEventListener('visibilitychange', refreshDay);
  window.addEventListener('focus', refreshDay);
  return { createView };
}
