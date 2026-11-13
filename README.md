# TaskFlow

A full-stack task tracker in plain JavaScript. Users register, create projects and track tasks as *to do*, *in progress* or *done*.

| Layer    | Technology |
|----------|------------|
| Backend  | Node.js, Express (REST API, JSON) |
| Database | SQLite (built-in `node:sqlite`), SQL migrations |
| Frontend | HTML, CSS, vanilla JavaScript (`fetch`, async/await) |
| Auth     | scrypt password hashing, HMAC-signed bearer tokens (`node:crypto`) |
| Tests    | Node's built-in test runner |

## Setup

Requires **Node.js 22.5 or newer**.

```bash
npm install
npm start          # http://localhost:3000
```

Other commands:

```bash
npm test           # run the API tests (uses an in-memory database)
npm run dev        # restart the server on file changes
npm run migrate    # apply database migrations without starting the server
```

The database file is created at `data/taskflow.db` on first start.

### Environment variables

| Variable       | Default               | Purpose |
|----------------|-----------------------|---------|
| `PORT`         | `3000`                | Port the server listens on |
| `DB_FILE`      | `data/taskflow.db`    | SQLite file path |
| `TOKEN_SECRET` | development value     | Secret for signing tokens. Required when `NODE_ENV=production` |

## Project structure

```
src/
  server.js              starts the HTTP server
  app.js                 builds the Express app, error handling
  db.js                  opens SQLite, runs migrations
  auth.js                password hashing and tokens
  validate.js            input validation helpers
  middleware/requireAuth.js
  routes/auth.js         register, login, current user
  routes/projects.js     projects and their tasks
public/                  frontend (index.html, style.css, app.js)
tests/api.test.js        API tests
```

## Database

```
users (id PK, name, email UNIQUE, password_hash, created_at)
projects (id PK, user_id FK -> users.id, name, created_at)
tasks (id PK, project_id FK -> projects.id, title, status, due_date, created_at)
```

Deleting a user or project cascades to its children. Applied migrations are recorded in a `migrations` table, so each runs once.

## API

All request and response bodies are JSON. Routes marked 🔒 need the header `Authorization: Bearer <token>`.

| Method | Path | Description | Success |
|--------|------|-------------|---------|
| GET    | `/api/health` | Health check | 200 |
| POST   | `/api/auth/register` | Body: `name`, `email`, `password` (8+ chars). Returns `token`, `user` | 201 |
| POST   | `/api/auth/login` | Body: `email`, `password`. Returns `token`, `user` | 200 |
| GET    | `/api/auth/me` 🔒 | Current user | 200 |
| GET    | `/api/projects` 🔒 | List projects with `task_count` and `done_count` | 200 |
| POST   | `/api/projects` 🔒 | Body: `name` | 201 |
| PUT    | `/api/projects/:id` 🔒 | Body: `name` | 200 |
| DELETE | `/api/projects/:id` 🔒 | Delete project and its tasks | 204 |
| GET    | `/api/projects/:id/tasks` 🔒 | List tasks. Optional `?status=todo\|in_progress\|done` | 200 |
| POST   | `/api/projects/:id/tasks` 🔒 | Body: `title`, optional `status`, `due_date` (`YYYY-MM-DD`) | 201 |
| PATCH  | `/api/projects/:id/tasks/:taskId` 🔒 | Body: any of `title`, `status`, `due_date` | 200 |
| DELETE | `/api/projects/:id/tasks/:taskId` 🔒 | Delete task | 204 |

Errors have the shape `{ "error": "message", "details": ["..."] }` (`details` only on validation errors).

| Status | Meaning |
|--------|---------|
| 400 | Invalid input or malformed JSON |
| 401 | Missing or invalid token, or wrong login |
| 404 | Not found, or owned by another user |
| 409 | Email already registered |

Example:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Asha","email":"asha@example.com","password":"password123"}'
```
