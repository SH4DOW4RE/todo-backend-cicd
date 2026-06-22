const { HttpError } = require('./errors');

const TODO_STATUSES = ['pending', 'in_progress', 'completed', 'blocked'];

function objectBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Request body must be a JSON object');
  return body;
}

function rejectUnknown(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new HttpError(400, `Unknown field(s): ${unknown.join(', ')}`);
}

function text(value, field, { min = 1, max, optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`);
  const result = value.trim();
  if (result.length < min) throw new HttpError(400, `${field} must contain at least ${min} character(s)`);
  if (max && result.length > max) throw new HttpError(400, `${field} must contain at most ${max} characters`);
  return result;
}

function boolean(value, field, optional = false) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'boolean') throw new HttpError(400, `${field} must be a boolean`);
  return value;
}

function idArray(value, field, optional = false) {
  if (value === undefined && optional) return undefined;
  if (!Array.isArray(value)) throw new HttpError(400, `${field} must be an array`);
  const ids = value.map((item) => Number(item));
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new HttpError(400, `${field} must contain positive integer IDs`);
  return [...new Set(ids)];
}

function tags(value, optional = false) {
  if (value === undefined && optional) return undefined;
  if (!Array.isArray(value)) throw new HttpError(400, 'tags must be an array');
  const result = value.map((tag) => text(tag, 'Each tag', { max: 64 }).toLowerCase());
  return [...new Set(result)];
}

function parseId(value, field = 'id') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, `${field} must be a positive integer`);
  return id;
}

function nullableId(value, field, optional = false) {
  if (value === undefined && optional) return undefined;
  if (value === null) return null;
  return parseId(value, field);
}

module.exports = { TODO_STATUSES, objectBody, rejectUnknown, text, boolean, idArray, tags, parseId, nullableId };
