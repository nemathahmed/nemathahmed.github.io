const {
  createSession,
  hasValidSession,
  readJson,
  safeEqual,
  sendJson,
  sessionCookie,
  verifyOrigin
} = require('../server/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    if (!hasValidSession(req)) {
      sendJson(res, 401, { authenticated: false });
      return;
    }

    sendJson(res, 200, { authenticated: true });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!verifyOrigin(req)) {
    sendJson(res, 403, { error: 'Request origin was rejected.' });
    return;
  }

  let body;
  try {
    body = await readJson(req, 10_000);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { error: 'Invalid request.' });
    return;
  }

  if (body.action === 'logout') {
    res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
    sendJson(res, 200, { authenticated: false });
    return;
  }

  const password = process.env.EDITOR_PASSWORD;
  const secret = process.env.EDITOR_SESSION_SECRET;
  if (!password || !secret) {
    sendJson(res, 503, { error: 'Editor authentication is not configured.' });
    return;
  }

  if (!safeEqual(body.password || '', password)) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    sendJson(res, 401, { error: 'Incorrect password.' });
    return;
  }

  res.setHeader('Set-Cookie', sessionCookie(req, createSession(secret)));
  sendJson(res, 200, { authenticated: true });
};
