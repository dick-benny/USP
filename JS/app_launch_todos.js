const TABLE = 'planning_view_todos';
const VIEW = 'LANSERINGSPLAN';
export const TODO_STATES = ['gray', 'yellow', 'green'];
export function todoStatus(row) { return row.is_done ? 'green' : row.status === 'yellow' ? 'yellow' : 'gray'; }
export function sortTodos(rows, oldest) {
  return [...rows].sort((a, b) => ((Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0)) * (oldest ? 1 : -1) || String(a.id).localeCompare(String(b.id)));
}
export function createLaunchTodos({ supabase, getCurrentUserInitials, openFloatingActionMenu, onChange, getCollections = () => [] }) {
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
    const headerActions = el('div');
    headerActions.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:8px';
    const add = el('button', 'Ny Rad', 'side-panel__close');
    headerActions.append(close, add);
    header.append(el('h2', 'Lanseringsplan TODO', 'side-panel__title'), headerActions);
    const body = el('div', undefined, 'side-panel__body');
    const message = el('p'); message.setAttribute('role', 'status');
    const filterLabel = el('label', undefined, 'detail-field');
    filterLabel.style.cssText = 'width:fit-content;max-width:100%';
    const filter = el('select', undefined, 'detail-field__control');
    filter.setAttribute('aria-label', 'COLLECTION');
    filterLabel.append(el('span', 'COLLECTION', 'detail-field__label'), filter);
    const table = el('table'); table.style.width = '100%';
    const head = el('thead'); const titles = el('tr');
    for (const title of ['Collection', 'Kommentar', 'Åtgärd']) {
      const th = el('th', title); th.scope = 'col'; th.style.textAlign = 'left'; titles.append(th);
    }
    head.append(titles);
    const list = el('tbody'); table.append(head, list);
    function collections() {
      return [...new Set([...getCollections(), ...rows.map(row => row.collection)].filter(Boolean))];
    }
    function refreshFilter() {
      const selected = filter.value;
      filter.replaceChildren();
      for (const [value, label] of [['', 'Alla'], ['__none__', 'Utan Collection'], ...collections().map(c => [c, c])]) {
        const option = el('option', label); option.value = value; filter.append(option);
      }
      filter.value = selected;
      const style = getComputedStyle(filter);
      const measure = document.createElement('canvas').getContext('2d');
      if (measure) measure.font = style.font || '14px sans-serif';
      const width = Math.max(...Array.from(filter.options, option => measure?.measureText(option.text).width || option.text.length * 9));
      filter.style.width = Math.ceil(width + 52) + 'px';
      filter.style.maxWidth = '100%';
    }
    filter.addEventListener('change', draw);
    const retry = el('button', 'Försök igen', 'secondary-button'); retry.hidden = true;
    let rows = [], busy = false, loaded = false;
    function scoped(query) { return query.eq('view_name', VIEW); }
    function draw() {
      list.replaceChildren();
      add.disabled = busy || !loaded;
      const filtered = rows.filter(row => !filter.value || (filter.value === '__none__' ? !row.collection : row.collection === filter.value));
      if (!filtered.length && loaded) {
        const row = el('tr'); const cell = el('td', 'Inga TODO för valt filter.'); cell.colSpan = 3; row.append(cell); list.append(row);
      }
      for (const item of sortTodos(filtered, false)) {
        const row = el('tr');
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
        const collection = el('span', item.collection || '—');
        for (const control of [collection, text, more]) {
          const cell = el('td'); cell.style.cssText = 'padding:10px 8px;border-bottom:1px solid #ddd;vertical-align:top';
          cell.append(control); row.append(cell);
        }
        if (item.product) row.children[0].append(el('small', ' / ' + item.product));
        list.append(row);
      }
    }
    async function reload() {
      const {data, error} = await scoped(supabase.from(TABLE).select('*'));
      if (error) throw error;
      rows = data || []; loaded = true; refreshFilter();
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
    add.addEventListener('click', () => {
      if (busy || !loaded || overlay.querySelector('.launch-todo-create')) return;
      const modal = el('div', undefined, 'overlay-modal launch-todo-create');
      const box = el('div', undefined, 'overlay-modal__dialog');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', 'Ny TODO');
      const content = el('section', undefined, 'side-panel');
      content.style.width = 'min(460px, 92vw)';
      const form = el('form', undefined, 'side-panel__body');
      const collectionSelect = el('select', undefined, 'detail-field__control');
      collectionSelect.required = true;
      collectionSelect.setAttribute('aria-label', 'Collection');
      const placeholder = el('option', 'Välj Collection'); placeholder.value = ''; collectionSelect.append(placeholder);
      for (const value of collections()) { const option = el('option', value); option.value = value; collectionSelect.append(option); }
      collectionSelect.value = filter.value === '__none__' ? '' : filter.value;
      const input = el('textarea', undefined, 'detail-field__control'); input.rows = 5;
      input.placeholder = 'Skriv en TODO…';
      input.setAttribute('aria-label', 'Kommentar');
      const errorText = el('p'); errorText.setAttribute('role', 'status');
      const save = el('button', 'Save', 'secondary-button'); save.type = 'submit';
      const cancel = el('button', 'Avbryt', 'secondary-button');
      let submitting = false;
      const dismiss = () => { if (!submitting) { modal.remove(); add.focus(); } };
      cancel.addEventListener('click', dismiss);
      modal.addEventListener('click', event => { event.stopPropagation(); if (event.target === modal) dismiss(); });
      modal.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
        if (event.key === 'Enter' && event.target === input && !event.shiftKey && !event.isComposing) {
          event.preventDefault(); form.requestSubmit();
        }
      });
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const value = input.value.trim();
        if (!collectionSelect.value) { collectionSelect.focus(); return; }
        if (!value || submitting || busy) { input.focus(); return; }
        submitting = true; collectionSelect.disabled = input.disabled = save.disabled = cancel.disabled = true;
        const saved = await mutate(() => supabase.from(TABLE).insert({view_name: VIEW, scope_type: 'collection', collection: collectionSelect.value, product: null, beskrivning: value, status: 'gray', is_done: false, created_by: getCurrentUserInitials() || null}));
        submitting = false;
        if (saved) { modal.remove(); add.focus(); }
        else { collectionSelect.disabled = input.disabled = save.disabled = cancel.disabled = false; errorText.textContent = message.textContent; input.focus(); }
      });
      const modalHeader = el('div', undefined, 'side-panel__header');
      const modalHeading = el('div', undefined, 'todo-modal__heading');
      modalHeading.append(el('p', 'LANSERINGSPLAN TODO', 'side-panel__eyebrow'), el('h2', 'Ny rad', 'side-panel__title'), el('p', 'Fyll i fälten nedan och välj Save eller Avbryt.', 'side-panel__text'));
      const actions = el('div', undefined, 'side-panel__header-actions');
      save.type = 'button'; save.addEventListener('click', () => form.requestSubmit());
      actions.append(cancel, save); modalHeader.append(modalHeading, actions);
      for (const [title, control] of [['Collection', collectionSelect], ['Kommentar', input]]) {
        const label = el('label', undefined, 'detail-field'); label.append(el('span', title, 'detail-field__label'), control); form.append(label);
      }
      form.append(errorText); content.append(modalHeader);
      content.append(form); box.append(content); modal.append(box); overlay.append(modal); collectionSelect.focus();
    });
    retry.addEventListener('click', load);
    overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') overlay.remove(); });
    body.append(filterLabel, message, retry, table); panel.append(header, body); dialog.append(panel); overlay.append(dialog); document.body.append(overlay);
    await load(); add.focus();
  };
}
