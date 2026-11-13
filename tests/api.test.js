// API tests: start the app on a random port with an in-memory database.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { verifyToken, createToken } = require('../src/auth');

let server;
let base;

before(async () => {
  const app = createApp({ dbFile: ':memory:' });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(method, url, { body, token, raw } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body !== undefined || raw ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

let n = 0;
async function newUser() {
  n += 1;
  const res = await call('POST', '/api/auth/register', {
    body: { name: `User ${n}`, email: `user${n}@example.com`, password: 'password123' },
  });
  assert.equal(res.status, 201);
  return res.body;
}

test('health check', async () => {
  const res = await call('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'ok' });
});

test('serves the frontend', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /TaskFlow/);
});

test('register validates input', async () => {
  const res = await call('POST', '/api/auth/register', { body: { name: '', email: 'nope', password: 'short' } });
  assert.equal(res.status, 400);
  assert.equal(res.body.details.length, 3);
});

test('register rejects a duplicate email, ignoring case', async () => {
  const { user } = await newUser();
  const res = await call('POST', '/api/auth/register', {
    body: { name: 'Again', email: user.email.toUpperCase(), password: 'password123' },
  });
  assert.equal(res.status, 409);
});

test('register never returns the password hash', async () => {
  const { user } = await newUser();
  assert.deepEqual(Object.keys(user).sort(), ['email', 'id', 'name']);
});

test('login works and rejects a wrong password', async () => {
  const { user } = await newUser();
  const ok = await call('POST', '/api/auth/login', { body: { email: user.email, password: 'password123' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  const bad = await call('POST', '/api/auth/login', { body: { email: user.email, password: 'wrong-password' } });
  assert.equal(bad.status, 401);
  const unknown = await call('POST', '/api/auth/login', { body: { email: 'ghost@example.com', password: 'password123' } });
  assert.equal(unknown.status, 401);
});

test('protected routes require a valid token', async () => {
  assert.equal((await call('GET', '/api/projects')).status, 401);
  assert.equal((await call('GET', '/api/projects', { token: 'garbage' })).status, 401);
  const { token } = await newUser();
  const tampered = token.slice(0, -2) + (token.endsWith('aa') ? 'bb' : 'aa');
  assert.equal((await call('GET', '/api/projects', { token: tampered })).status, 401);
  assert.equal((await call('GET', '/api/auth/me', { token })).status, 200);
});

test('token helpers', () => {
  assert.equal(verifyToken(createToken(7)).sub, 7);
  assert.equal(verifyToken(null), null);
  assert.equal(verifyToken('a.b'), null);
});

test('project CRUD', async () => {
  const { token } = await newUser();
  const created = await call('POST', '/api/projects', { token, body: { name: '  Website  ' } });
  assert.equal(created.status, 201);
  assert.equal(created.body.project.name, 'Website');
  const id = created.body.project.id;

  const renamed = await call('PUT', `/api/projects/${id}`, { token, body: { name: 'Website v2' } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.project.name, 'Website v2');

  assert.equal((await call('POST', '/api/projects', { token, body: {} })).status, 400);
  assert.equal((await call('PUT', `/api/projects/${id}`, { token, body: { name: 5 } })).status, 400);

  assert.equal((await call('DELETE', `/api/projects/${id}`, { token })).status, 204);
  assert.equal((await call('DELETE', `/api/projects/${id}`, { token })).status, 404);
  assert.equal((await call('GET', '/api/projects/abc/tasks', { token })).status, 404);
});

test('task CRUD, filtering and joined counts', async () => {
  const { token } = await newUser();
  const pid = (await call('POST', '/api/projects', { token, body: { name: 'P' } })).body.project.id;
  const url = `/api/projects/${pid}/tasks`;

  const a = await call('POST', url, { token, body: { title: 'First', due_date: '2030-01-15' } });
  assert.equal(a.status, 201);
  assert.equal(a.body.task.status, 'todo');
  assert.equal(a.body.task.due_date, '2030-01-15');
  await call('POST', url, { token, body: { title: 'Second' } });

  const done = await call('PATCH', `${url}/${a.body.task.id}`, { token, body: { status: 'done' } });
  assert.equal(done.status, 200);
  assert.equal(done.body.task.status, 'done');
  assert.equal(done.body.task.title, 'First');

  const cleared = await call('PATCH', `${url}/${a.body.task.id}`, { token, body: { due_date: null } });
  assert.equal(cleared.body.task.due_date, null);

  assert.equal((await call('GET', url, { token })).body.tasks.length, 2);
  const filtered = await call('GET', `${url}?status=done`, { token });
  assert.deepEqual(filtered.body.tasks.map((t) => t.title), ['First']);
  assert.equal((await call('GET', `${url}?status=bogus`, { token })).status, 400);

  const list = await call('GET', '/api/projects', { token });
  assert.equal(list.body.projects[0].task_count, 2);
  assert.equal(list.body.projects[0].done_count, 1);

  assert.equal((await call('DELETE', `${url}/${a.body.task.id}`, { token })).status, 204);
  assert.equal((await call('PATCH', `${url}/${a.body.task.id}`, { token, body: { status: 'todo' } })).status, 404);
});

test('task validation', async () => {
  const { token } = await newUser();
  const pid = (await call('POST', '/api/projects', { token, body: { name: 'P' } })).body.project.id;
  const url = `/api/projects/${pid}/tasks`;
  assert.equal((await call('POST', url, { token, body: { title: '   ' } })).status, 400);
  assert.equal((await call('POST', url, { token, body: { title: 'x', status: 'later' } })).status, 400);
  assert.equal((await call('POST', url, { token, body: { title: 'x', due_date: '15/01/2030' } })).status, 400);
  assert.equal((await call('POST', url, { token, body: { title: 'x'.repeat(201) } })).status, 400);
  const t = (await call('POST', url, { token, body: { title: 'ok' } })).body.task;
  assert.equal((await call('PATCH', `${url}/${t.id}`, { token, body: {} })).status, 400);
  assert.equal((await call('PATCH', `${url}/${t.id}`, { token, body: { title: '' } })).status, 400);
});

test("users cannot see or change each other's data", async () => {
  const alice = await newUser();
  const bob = await newUser();
  const pid = (await call('POST', '/api/projects', { token: alice.token, body: { name: 'Private' } })).body.project.id;
  const tid = (await call('POST', `/api/projects/${pid}/tasks`, { token: alice.token, body: { title: 'Secret' } })).body.task.id;

  assert.deepEqual((await call('GET', '/api/projects', { token: bob.token })).body.projects, []);
  assert.equal((await call('GET', `/api/projects/${pid}/tasks`, { token: bob.token })).status, 404);
  assert.equal((await call('PUT', `/api/projects/${pid}`, { token: bob.token, body: { name: 'Mine' } })).status, 404);
  assert.equal((await call('DELETE', `/api/projects/${pid}/tasks/${tid}`, { token: bob.token })).status, 404);
  assert.equal((await call('DELETE', `/api/projects/${pid}`, { token: bob.token })).status, 404);
});

test('deleting a project deletes its tasks (foreign key cascade)', async () => {
  const { token } = await newUser();
  const pid = (await call('POST', '/api/projects', { token, body: { name: 'Temp' } })).body.project.id;
  const tid = (await call('POST', `/api/projects/${pid}/tasks`, { token, body: { title: 'Gone' } })).body.task.id;
  await call('DELETE', `/api/projects/${pid}`, { token });
  const pid2 = (await call('POST', '/api/projects', { token, body: { name: 'Other' } })).body.project.id;
  assert.equal((await call('DELETE', `/api/projects/${pid2}/tasks/${tid}`, { token })).status, 404);
});

test('bad JSON, non-object bodies and unknown routes return JSON errors', async () => {
  const bad = await call('POST', '/api/auth/login', { raw: '{not json' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /JSON/);
  assert.equal((await call('POST', '/api/auth/login', { raw: '[1,2]' })).status, 400);
  const missing = await call('GET', '/api/nothing-here');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'Not found');
});
