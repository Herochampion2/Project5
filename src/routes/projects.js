const express = require('express');
const v = require('../validate');

module.exports = function projectRoutes(db) {
  const router = express.Router();

  // Loads a project owned by the current user or throws 404.
  function ownProject(req) {
    const project = db
      .prepare('SELECT id, name, created_at FROM projects WHERE id = ? AND user_id = ?')
      .get(v.idParam(req.params.projectId), req.user.id);
    if (!project) throw new v.HttpError(404, 'Project not found');
    return project;
  }

  // List projects with task counts (LEFT JOIN + GROUP BY).
  router.get('/', (req, res) => {
    const projects = db
      .prepare(
        `SELECT p.id, p.name, p.created_at,
                COUNT(t.id) AS task_count,
                COALESCE(SUM(t.status = 'done'), 0) AS done_count
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
         WHERE p.user_id = ?
         GROUP BY p.id
         ORDER BY p.id DESC`
      )
      .all(req.user.id);
    res.json({ projects });
  });

  router.post('/', (req, res) => {
    v.check([v.text(req.body.name, 'name', { max: 80 })]);
    const name = req.body.name.trim();
    const result = db.prepare('INSERT INTO projects (user_id, name) VALUES (?, ?)').run(req.user.id, name);
    const project = db
      .prepare('SELECT id, name, created_at FROM projects WHERE id = ?')
      .get(Number(result.lastInsertRowid));
    res.status(201).json({ project: { ...project, task_count: 0, done_count: 0 } });
  });

  router.put('/:projectId', (req, res) => {
    const project = ownProject(req);
    v.check([v.text(req.body.name, 'name', { max: 80 })]);
    const name = req.body.name.trim();
    db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, project.id);
    res.json({ project: { ...project, name } });
  });

  router.delete('/:projectId', (req, res) => {
    const project = ownProject(req);
    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
    res.status(204).end();
  });

  // ---- Tasks, nested under a project ----

  router.get('/:projectId/tasks', (req, res) => {
    const project = ownProject(req);
    const filter = req.query.status;
    if (filter !== undefined) v.check([v.status(filter)]);
    const sql = `SELECT id, project_id, title, status, due_date, created_at FROM tasks
                 WHERE project_id = ? ${filter ? 'AND status = ?' : ''} ORDER BY id DESC`;
    const tasks = filter ? db.prepare(sql).all(project.id, filter) : db.prepare(sql).all(project.id);
    res.json({ tasks });
  });

  router.post('/:projectId/tasks', (req, res) => {
    const project = ownProject(req);
    const { title, status = 'todo', due_date = null } = req.body;
    v.check([v.text(title, 'title'), v.status(status), v.dueDate(due_date)]);
    const result = db
      .prepare('INSERT INTO tasks (project_id, title, status, due_date) VALUES (?, ?, ?, ?)')
      .run(project.id, title.trim(), status, due_date || null);
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(Number(result.lastInsertRowid));
    res.status(201).json({ task });
  });

  function ownTask(req, project) {
    const task = db
      .prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?')
      .get(v.idParam(req.params.taskId), project.id);
    if (!task) throw new v.HttpError(404, 'Task not found');
    return task;
  }

  // Partial update: only the fields sent are changed.
  router.patch('/:projectId/tasks/:taskId', (req, res) => {
    const task = ownTask(req, ownProject(req));
    const { title, status, due_date } = req.body;
    if (title === undefined && status === undefined && due_date === undefined) {
      throw new v.HttpError(400, 'Validation failed', ['send at least one of: title, status, due_date']);
    }
    v.check([
      title !== undefined && v.text(title, 'title'),
      status !== undefined && v.status(status),
      due_date !== undefined && v.dueDate(due_date),
    ]);
    const next = {
      title: title !== undefined ? title.trim() : task.title,
      status: status !== undefined ? status : task.status,
      due_date: due_date !== undefined ? due_date || null : task.due_date,
    };
    db.prepare('UPDATE tasks SET title = ?, status = ?, due_date = ? WHERE id = ?').run(
      next.title, next.status, next.due_date, task.id
    );
    res.json({ task: { ...task, ...next } });
  });

  router.delete('/:projectId/tasks/:taskId', (req, res) => {
    const task = ownTask(req, ownProject(req));
    db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
    res.status(204).end();
  });

  return router;
};
