const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildArticleDocument,
  importSubstackPost,
  normalizeArticleContent,
  updateArchive,
  updateHomepage,
  validatePost
} = require('../server/posts');
const { createSession, hasValidSession } = require('../server/auth');
const authHandler = require('../api/editor-auth');
const importHandler = require('../api/editor-import');

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body = '') {
      this.body = body;
    }
  };
}

test('normalizes Substack markup and removes executable or subscription content', () => {
  const content = normalizeArticleContent(`
    <div class="captioned-image-container">
      <figure><picture><img src="https://example.com/photo.jpg" width="1200" height="800"></picture><figcaption>A useful caption.</figcaption></figure>
    </div>
    <h2>A section</h2>
    <p>Hello <a href="https://example.com" onclick="bad()">world</a>.</p>
    <script>alert('bad')</script>
    <div class="subscription-widget-wrap-editor"><form><input></form></div>
  `);

  assert.match(content, /<figure class="post-figure">/);
  assert.match(content, /loading="lazy"/);
  assert.match(content, /<h2 id="a-section">A section<\/h2>/);
  assert.match(content, /target="_blank" rel="noopener"/);
  assert.doesNotMatch(content, /script|onclick|subscription-widget|form|input/);
});

test('imports a matching post from the Substack feed', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => new Response(`<?xml version="1.0"?>
    <rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item>
      <title><![CDATA[A clear title]]></title>
      <description><![CDATA[A concise summary.]]></description>
      <link>https://nemath.substack.com/p/a-clear-title</link>
      <pubDate>Sat, 01 Aug 2026 12:00:00 GMT</pubDate>
      <content:encoded><![CDATA[<p>This is enough article content to pass through the importer without being shortened.</p>]]></content:encoded>
    </item></channel></rss>`, { status: 200 });

  try {
    const post = await importSubstackPost('https://nemath.substack.com/p/a-clear-title?utm_source=test');
    assert.equal(post.title, 'A clear title');
    assert.equal(post.slug, 'a-clear-title');
    assert.equal(post.date, '2026-08-01');
    assert.match(post.content, /enough article content/);
  } finally {
    global.fetch = previousFetch;
  }
});

test('inserts new posts into the homepage and existing archive year once', () => {
  const post = {
    title: 'A clear title',
    slug: 'clear',
    date: '2026-08-01',
    featureOnHome: true
  };
  const homepage = `<ol><!-- editor-posts:start --><!-- editor-posts:end --></ol>`;
  const archive = `<ul><!-- editor-posts:start --><li class="post-year"><h2>2026</h2></li><!-- editor-posts:end --></ul>`;

  const nextHomepage = updateHomepage(homepage, post);
  const nextArchive = updateArchive(archive, post);
  assert.match(nextHomepage, /href="\/clear\/"/);
  assert.match(nextHomepage, /Aug 2026/);
  assert.match(nextArchive, /href="\/clear\/"/);

  const editedPost = { ...post, title: 'A better title', date: '2026-09-02' };
  const editedHomepage = updateHomepage(nextHomepage, editedPost);
  const editedArchive = updateArchive(nextArchive, editedPost);
  assert.match(editedHomepage, /A better title/);
  assert.match(editedHomepage, /Sep 2026/);
  assert.match(editedArchive, /A better title/);
  assert.match(editedArchive, /2026-09/);
  assert.doesNotMatch(updateHomepage(editedHomepage, { ...editedPost, featureOnHome: false }), /href="\/clear\/"/);
});

test('validates, sanitizes, and renders an article document', () => {
  const post = validatePost({
    title: 'A clear title',
    summary: 'A concise summary for the article.',
    slug: 'a-clear-title',
    date: '2026-08-01',
    content: '<h2>Start here</h2><p>This article has enough useful words to satisfy the minimum body length for publishing.</p>',
    featureOnHome: true
  });
  const document = buildArticleDocument(post);

  assert.match(document, /<link rel="canonical" href="https:\/\/nemathahmed.com\/a-clear-title\/">/);
  assert.match(document, /<h1 class="posttitle p-name"[^>]*>A clear title<\/h1>/);
  assert.match(document, /<h2 id="start-here">Start here<\/h2>/);
  assert.match(document, />1 min read</);
});

test('accepts only untampered, unexpired editor sessions', () => {
  const previousSecret = process.env.EDITOR_SESSION_SECRET;
  process.env.EDITOR_SESSION_SECRET = 'test-session-secret';

  try {
    const session = createSession(process.env.EDITOR_SESSION_SECRET);
    assert.equal(hasValidSession({ headers: { cookie: `nemath_editor=${session}` } }), true);
    assert.equal(hasValidSession({ headers: { cookie: `nemath_editor=${session}x` } }), false);
  } finally {
    if (previousSecret === undefined) delete process.env.EDITOR_SESSION_SECRET;
    else process.env.EDITOR_SESSION_SECRET = previousSecret;
  }
});

test('auth endpoint creates a secure cookie and protected APIs reject anonymous requests', async () => {
  const previous = {
    password: process.env.EDITOR_PASSWORD,
    secret: process.env.EDITOR_SESSION_SECRET,
    vercel: process.env.VERCEL
  };
  process.env.EDITOR_PASSWORD = 'local-test-password';
  process.env.EDITOR_SESSION_SECRET = 'local-test-session-secret';
  process.env.VERCEL = '1';

  try {
    const loginResponse = responseRecorder();
    await authHandler({
      method: 'POST',
      headers: { host: 'nemathahmed.com', origin: 'https://nemathahmed.com' },
      body: { action: 'login', password: 'local-test-password' }
    }, loginResponse);

    assert.equal(loginResponse.statusCode, 200);
    assert.match(loginResponse.headers['set-cookie'], /^nemath_editor=/);
    assert.match(loginResponse.headers['set-cookie'], /HttpOnly/);
    assert.match(loginResponse.headers['set-cookie'], /Secure/);
    assert.match(loginResponse.headers['set-cookie'], /SameSite=Strict/);

    const anonymousResponse = responseRecorder();
    await importHandler({ method: 'POST', headers: {}, body: {} }, anonymousResponse);
    assert.equal(anonymousResponse.statusCode, 401);
  } finally {
    if (previous.password === undefined) delete process.env.EDITOR_PASSWORD;
    else process.env.EDITOR_PASSWORD = previous.password;
    if (previous.secret === undefined) delete process.env.EDITOR_SESSION_SECRET;
    else process.env.EDITOR_SESSION_SECRET = previous.secret;
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
  }
});
