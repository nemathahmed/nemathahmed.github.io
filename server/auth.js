const crypto = require('node:crypto');

const COOKIE_NAME = 'nemath_editor';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createSession(secret) {
  const payload = Buffer.from(JSON.stringify({
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000
  })).toString('base64url');

  return `${payload}.${sign(payload, secret)}`;
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, pair) => {
    const separator = pair.indexOf('=');
    if (separator === -1) return cookies;

    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (key) cookies[key] = value;
    return cookies;
  }, {});
}

function hasValidSession(req) {
  const secret = process.env.EDITOR_SESSION_SECRET;
  if (!secret) return false;

  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return false;

  const separator = token.lastIndexOf('.');
  if (separator === -1) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqual(signature, sign(payload, secret))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(session.expiresAt) && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function sessionCookie(req, value, maxAge = SESSION_TTL_SECONDS) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const secure = process.env.VERCEL || forwardedProto === 'https';
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`
  ];

  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function verifyOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
    return new URL(origin).host.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

function applyApiHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

function sendJson(res, status, payload) {
  applyApiHeaders(res);
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

async function readJson(req, maxBytes = 1_500_000) {
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > maxBytes) {
    const error = new Error('Request is too large.');
    error.statusCode = 413;
    throw error;
  }

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    return JSON.parse(String(req.body));
  }

  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error('Request is too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) : {};
}

function requireSession(req, res) {
  if (!hasValidSession(req)) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return false;
  }

  if (!verifyOrigin(req)) {
    sendJson(res, 403, { error: 'Request origin was rejected.' });
    return false;
  }

  return true;
}

module.exports = {
  COOKIE_NAME,
  createSession,
  hasValidSession,
  readJson,
  requireSession,
  safeEqual,
  sendJson,
  sessionCookie,
  verifyOrigin
};
