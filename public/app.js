// TaskFlow frontend: plain JavaScript, state in one object, fetch() to the REST API.
const state = {
  token: localStorage.getItem('token'),
  user: null,
  projects: [],
  activeProjectId: null,
  tasks: [],
  filter: '',
  registering: false,
};

const $ = (id) => document.getElementById(id);
const STATUS_LABELS = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

// ---- API helper ----
async function api(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && state.user) logout();
    const detail = data.details ? ': ' + data.details.join('; ') : '';
    throw new Error((data.error || 'Request failed') + detail);
  }
  return data;
}

function showMessage(text) {
  $('message').textContent = text || '';
  $('message').hidden = !text;
}

// Runs an async action and shows any error to the user.
async function run(action) {
  showMessage('');
  try {
    await action();
  } catch (err) {
    showMessage(err.message);
  }
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// ---- Rendering ----
function render() {
  const loggedIn = Boolean(state.user);
  $('auth-view').hidden = loggedIn;
  $('app-view').hidden = !loggedIn;
  $('user-box').hidden = !loggedIn;
  if (!loggedIn) return renderAuth();
  $('user-name').textContent = state.user.name;
  renderProjects();
  renderTasks();
}

function renderAuth() {
  const r = state.registering;
  $('auth-title').textContent = r ? 'Create account' : 'Log in';
  $('auth-submit').textContent = r ? 'Create account' : 'Log in';
  $('name-field').hidden = !r;
  $('password-hint').hidden = !r;
  $('switch-text').textContent = r ? 'Already have an account?' : 'No account yet?';
  $('auth-switch').textContent = r ? 'Log in' : 'Create one';
}

function renderProjects() {
  const items = state.projects.map((p) => {
    const select = el('button', { type: 'button', className: 'name', textContent: p.name });
    select.addEventListener('click', () => run(() => selectProject(p.id)));
    const remove = el('button', { type: 'button', className: 'delete', textContent: 'Delete' });
    remove.setAttribute('aria-label', 'Delete project ' + p.name);
    remove.addEventListener('click', () => run(() => deleteProject(p)));
    const count = el('span', { className: 'count', textContent: `${p.done_count}/${p.task_count} done` });
    const li = el('li', { className: 'project' + (p.id === state.activeProjectId ? ' active' : '') }, [select, count, remove]);
    if (p.id === state.activeProjectId) select.setAttribute('aria-current', 'true');
    return li;
  });
  $('project-list').replaceChildren(...items);
}

function renderTasks() {
  const project = state.projects.find((p) => p.id === state.activeProjectId);
  $('tasks-heading').textContent = project ? 'Tasks: ' + project.name : 'Tasks';
  $('task-form').hidden = !project;
  const today = new Date().toISOString().slice(0, 10);

  const items = state.tasks.map((t) => {
    const status = el('select');
    status.setAttribute('aria-label', 'Status of ' + t.title);
    for (const [value, label] of Object.entries(STATUS_LABELS)) {
      status.append(el('option', { value, textContent: label, selected: value === t.status }));
    }
    status.addEventListener('change', () => run(() => updateTask(t, { status: status.value })));
    const remove = el('button', { type: 'button', className: 'delete', textContent: 'Delete' });
    remove.setAttribute('aria-label', 'Delete task ' + t.title);
    remove.addEventListener('click', () => run(() => deleteTask(t)));
    const children = [el('span', { className: 'title', textContent: t.title })];
    if (t.due_date) {
      const overdue = t.due_date < today && t.status !== 'done';
      children.push(el('span', { className: 'due' + (overdue ? ' overdue' : ''), textContent: (overdue ? 'Overdue ' : 'Due ') + t.due_date }));
    }
    children.push(status, remove);
    return el('li', { className: 'task ' + t.status }, children);
  });
  $('task-list').replaceChildren(...items);

  const empty = $('task-empty');
  empty.hidden = items.length > 0;
  empty.textContent = !project
    ? 'Select or create a project to see its tasks.'
    : state.filter ? 'No tasks with this status.' : 'No tasks yet. Add the first one above.';
}

// ---- Actions ----
async function loadProjects() {
  state.projects = (await api('GET', '/projects')).projects;
  if (!state.projects.some((p) => p.id === state.activeProjectId)) {
    state.activeProjectId = state.projects[0] ? state.projects[0].id : null;
  }
}

async function loadTasks() {
  if (!state.activeProjectId) return void (state.tasks = []);
  const query = state.filter ? '?status=' + state.filter : '';
  state.tasks = (await api('GET', `/projects/${state.activeProjectId}/tasks${query}`)).tasks;
}

async function refresh() {
  await loadProjects();
  await loadTasks();
  render();
}

async function selectProject(id) {
  state.activeProjectId = id;
  await loadTasks();
  render();
}

async function deleteProject(p) {
  if (!confirm(`Delete project "${p.name}" and all its tasks?`)) return;
  await api('DELETE', `/projects/${p.id}`);
  await refresh();
}

async function updateTask(t, changes) {
  await api('PATCH', `/projects/${t.project_id}/tasks/${t.id}`, changes);
  await refresh();
}

async function deleteTask(t) {
  await api('DELETE', `/projects/${t.project_id}/tasks/${t.id}`);
  await refresh();
}

function logout() {
  localStorage.removeItem('token');
  Object.assign(state, { token: null, user: null, projects: [], tasks: [], activeProjectId: null });
  render();
}

// ---- Events ----
$('auth-switch').addEventListener('click', () => {
  state.registering = !state.registering;
  showMessage('');
  render();
});

$('auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target));
  run(async () => {
    const data = state.registering
      ? await api('POST', '/auth/register', form)
      : await api('POST', '/auth/login', { email: form.email, password: form.password });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    e.target.reset();
    await refresh();
  });
});

$('logout').addEventListener('click', logout);

$('project-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    const { project } = await api('POST', '/projects', { name: $('project-name').value });
    e.target.reset();
    state.activeProjectId = project.id;
    await refresh();
  });
});

$('task-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    await api('POST', `/projects/${state.activeProjectId}/tasks`, {
      title: $('task-title').value,
      due_date: $('task-due').value || null,
    });
    e.target.reset();
    await refresh();
  });
});

$('status-filter').addEventListener('change', (e) => {
  state.filter = e.target.value;
  run(async () => {
    await loadTasks();
    render();
  });
});

// ---- Start: restore the session if a token is saved ----
(async function init() {
  if (state.token) {
    try {
      state.user = (await api('GET', '/auth/me')).user;
      await refresh();
      return;
    } catch {
      localStorage.removeItem('token');
      state.token = null;
    }
  }
  render();
})();
