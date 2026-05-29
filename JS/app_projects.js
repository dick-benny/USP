import { PDF_BUCKET } from './app_constants.js?v=133';

const PROJECT_TABLE = 'planning_projects';
const ACTIVITY_TABLE = 'planning_project_activities';
const DEFAULT_CATEGORY = 'CDM Projects';
const CATEGORY_ALL = 'Alla';

function safeText(value) {
  return String(value ?? '').trim();
}

function getDropdownOptionLabel(value) {
  return String(value ?? '').toLocaleUpperCase('sv-SE');
}

function normalizeDate(value) {
  const raw = safeText(value);
  if (!raw || raw === '--' || raw === '-- -- --') return '';
  return raw.slice(0, 10);
}

function toNullableText(value) {
  const raw = safeText(value);
  return raw || null;
}

function sanitizeUploadFileName(name) {
  const raw = String(name || 'dokument').trim();
  return raw
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'dokument';
}

function buildProjectDocStoragePath(file) {
  return `project-docs/${Date.now()}-${sanitizeUploadFileName(file?.name || 'dokument')}`;
}

function normalizeStoragePath(value) {
  const raw = safeText(value);
  if (!raw) return '';

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const url = new URL(raw);
      const publicMarker = `/storage/v1/object/public/${PDF_BUCKET}/`;
      const signMarker = `/storage/v1/object/sign/${PDF_BUCKET}/`;
      if (url.pathname.includes(publicMarker)) return decodeURIComponent(url.pathname.split(publicMarker)[1] || '');
      if (url.pathname.includes(signMarker)) return decodeURIComponent(url.pathname.split(signMarker)[1] || '');
      return raw;
    } catch (err) {
      return raw;
    }
  }

  if (raw.startsWith(`${PDF_BUCKET}/`)) return raw.slice(PDF_BUCKET.length + 1);
  return raw;
}

function getDocumentDisplayName(value) {
  const path = normalizeStoragePath(value);
  if (!path) return '';
  const fileName = path.split('/').pop() || path;
  return fileName
    .replace(/^[0-9]{10,}[-_]/, '')
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[-_]/i, '')
    .replace(/^[0-9a-f]{20,}[-_]/i, '');
}

function createEl(tag, className = '', text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== '') el.textContent = text;
  return el;
}

function getProjectTitle(row) {
  return safeText(row?.project_name) || 'Nytt projekt';
}

function getActivityTitle(row) {
  return safeText(row?.activity_name) || 'Ny aktivitet';
}

export function createProjectsController({
  supabase,
  state,
  tableEntries,
  render,
  getCurrentUserInitials,
  openNotesPanel,
}) {
  function ensureState() {
    if (!Array.isArray(state.projectRows)) state.projectRows = [];
    if (!Array.isArray(state.projectActivityRows)) state.projectActivityRows = [];
    if (!state.projectExpandedById) state.projectExpandedById = {};
    if (!state.projectFilterCategory) state.projectFilterCategory = CATEGORY_ALL;
    if (typeof state.projectsLoading !== 'boolean') state.projectsLoading = false;
    if (!state.projectsSavingCell) state.projectsSavingCell = null;
  }

  function getProjectConfig() {
    return tableEntries.find(([name]) => name === 'PROJEKT')?.[1] || null;
  }

  function getCategories() {
    const config = getProjectConfig();
    const values = Array.isArray(config?.categories) ? config.categories : [];
    return [CATEGORY_ALL, ...values];
  }

  function getActivitiesForProject(projectId) {
    return (state.projectActivityRows || [])
      .filter((item) => String(item.project_id) === String(projectId) && !item.deleted_at)
      .sort((a, b) => {
        const orderA = Number(a.sort_order ?? 1000);
        const orderB = Number(b.sort_order ?? 1000);
        if (orderA !== orderB) return orderA - orderB;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      });
  }

  function getFilteredProjects() {
    const selected = safeText(state.projectFilterCategory) || CATEGORY_ALL;
    return (state.projectRows || [])
      .filter((item) => !item.deleted_at)
      .filter((item) => selected === CATEGORY_ALL || safeText(item.category) === selected)
      .sort((a, b) => {
        const orderA = Number(a.sort_order ?? 1000);
        const orderB = Number(b.sort_order ?? 1000);
        if (orderA !== orderB) return orderA - orderB;
        return getProjectTitle(a).localeCompare(getProjectTitle(b), 'sv');
      });
  }

  async function loadProjects() {
    ensureState();
    state.projectsLoading = true;
    render();

    try {
      const [{ data: projects, error: projectsError }, { data: activities, error: activitiesError }] = await Promise.all([
        supabase
          .from(PROJECT_TABLE)
          .select('*')
          .is('deleted_at', null)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from(ACTIVITY_TABLE)
          .select('*')
          .is('deleted_at', null)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ]);

      if (projectsError) throw projectsError;
      if (activitiesError) throw activitiesError;

      state.projectRows = Array.isArray(projects) ? projects : [];
      state.projectActivityRows = Array.isArray(activities) ? activities : [];
      state.rowsByTable['PROJEKT'] = state.projectRows;
    } catch (err) {
      console.warn('Could not load projects:', err.message);
      state.projectRows = [];
      state.projectActivityRows = [];
      state.rowsByTable['PROJEKT'] = [];
    } finally {
      state.projectsLoading = false;
      render();
    }
  }

  async function reloadProjectsSilently() {
    try {
      const [{ data: projects, error: projectsError }, { data: activities, error: activitiesError }] = await Promise.all([
        supabase.from(PROJECT_TABLE).select('*').is('deleted_at', null).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
        supabase.from(ACTIVITY_TABLE).select('*').is('deleted_at', null).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      ]);
      if (projectsError) throw projectsError;
      if (activitiesError) throw activitiesError;
      state.projectRows = Array.isArray(projects) ? projects : [];
      state.projectActivityRows = Array.isArray(activities) ? activities : [];
      state.rowsByTable['PROJEKT'] = state.projectRows;
    } catch (err) {
      console.warn('Could not reload projects:', err.message);
    }
  }

  function updateLocalProject(id, patch) {
    state.projectRows = (state.projectRows || []).map((item) => String(item.id) === String(id) ? { ...item, ...patch } : item);
    state.rowsByTable['PROJEKT'] = state.projectRows;
  }

  function updateLocalActivity(id, patch) {
    state.projectActivityRows = (state.projectActivityRows || []).map((item) => String(item.id) === String(id) ? { ...item, ...patch } : item);
  }


  function getDbValueForField(field, value) {
    const textFields = new Set(['project_name', 'description', 'activity_name']);
    if (textFields.has(field)) return safeText(value);
    if (field === 'category') return safeText(value) || DEFAULT_CATEGORY;
    return safeText(value) || null;
  }

  async function saveProjectField(row, field, value) {
    if (!row?.id) return;
    const previous = row[field];
    const next = value;
    if (String(previous ?? '') === String(next ?? '')) return;

    const cellKey = `project:${row.id}:${field}`;
    state.projectsSavingCell = cellKey;
    updateLocalProject(row.id, { [field]: next });
    render();

    const payload = { [field]: getDbValueForField(field, next), updated_at: new Date().toISOString() };
    const { error } = await supabase.from(PROJECT_TABLE).update(payload).eq('id', row.id);

    state.projectsSavingCell = null;
    if (error) {
      updateLocalProject(row.id, { [field]: previous });
      alert(`Kunde inte spara projekt: ${error.message}`);
    }
    render();
  }

  async function saveActivityField(row, field, value) {
    if (!row?.id) return;
    const previous = row[field];
    const next = value;
    if (String(previous ?? '') === String(next ?? '')) return;

    const cellKey = `activity:${row.id}:${field}`;
    state.projectsSavingCell = cellKey;
    updateLocalActivity(row.id, { [field]: next });
    render();

    const payload = { [field]: getDbValueForField(field, next), updated_at: new Date().toISOString() };
    const { error } = await supabase.from(ACTIVITY_TABLE).update(payload).eq('id', row.id);

    state.projectsSavingCell = null;
    if (error) {
      updateLocalActivity(row.id, { [field]: previous });
      alert(`Kunde inte spara aktivitet: ${error.message}`);
    }
    render();
  }

  async function createProject() {
    ensureState();
    state.projectsLoading = true;
    render();

    const sortOrder = (state.projectRows || []).length + 1;
    const payload = {
      project_name: '',
      description: '',
      category: state.projectFilterCategory && state.projectFilterCategory !== CATEGORY_ALL ? state.projectFilterCategory : DEFAULT_CATEGORY,
      start_date: null,
      end_date: null,
      docs_url: null,
      owner_initials: getCurrentUserInitials?.() || null,
      sort_order: sortOrder,
    };

    try {
      const { data, error } = await supabase.from(PROJECT_TABLE).insert(payload).select('*').single();
      if (error) throw error;
      if (data) {
        state.projectRows = [...(state.projectRows || []), data];
        state.rowsByTable['PROJEKT'] = state.projectRows;
        state.projectExpandedById[String(data.id)] = false;
      }
    } catch (err) {
      alert(`Kunde inte skapa projekt: ${err.message}`);
    } finally {
      state.projectsLoading = false;
      render();
    }
  }

  async function createActivity(projectId) {
    const project = (state.projectRows || []).find((item) => String(item.id) === String(projectId));
    if (!project?.id) return;

    state.projectsLoading = true;
    render();

    const sortOrder = getActivitiesForProject(projectId).length + 1;
    const payload = {
      project_id: project.id,
      activity_name: '',
      description: '',
      start_date: null,
      end_date: null,
      owner_initials: getCurrentUserInitials?.() || null,
      sort_order: sortOrder,
    };

    try {
      const { data, error } = await supabase.from(ACTIVITY_TABLE).insert(payload).select('*').single();
      if (error) throw error;
      if (data) {
        state.projectActivityRows = [...(state.projectActivityRows || []), data];
        state.projectExpandedById[String(project.id)] = true;
      }
    } catch (err) {
      alert(`Kunde inte skapa aktivitet: ${err.message}`);
    } finally {
      state.projectsLoading = false;
      render();
    }
  }

  async function softDeleteProject(row) {
    if (!row?.id) return;
    const confirmed = window.confirm('Ta bort projektet och dölja dess aktiviteter?');
    if (!confirmed) return;

    state.projectsLoading = true;
    render();
    try {
      const deletedAt = new Date().toISOString();
      const { error } = await supabase.from(PROJECT_TABLE).update({ deleted_at: deletedAt, updated_at: deletedAt }).eq('id', row.id);
      if (error) throw error;
      state.projectRows = (state.projectRows || []).filter((item) => String(item.id) !== String(row.id));
      state.projectActivityRows = (state.projectActivityRows || []).filter((item) => String(item.project_id) !== String(row.id));
      state.rowsByTable['PROJEKT'] = state.projectRows;
    } catch (err) {
      alert(`Kunde inte ta bort projekt: ${err.message}`);
    } finally {
      state.projectsLoading = false;
      render();
    }
  }

  async function softDeleteActivity(row) {
    if (!row?.id) return;
    const confirmed = window.confirm('Ta bort aktiviteten?');
    if (!confirmed) return;

    state.projectsLoading = true;
    render();
    try {
      const deletedAt = new Date().toISOString();
      const { error } = await supabase.from(ACTIVITY_TABLE).update({ deleted_at: deletedAt, updated_at: deletedAt }).eq('id', row.id);
      if (error) throw error;
      state.projectActivityRows = (state.projectActivityRows || []).filter((item) => String(item.id) !== String(row.id));
    } catch (err) {
      alert(`Kunde inte ta bort aktivitet: ${err.message}`);
    } finally {
      state.projectsLoading = false;
      render();
    }
  }

  function getOwnerOptions(currentValue = '') {
    const values = (state.planningUsers || [])
      .map((user) => safeText(user.initials))
      .filter(Boolean);

    const current = safeText(currentValue);
    if (current) values.push(current);

    const own = safeText(getCurrentUserInitials?.());
    if (own) values.push(own);

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'sv'));
  }

  function createOwnerSelect({ row, type, onSave }) {
    const select = document.createElement('select');
    select.className = 'project-owner-prefix project-owner-prefix--select';
    select.title = 'Ändra ansvarig';
    select.setAttribute('aria-label', 'Ändra ansvarig');

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '—';
    select.appendChild(emptyOption);

    getOwnerOptions(row?.owner_initials).forEach((initials) => {
      const option = document.createElement('option');
      option.value = initials;
      option.textContent = initials;
      select.appendChild(option);
    });

    select.value = safeText(row?.owner_initials);

    select.addEventListener('click', (event) => event.stopPropagation());
    select.addEventListener('change', async (event) => {
      event.stopPropagation();
      await onSave(row, 'owner_initials', select.value);
    });

    if (state.projectsSavingCell === `${type}:${row.id}:owner_initials`) select.classList.add('is-saving');
    return select;
  }

  function createInlineText({ row, field, type, placeholder, multiline = false, onSave, showOwner = false }) {
    const wrap = createEl('div', 'project-inline-field');
    const input = document.createElement(multiline ? 'textarea' : 'input');
    input.className = multiline ? 'project-inline-input project-inline-input--textarea' : 'project-inline-input';
    if (!multiline) input.type = 'text';
    if (placeholder) input.placeholder = placeholder;
    input.value = safeText(row?.[field]);
    input.rows = multiline ? 1 : undefined;

    input.addEventListener('keydown', async (event) => {
      if (event.key === 'Enter' && !multiline) {
        event.preventDefault();
        input.blur();
      }
      if (event.key === 'Escape') {
        input.value = safeText(row?.[field]);
        input.blur();
      }
    });

    input.addEventListener('blur', async () => {
      await onSave(row, field, safeText(input.value));
    });

    if (showOwner) {
      wrap.appendChild(createOwnerSelect({ row, type, onSave }));
    }
    wrap.appendChild(input);
    if (state.projectsSavingCell === `${type}:${row.id}:${field}`) wrap.classList.add('is-saving');
    return wrap;
  }

  function createDateControl({ row, field, type, onSave }) {
    const wrap = createEl('div', 'project-date-field');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-date-button';
    const value = normalizeDate(row?.[field]);
    button.textContent = value || '📅';
    button.title = value ? 'Ändra datum' : 'Välj datum';

    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'project-date-native';
    input.value = value;

    const openPicker = () => {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.focus();
    };

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPicker();
    });

    input.addEventListener('change', async () => {
      await onSave(row, field, normalizeDate(input.value));
    });

    wrap.appendChild(button);
    wrap.appendChild(input);
    if (state.projectsSavingCell === `${type}:${row.id}:${field}`) wrap.classList.add('is-saving');
    return wrap;
  }

  function createCategorySelect(row) {
    const select = document.createElement('select');
    select.className = 'project-inline-select project-category-select';
    getCategories().filter((item) => item !== CATEGORY_ALL).forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = getDropdownOptionLabel(category);
      if (safeText(row.category) === category) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', async () => {
      await saveProjectField(row, 'category', select.value);
    });
    return select;
  }

  async function uploadProjectDocument(file) {
    if (!file) throw new Error('Välj en fil.');

    const storagePath = buildProjectDocStoragePath(file);
    const { error } = await supabase.storage
      .from(PDF_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });

    if (error) throw new Error(error.message || 'Kunde inte ladda upp dokumentet.');
    return storagePath;
  }

  async function removeProjectDocument(storagePath) {
    const objectPath = normalizeStoragePath(storagePath);
    if (!objectPath || objectPath.startsWith('http://') || objectPath.startsWith('https://')) return;

    const { error } = await supabase.storage.from(PDF_BUCKET).remove([objectPath]);
    if (error) throw new Error(error.message || 'Kunde inte ta bort tidigare dokument från storage.');
  }

  async function openProjectDocument(value) {
    const objectPath = normalizeStoragePath(value);
    if (!objectPath) {
      alert('Dokument saknas.');
      return;
    }

    if (objectPath.startsWith('http://') || objectPath.startsWith('https://')) {
      window.open(objectPath, '_blank', 'noopener');
      return;
    }

    try {
      const { data, error } = await supabase.storage.from(PDF_BUCKET).createSignedUrl(objectPath, 3600);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener');
        return;
      }
    } catch (err) {
      console.warn('Could not create signed URL for project document:', err.message);
    }

    const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(objectPath);
    if (data?.publicUrl) {
      window.open(data.publicUrl, '_blank', 'noopener');
      return;
    }

    alert('Kunde inte öppna dokumentet.');
  }

  async function replaceProjectDocument(row, file) {
    if (!row?.id || !file) return;

    const previousPath = safeText(row.docs_url);
    const cellKey = `project:${row.id}:docs_url`;
    state.projectsSavingCell = cellKey;
    render();

    try {
      const storagePath = await uploadProjectDocument(file);
      const { error } = await supabase
        .from(PROJECT_TABLE)
        .update({ docs_url: storagePath, updated_at: new Date().toISOString() })
        .eq('id', row.id);

      if (error) throw new Error(error.message || 'Kunde inte spara dokument på projektet.');

      updateLocalProject(row.id, { docs_url: storagePath });

      if (previousPath && previousPath !== storagePath) {
        try {
          await removeProjectDocument(previousPath);
        } catch (cleanupError) {
          console.warn('Could not remove previous project document:', cleanupError.message);
        }
      }
    } catch (err) {
      alert(`Kunde inte ladda upp dokument: ${err.message}`);
    } finally {
      state.projectsSavingCell = null;
      render();
    }
  }

  function createDocsControl(row) {
    const wrap = createEl('div', 'project-docs-field');
    const currentPath = safeText(row.docs_url);
    const displayName = getDocumentDisplayName(currentPath);

    const info = createEl('span', displayName ? 'project-docs-name' : 'project-docs-name project-docs-name--empty', displayName || 'Inget dokument');
    wrap.appendChild(info);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.className = 'project-docs-native';
    fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) await replaceProjectDocument(row, file);
      fileInput.value = '';
    });
    wrap.appendChild(fileInput);

    const upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'project-docs-open';
    upload.textContent = displayName ? 'Byt' : 'Ladda upp';
    upload.title = displayName ? 'Byt dokument' : 'Ladda upp dokument';
    upload.addEventListener('click', () => fileInput.click());
    wrap.appendChild(upload);

    if (currentPath) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'project-docs-open';
      open.textContent = 'Öppna';
      open.addEventListener('click', async () => openProjectDocument(currentPath));
      wrap.appendChild(open);
    }

    if (state.projectsSavingCell === `project:${row.id}:docs_url`) wrap.classList.add('is-saving');
    return wrap;
  }

  function createProjectNotesButton(row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notes-button';
    button.textContent = '📝';
    button.title = 'Notes';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openNotesPanel(row, {
        sourceTable: PROJECT_TABLE,
        title: getProjectTitle(row),
        tableLabel: 'PROJEKT',
      });
    });
    return button;
  }

  function createActivityNotesButton(row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notes-button';
    button.textContent = '📝';
    button.title = 'Notes';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      openNotesPanel({ ...row, __projectActivity: true }, {
        sourceTable: ACTIVITY_TABLE,
        title: getActivityTitle(row),
        tableLabel: 'PROJEKT / Aktivitet',
      });
    });
    return button;
  }

  function createDeleteButton(label, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notes-button project-delete-button';
    button.textContent = '🗑';
    button.title = label || 'Ta bort';
    button.setAttribute('aria-label', label || 'Ta bort');
    button.addEventListener('click', onClick);
    return button;
  }

  function createProjectRow(project) {
    const rows = [];
    const tr = document.createElement('tr');
    tr.className = 'project-row';

    const expanded = state.projectExpandedById[String(project.id)] === true;
    const activities = getActivitiesForProject(project.id);

    const titleTd = document.createElement('td');
    titleTd.className = 'project-title-cell';
    const titleWrap = createEl('div', 'project-title-wrap');
    const expandButton = document.createElement('button');
    expandButton.type = 'button';
    expandButton.className = 'project-expand-button';
    expandButton.textContent = expanded ? '▾' : '▸';
    expandButton.title = expanded ? 'Dölj aktiviteter' : 'Visa aktiviteter';
    expandButton.addEventListener('click', () => {
      state.projectExpandedById[String(project.id)] = !expanded;
      render();
    });
    titleWrap.appendChild(expandButton);
    titleWrap.appendChild(createInlineText({ row: project, field: 'project_name', type: 'project', placeholder: 'Projekt namn', onSave: saveProjectField, showOwner: true }));
    titleTd.appendChild(titleWrap);
    tr.appendChild(titleTd);

    const descTd = document.createElement('td');
    descTd.appendChild(createInlineText({ row: project, field: 'description', type: 'project', placeholder: 'Beskrivning', multiline: true, onSave: saveProjectField }));
    tr.appendChild(descTd);

    const categoryTd = document.createElement('td');
    categoryTd.appendChild(createCategorySelect(project));
    tr.appendChild(categoryTd);

    const startTd = document.createElement('td');
    startTd.className = 'is-center';
    startTd.appendChild(createDateControl({ row: project, field: 'start_date', type: 'project', onSave: saveProjectField }));
    tr.appendChild(startTd);

    const endTd = document.createElement('td');
    endTd.className = 'is-center';
    endTd.appendChild(createDateControl({ row: project, field: 'end_date', type: 'project', onSave: saveProjectField }));
    tr.appendChild(endTd);

    const docsTd = document.createElement('td');
    docsTd.appendChild(createDocsControl(project));
    tr.appendChild(docsTd);

    const notesTd = document.createElement('td');
    notesTd.className = 'is-center';
    notesTd.appendChild(createProjectNotesButton(project));
    tr.appendChild(notesTd);

    const deleteTd = document.createElement('td');
    deleteTd.className = 'is-center';
    deleteTd.appendChild(createDeleteButton('Ta bort', async () => softDeleteProject(project)));
    tr.appendChild(deleteTd);

    rows.push(tr);

    if (expanded) {
      rows.push(createActivityHeaderRow(project));
      activities.forEach((activity) => rows.push(createActivityRow(activity)));
    }

    return rows;
  }


  function createActivityHeaderRow(project) {
    const tr = document.createElement('tr');
    tr.className = 'project-activity-header-row';

    const headers = [
      'Akt namn',
      'Beskrivning',
      '',
      'Start',
      'Slut',
      '',
      'Notes',
      'Ta bort',
    ];

    headers.forEach((label, index) => {
      const td = document.createElement('td');
      if ([3, 4, 6, 7].includes(index)) td.className = 'is-center';
      if (index === 0) {
        const wrap = document.createElement('div');
        wrap.className = 'project-activity-header-start';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary-button project-add-activity-button project-add-activity-button--header';
        button.textContent = 'Ny';
        button.title = 'Ny aktivitet';
        button.setAttribute('aria-label', 'Ny aktivitet');
        button.addEventListener('click', async () => createActivity(project.id));
        wrap.appendChild(button);

        if (label) {
          const span = document.createElement('span');
          span.className = 'project-activity-header-label';
          span.textContent = label;
          wrap.appendChild(span);
        }

        td.appendChild(wrap);
      } else if (label) {
        const span = document.createElement('span');
        span.className = 'project-activity-header-label';
        span.textContent = label;
        td.appendChild(span);
      }
      tr.appendChild(td);
    });

    return tr;
  }

  function createActivityRow(activity) {
    const tr = document.createElement('tr');
    tr.className = 'project-activity-row';

    const titleTd = document.createElement('td');
    titleTd.appendChild(createInlineText({ row: activity, field: 'activity_name', type: 'activity', placeholder: 'Akt namn', onSave: saveActivityField, showOwner: true }));
    tr.appendChild(titleTd);

    const descTd = document.createElement('td');
    descTd.appendChild(createInlineText({
      row: activity,
      field: 'description',
      type: 'activity',
      placeholder: 'Beskrivning',
      multiline: true,
      onSave: saveActivityField,
    }));
    tr.appendChild(descTd);

    const emptyCategory = document.createElement('td');
    emptyCategory.className = 'project-activity-empty-cell';
    emptyCategory.textContent = '';
    tr.appendChild(emptyCategory);

    const startTd = document.createElement('td');
    startTd.className = 'is-center';
    startTd.appendChild(createDateControl({ row: activity, field: 'start_date', type: 'activity', onSave: saveActivityField }));
    tr.appendChild(startTd);

    const endTd = document.createElement('td');
    endTd.className = 'is-center';
    endTd.appendChild(createDateControl({ row: activity, field: 'end_date', type: 'activity', onSave: saveActivityField }));
    tr.appendChild(endTd);

    const emptyDocs = document.createElement('td');
    emptyDocs.className = 'project-activity-empty-cell';
    tr.appendChild(emptyDocs);

    const notesTd = document.createElement('td');
    notesTd.className = 'is-center';
    notesTd.appendChild(createActivityNotesButton(activity));
    tr.appendChild(notesTd);

    const deleteTd = document.createElement('td');
    deleteTd.className = 'is-center';
    deleteTd.appendChild(createDeleteButton('Ta bort', async () => softDeleteActivity(activity)));
    tr.appendChild(deleteTd);

    return tr;
  }

  function createFilterBar() {
    const wrapper = createEl('section', 'filters project-filters');
    const label = createEl('label', 'filter-item');
    const span = createEl('span', 'filter-item__label', 'Kategori');
    const select = document.createElement('select');
    select.className = 'filter-item__control';

    getCategories().forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = getDropdownOptionLabel(category);
      if ((state.projectFilterCategory || CATEGORY_ALL) === category) option.selected = true;
      select.appendChild(option);
    });

    select.addEventListener('change', () => {
      state.projectFilterCategory = select.value;
      render();
    });

    label.appendChild(span);
    label.appendChild(select);
    wrapper.appendChild(label);
    return wrapper;
  }

  function createView() {
    ensureState();

    const shell = createEl('section', 'view-card project-view');
    const header = createEl('div', 'view-card__header');
    const titleBlock = createEl('div', 'view-card__title-block');
    const eyebrow = createEl('p', 'side-panel__eyebrow', 'Projekt');
    const title = createEl('h1', 'view-card__title', 'PROJEKT');
    const subtitle = createEl('p', 'view-card__subtitle', 'Projekt och aktiviteter med inline-redigering.');
    titleBlock.appendChild(eyebrow);
    titleBlock.appendChild(title);
    titleBlock.appendChild(subtitle);

    const actions = createEl('div', 'view-actions');
    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'secondary-button';
    addButton.textContent = 'Nytt projekt';
    addButton.disabled = state.projectsLoading;
    addButton.addEventListener('click', createProject);

    actions.appendChild(addButton);
    header.appendChild(titleBlock);
    header.appendChild(actions);
    shell.appendChild(header);
    shell.appendChild(createFilterBar());

    const tableWrap = createEl('div', 'table-wrap project-table-wrap');
    const table = document.createElement('table');
    table.className = 'data-table project-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:56ch;"><div class="column-header project-title-header"><span class="column-header__label">Projekt namn</span></div></th>
          <th><div class="column-header"><span class="column-header__label">Beskrivning</span></div></th>
          <th style="width:17ch;"><div class="column-header"><span class="column-header__label">Kategori</span></div></th>
          <th class="is-center" style="width:14ch;"><div class="column-header"><span class="column-header__label">Start</span></div></th>
          <th class="is-center" style="width:14ch;"><div class="column-header"><span class="column-header__label">Slut</span></div></th>
          <th style="width:26ch;"><div class="column-header"><span class="column-header__label">Docs</span></div></th>
          <th class="is-center" style="width:9ch;"><div class="column-header"><span class="column-header__label">Notes</span></div></th>
          <th class="is-center" style="width:11ch;"><div class="column-header"><span class="column-header__label">Ta bort</span></div></th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');

    if (state.projectsLoading && !(state.projectRows || []).length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 8;
      td.className = 'empty-row';
      td.textContent = 'Laddar projekt...';
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      const projects = getFilteredProjects();
      projects.forEach((project) => {
        createProjectRow(project).forEach((row) => tbody.appendChild(row));
      });

      if (!projects.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 8;
        td.className = 'empty-row';
        td.textContent = 'Inga projekt ännu.';
        tr.appendChild(td);
        tbody.appendChild(tr);
      }
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    shell.appendChild(tableWrap);
    return shell;
  }

  return {
    createView,
    loadProjects,
    reloadProjectsSilently,
  };
}
