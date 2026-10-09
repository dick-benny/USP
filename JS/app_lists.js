export const LIST_TYPES = {
  dropdown_dev_syfte: 'suppliers',
  dropdown_pre_dev_kategori: 'suppliers',
  dropdown_design_collection: 'collections',
};

export function editorOptions(dropdown, current = '', isDraft = false) {
  const active = dropdown.options || [];
  if (!dropdown.managedList) return active.map(value => ({ value, disabled: false }));
  const values = [...active];
  if (!isDraft && !values.includes(current)) values.unshift(current);
  if (!values.includes('')) values.unshift('');
  return values.map(value => ({ value, disabled: !!value && !active.includes(value) }));
}

export function createListsController({ supabase, APP_CONFIG, state, isAdmin, render }) {
  let rows = { suppliers: [], collections: [] };
  let errorMessage = '';
  let busy = false;
  let pending;
  function apply() {
    for (const [type, kind] of Object.entries(LIST_TYPES)) {
      const config = APP_CONFIG.dropdowns[type];
      config.managedList = kind;
      config.options = rows[kind].filter(r => r.is_active).map(r => r.name);
      config.filterOptions = ['Alla', ...config.options];
      if (kind === 'collections' && state.marketingPlanFilters && !config.options.includes(state.marketingPlanFilters.collection)) {
        state.marketingPlanFilters.collection = 'ALL';
      }
      for (const [tableName, table] of Object.entries(APP_CONFIG.tables)) {
        for (const column of table.columns || []) {
          const filters = state.filtersByTable[tableName];
          if (column.type === type && filters && !config.filterOptions.includes(filters[column.field])) {
            filters[column.field] = 'Alla';
          }
        }
      }
    }
  }
  apply(); // Fail closed: never restore hardcoded choices when the database is unavailable.
  async function load() {
    if (pending) return pending;
    pending = (async () => {
      try {
        const result = await Promise.all(['suppliers', 'collections'].map(async kind => {
          const { data, error } = await supabase.from(`planning_${kind}`).select('id,name,sort_order,is_active')
            .order('sort_order').order('name');
          if (error) throw error;
          return [kind, data || []];
        }));
        rows = Object.fromEntries(result);
        errorMessage = '';
      } catch (error) {
        rows = { suppliers: [], collections: [] };
        errorMessage = 'Listorna kunde inte hämtas. Kontrollera anslutningen och att SQL för v333 har körts.';
        console.error('Planning lists:', error);
      }
      apply();
      return !errorMessage;
    })();
    try { return await pending; } finally { pending = null; }
  }
  async function mutate(kind, item, patch) {
    if (!isAdmin() || busy) return;
    if (patch.name !== undefined) {
      patch.name = patch.name.trim();
      if (!patch.name || patch.name.length > 120) return alert('Ange ett namn med 1–120 tecken.');
      if (['all', 'alla'].includes(patch.name.toLowerCase())) return alert('All och Alla är reserverade för filter.');
    }
    busy = true;
    render();
    try {
      const query = supabase.from(`planning_${kind}`);
      const { data, error } = item
        ? await query.update(patch).eq('id', item.id).select('id')
        : await query.insert(patch).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Ingen ändring sparades. Kontrollera adminbehörigheten.');
      await load();
    } catch (error) {
      alert(error.code === '23505' ? 'Namnet finns redan, även bland inaktiva värden.' : `Kunde inte spara: ${error.message}`);
    } finally { busy = false; render(); }
  }
  function panel() {
    const root = document.createElement('section');
    root.className = 'detail-card planning-lists';
    if (!isAdmin()) { root.textContent = 'Endast admin kan hantera listorna.'; return root; }
    const title = document.createElement('h3');
    title.textContent = 'Listor';
    const help = document.createElement('p');
    help.textContent = 'Namnbyte gäller framtida val. Befintliga rader behåller sina sparade värden. Lägre ordningsnummer visas först.';
    root.append(title, help);
    if (errorMessage) {
      const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.textContent = errorMessage;
      const retry = document.createElement('button'); retry.textContent = 'Försök igen'; retry.type = 'button';
      retry.onclick = async () => { await load(); render(); };
      root.append(error, retry);
    }
    for (const [kind, label] of [['suppliers', 'Supplier'], ['collections', 'Collection']]) {
      const heading = document.createElement('h4'); heading.textContent = label; root.append(heading);
      for (const item of [...rows[kind], null]) {
        const form = document.createElement('form'); form.className = 'planning-lists__row';
        const name = document.createElement('input'); name.value = item?.name || ''; name.required = true; name.maxLength = 120;
        name.placeholder = `Ny ${label}`; name.setAttribute('aria-label', `${label} namn`);
        const order = document.createElement('input'); order.type = 'number'; order.step = '1'; order.min = '-2147483648'; order.max = '2147483647';
        order.value = item?.sort_order ?? Math.min(2147483647, Math.max(0, ...rows[kind].map(r => r.sort_order)) + 10);
        order.required = true; order.setAttribute('aria-label', `${label} ordning`);
        const save = document.createElement('button'); save.className = 'secondary-button'; save.type = 'submit'; save.textContent = item ? 'Spara' : 'Lägg till';
        const status = document.createElement('span'); status.textContent = item ? (item.is_active ? 'Aktiv' : 'Inaktiv') : '';
        form.append(name, order, save, status);
        if (item) {
          const toggle = document.createElement('button'); toggle.className = 'secondary-button'; toggle.type = 'button';
          toggle.textContent = item.is_active ? 'Inaktivera' : 'Aktivera';
          toggle.onclick = () => mutate(kind, item, { is_active: !item.is_active }); form.append(toggle);
        }
        form.onsubmit = event => {
          event.preventDefault();
          const sort_order = Number(order.value);
          if (!Number.isInteger(sort_order)) return;
          void mutate(kind, item, { name: name.value, sort_order });
        };
        form.querySelectorAll('input,button').forEach(el => { el.disabled = busy || !!errorMessage; });
        root.append(form);
      }
    }
    return root;
  }
  return { load, panel, getError: () => errorMessage };
}
