const TABLE = 'planning_view_todos';
const VIEW = 'LANSERINGSPLAN';
export const TODO_STATES = ['gray', 'yellow', 'green'];
export function todoStatus(row) { return row.is_done ? 'green' : row.status === 'yellow' ? 'yellow' : 'gray'; }
export function sortTodos(rows, oldest) {
  return [...rows].sort((a, b) => ((Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0)) * (oldest ? 1 : -1) || String(a.id).localeCompare(String(b.id)));
}
export function createLaunchTodos({ supabase, getCurrentUserInitials, openFloatingActionMenu, onChange }) {
  const labels = { gray: 'Ej påbörjad', yellow: 'Pågår', green: 'Klar' };
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    if (tag === 'button') node.type = 'button';
    return node;
  }
  return async function open() {
    document.getElementById('launchTodoOverlay')?.remove();
    const overlay = el('div', undefined, 'overlay-modal');
    overlay.id = 'launchTodoOverlay';
    const dialog = el('div', undefined, 'overlay-modal__dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Lanseringsplan TODO');
    const panel = el('section', undefined, 'side-panel');
    panel.style.width = 'min(760px, 94vw)';
    const header = el('div', undefined, 'side-panel__header');
    const close = el('button', 'Stäng', 'side-panel__close');
    close.addEventListener('click', () => overlay.remove());
    header.append(el('h2', 'Lanseringsplan TODO', 'side-panel__title'), close);
    const body = el('div', undefined, 'side-panel__body');
    const sort = el('select', undefined, 'detail-field__control');
    sort.setAttribute('aria-label', 'Sortera TODO');
    for (const [value, text] of [['newest', 'Nyast först'], ['oldest', 'Äldst först']]) {
      const option = el('option', text); option.value = value; sort.append(option);
    }
    const form = el('form');
    form.style.cssText = 'display:flex;gap:8px;margin:12px 0';
    const input = el('input', undefined, 'detail-field__control');
    input.placeholder = 'Skriv en TODO…'; input.required = true;
    input.setAttribute('aria-label', 'Ny TODO');
    const add = el('button', '+ Ny TODO', 'primary-button'); add.type = 'submit';
    form.append(input, add);
    const message = el('p'); message.setAttribute('role', 'status');
    const list = el('div');
    const retry = el('button', 'Försök igen', 'secondary-button'); retry.hidden = true;
    let rows = [], busy = false, loaded = false;
    function scoped(query) { return query.eq('view_name', VIEW).eq('scope_type', 'view'); }
    function draw() {
      list.replaceChildren();
      add.disabled = busy || !loaded;
      if (!rows.length && loaded) list.append(el('p', 'Inga TODO ännu.'));
      for (const item of sortTodos(rows, sort.value === 'oldest')) {
        const row = el('div'); row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #ddd';
        const status = todoStatus(item);
        const toggle = el('button', undefined, `status-button status-button--${status}`);
        toggle.style.cssText = `width:24px;height:24px;min-width:24px;border:1px solid #777;border-radius:50%;background:${{gray:'#c9c9c9',yellow:'#f0cb49',green:'#66ac79'}[status]}`;
        toggle.title = labels[status]; toggle.setAttribute('aria-label', `Status: ${labels[status]}. Klicka för nästa status.`);
        toggle.disabled = busy;
        toggle.addEventListener('click', () => {
          const next = TODO_STATES[(TODO_STATES.indexOf(status) + 1) % TODO_STATES.length];
          void mutate(() => scoped(supabase.from(TABLE).update({status: next, is_done: next === 'green', updated_at: new Date().toISOString()}).eq('id', item.id)).select('id').single());
        });
        const text = el('textarea', undefined, 'detail-field__control');
        text.value = item.beskrivning || ''; text.rows = 2; text.style.flex = '1';
        text.setAttribute('aria-label', 'TODO-text'); text.disabled = busy;
        text.addEventListener('change', () => {
          const value = text.value.trim();
          if (!value) { text.value = item.beskrivning; message.textContent = 'TODO-texten får inte vara tom.'; return; }
          if (value !== item.beskrivning) void mutate(() => scoped(supabase.from(TABLE).update({beskrivning: value, updated_at: new Date().toISOString()}).eq('id', item.id)).select('id').single());
        });
        const more = el('button', '...', 'row-actions__button row-actions__menu-trigger');
        more.setAttribute('aria-label', 'Fler åtgärder'); more.disabled = busy;
        more.addEventListener('click', () => openFloatingActionMenu(more, [{label: 'Ta bort', danger: true, action: async () => {
          if (confirm('Ta bort TODO?')) await mutate(() => scoped(supabase.from(TABLE).delete().eq('id', item.id)).select('id').single());
        }}]));
        row.append(toggle, text, more); list.append(row);
      }
    }
    async function reload() {
      const {data, error} = await scoped(supabase.from(TABLE).select('*'));
      if (error) throw error;
      rows = data || []; loaded = true;
    }
    async function mutate(operation) {
      if (busy) return false;
      busy = true; message.textContent = ''; draw();
      let saved = false;
      try {
        const {error} = await operation(); if (error) throw error;
        saved = true;
        await reload(); onChange?.();
      } catch (err) {
        message.textContent = saved ? `Sparat, men listan kunde inte uppdateras: ${err.message}` : `Kunde inte spara: ${err.message}`;
        retry.hidden = false;
      } finally { busy = false; draw(); }
      return saved;
    }
    async function load() {
      busy = true; draw(); message.textContent = 'Läser TODO…'; retry.hidden = true;
      try { await reload(); message.textContent = ''; }
      catch (err) { message.textContent = `Kunde inte läsa TODO: ${err.message}`; retry.hidden = false; }
      finally { busy = false; draw(); }
    }
    form.addEventListener('submit', async event => {
      event.preventDefault(); const value = input.value.trim(); if (!value || busy) return;
      if (await mutate(() => supabase.from(TABLE).insert({view_name: VIEW, scope_type: 'view', collection: null, product: null, beskrivning: value, status: 'gray', is_done: false, created_by: getCurrentUserInitials() || null}))) input.value = '';
    });
    sort.addEventListener('change', draw); retry.addEventListener('click', load);
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') overlay.remove(); });
    body.append(sort, form, message, retry, list); panel.append(header, body); dialog.append(panel); overlay.append(dialog); document.body.append(overlay);
    input.focus(); await load();
  };
}
