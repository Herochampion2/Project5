// Small input validation helpers. Each returns an error message or null.
const STATUSES = ['todo', 'in_progress', 'done'];

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function text(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') return `${field} must be a string`;
  const len = value.trim().length;
  if (len < min) return min === 1 ? `${field} is required` : `${field} must be at least ${min} characters`;
  if (len > max) return `${field} must be at most ${max} characters`;
  return null;
}

function email(value) {
  if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) {
    return 'email must be a valid email address';
  }
  return null;
}

function status(value) {
  return STATUSES.includes(value) ? null : `status must be one of: ${STATUSES.join(', ')}`;
}

function dueDate(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    return 'due_date must be a date in YYYY-MM-DD format';
  }
  return null;
}

// Throws a 400 if any check failed.
function check(errors) {
  const details = errors.filter(Boolean);
  if (details.length) throw new HttpError(400, 'Validation failed', details);
}

function idParam(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, 'Not found');
  return id;
}

module.exports = { HttpError, STATUSES, text, email, status, dueDate, check, idParam };
