export function createColumnToolsController({
  supabase,
  state,
  openPdfDocument,
  render,
}) {
function normalizeDocumentLinks(rows) {
  const linksByTable = {};
  (rows || []).forEach((item) => {
    const tableName = String(item.table_name || '').trim();
    const columnField = String(item.column_field || '').trim();
    if (!tableName || !columnField) return;
    if (!linksByTable[tableName]) linksByTable[tableName] = {};
    linksByTable[tableName][columnField] = item;
  });
  return linksByTable;
}

async function loadDocumentLinks() {
  try {
    const { data, error } = await supabase
      .from('planning_document_links')
      .select('*')
      .order('table_name', { ascending: true });

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    state.documentLinksList = rows;
    state.documentLinksByTable = normalizeDocumentLinks(rows);
  } catch (err) {
    console.warn('Could not load document links:', err.message);
    state.documentLinksList = [];
    state.documentLinksByTable = {};
  }
}

function getDocumentLinkForColumn(tableName, column) {
  return state.documentLinksByTable?.[tableName]?.[column.field] || null;
}

function normalizeColumnChecklists(rows) {
  const checklistsByTable = {};
  (rows || []).forEach((item) => {
    const tableName = String(item.table_name || '').trim();
    const columnField = String(item.column_field || '').trim();
    if (!tableName || !columnField || item.is_active === false) return;
    if (!checklistsByTable[tableName]) checklistsByTable[tableName] = {};
    checklistsByTable[tableName][columnField] = item;
  });
  return checklistsByTable;
}

async function loadColumnChecklists() {
  state.columnChecklistsLoading = true;
  state.columnChecklistsError = '';

  try {
    const { data, error } = await supabase
      .from('planning_column_checklists')
      .select('id,table_name,column_field,title,body,sort_order,is_active,created_at,updated_at')
      .order('table_name', { ascending: true })
      .order('column_field', { ascending: true })
      .order('sort_order', { ascending: true });

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    state.columnChecklistsList = rows;
    state.columnChecklistsByTable = normalizeColumnChecklists(rows);

    if (!rows.length) {
      state.columnChecklistsError = 'Inga checklistor kunde läsas från DB. Kör policy-fixen om du vet att rader finns.';
    }
  } catch (err) {
    console.warn('Could not load column checklists:', err.message);
    state.columnChecklistsList = [];
    state.columnChecklistsByTable = {};
    state.columnChecklistsError = err.message || 'Kunde inte läsa checklistor.';
  } finally {
    state.columnChecklistsLoading = false;
  }
}

function getColumnChecklistForColumn(tableName, column) {
  return state.columnChecklistsByTable?.[tableName]?.[column.field] || null;
}

function openColumnChecklist(tableName, column) {
  const checklist = getColumnChecklistForColumn(tableName, column);
  if (!checklist) return;

  state.columnChecklistPanelOpen = true;
  state.columnChecklistActive = {
    tableName,
    columnName: column.name,
    columnField: column.field,
    checklist,
  };
  state.linksPanelOpen = false;
  state.settingsPanelOpen = false;
  state.archivePanelOpen = false;
  state.notesPanelOpen = false;
  state.notesRowId = null;
  state.rowTodoPanelOpen = false;
  state.rowTodoRowId = null;
  state.detailRowId = null;
  state.newRowDraft = null;
  render();
}

function closeColumnChecklistPanel() {
  state.columnChecklistPanelOpen = false;
  state.columnChecklistActive = null;
  render();
}

function createChecklistBadge(tableName, column) {
  const checklist = getColumnChecklistForColumn(tableName, column);
  if (!checklist) return null;

  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'column-checklist-badge';
  badge.textContent = '✓';
  badge.title = String(checklist.title || 'Visa checklist').trim() || 'Visa checklist';
  badge.setAttribute('aria-label', `Visa checklist för ${column.name}`);
  badge.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openColumnChecklist(tableName, column);
  });

  return badge;
}

function getChecklistItems(body) {
  return String(body || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createColumnChecklistPanel() {
  const active = state.columnChecklistActive;
  const checklist = active?.checklist;
  if (!active || !checklist) return null;

  const overlay = document.createElement('div');
  overlay.className = 'overlay-modal';
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  const dialog = document.createElement('aside');
  dialog.className = 'side-panel overlay-modal__dialog checklist-panel';

  const header = document.createElement('div');
  header.className = 'side-panel__header';

  const heading = document.createElement('div');
  const title = String(checklist.title || active.columnName || 'Checklist').trim();
  heading.innerHTML = `
    <p class="side-panel__eyebrow">${active.tableName} · ${active.columnName}</p>
    <h2 class="side-panel__title">${title}</h2>
    <p class="side-panel__text">Checklist för kolumnen.</p>
  `;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'side-panel__close';
  closeButton.textContent = 'Stäng';
  closeButton.addEventListener('click', closeColumnChecklistPanel);

  header.appendChild(heading);
  header.appendChild(closeButton);

  const body = document.createElement('div');
  body.className = 'side-panel__body';

  const card = document.createElement('section');
  card.className = 'detail-card checklist-card';

  const items = getChecklistItems(checklist.body);
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Checklistan saknar punkter ännu.';
    card.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'checklist-list';

    items.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'checklist-list__item';

      const mark = document.createElement('span');
      mark.className = 'checklist-list__mark';
      mark.textContent = '✓';

      const text = document.createElement('span');
      text.className = 'checklist-list__text';
      text.textContent = item;

      li.appendChild(mark);
      li.appendChild(text);
      list.appendChild(li);
    });

    card.appendChild(list);
  }

  body.appendChild(card);
  dialog.appendChild(header);
  dialog.appendChild(body);
  overlay.appendChild(dialog);
  return overlay;
}

function getRutinerDocumentPathByRowId(rutinerRowId) {
  const rutinerRows = state.rowsByTable['RUTINER'] || [];
  const match = rutinerRows.find((row) => String(row.id) === String(rutinerRowId));
  return match?.document || '';
}

async function openLinkedDocument(tableName, column) {
  const link = getDocumentLinkForColumn(tableName, column);
  if (!link) return;

  const documentPath = getRutinerDocumentPathByRowId(link.rutiner_row_id);
  if (!documentPath) {
    alert('Det kopplade dokumentet kunde inte hittas i RUTINER.');
    return;
  }

  await openPdfDocument(documentPath);
}

function createDocumentBadge(tableName, column) {
  const link = getDocumentLinkForColumn(tableName, column);
  if (!link) return null;

  const badge = document.createElement('button');
  badge.type = 'button';
  badge.className = 'doc-link-badge';
  badge.textContent = '';
  badge.className = 'doc-link-dot';
  badge.title = String(link.label || 'Öppna kopplat dokument').trim() || 'Öppna kopplat dokument';
  badge.setAttribute('aria-label', `Öppna kopplat dokument för ${column.name}`);
  badge.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openLinkedDocument(tableName, column);
  });

  return badge;
}

  return {
    loadDocumentLinks,
    loadColumnChecklists,
    createColumnChecklistPanel,
    createChecklistBadge,
    createDocumentBadge,
  };
}
