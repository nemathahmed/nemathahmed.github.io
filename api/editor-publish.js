const { requireSession, readJson, sendJson } = require('../server/auth');
const { commitFiles, getFile } = require('../server/github');
const {
  buildArticleDocument,
  updateArchive,
  updateHomepage,
  validatePost
} = require('../server/posts');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (!requireSession(req, res)) return;

  let post;
  try {
    post = validatePost(await readJson(req));
  } catch (error) {
    sendJson(res, error.statusCode || 400, { error: error.message || 'The article is invalid.' });
    return;
  }

  try {
    const articlePath = `${post.slug}/index.html`;
    const [homepage, archive, existingArticle] = await Promise.all([
      getFile('index.html'),
      getFile('archives/index.html'),
      getFile(articlePath)
    ]);

    if (!homepage || !archive) {
      throw new Error('The homepage or writing archive could not be loaded from GitHub.');
    }

    if (existingArticle && !post.overwrite) {
      sendJson(res, 409, {
        error: `/${post.slug}/ already exists. Enable overwrite to replace it.`
      });
      return;
    }

    const nextHomepage = updateHomepage(homepage, post);
    const nextArchive = updateArchive(archive, post);
    const files = [
      { path: articlePath, content: buildArticleDocument(post) }
    ];

    if (nextHomepage !== homepage) files.push({ path: 'index.html', content: nextHomepage });
    if (nextArchive !== archive) files.push({ path: 'archives/index.html', content: nextArchive });

    const commit = await commitFiles(
      files,
      `${existingArticle ? 'Update' : 'Publish'} ${post.title}`
    );

    const deployHook = process.env.EDITOR_VERCEL_DEPLOY_HOOK;
    if (deployHook) {
      fetch(deployHook, { method: 'POST' }).catch(() => {});
    }

    sendJson(res, 200, {
      published: true,
      siteUrl: `https://nemathahmed.com/${post.slug}/`,
      commit
    });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || 'Publishing failed.'
    });
  }
};
