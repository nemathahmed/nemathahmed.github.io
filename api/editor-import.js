const { requireSession, readJson, sendJson } = require('../server/auth');
const { importSubstackPost } = require('../server/posts');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!requireSession(req, res)) return;

  try {
    const body = await readJson(req, 20_000);
    const post = await importSubstackPost(body.url || '');
    sendJson(res, 200, { post });
  } catch (error) {
    sendJson(res, error.statusCode || 400, {
      error: error.message || 'The Substack post could not be imported.'
    });
  }
};
