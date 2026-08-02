const GITHUB_API = 'https://api.github.com';

function repositoryConfig() {
  const token = process.env.EDITOR_GITHUB_TOKEN;
  const repository = process.env.EDITOR_GITHUB_REPOSITORY || 'nemathahmed/nemathahmed.github.io';
  const branch = process.env.EDITOR_GITHUB_BRANCH || 'master';

  if (!token) {
    const error = new Error('GitHub publishing is not configured.');
    error.statusCode = 503;
    throw error;
  }

  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error('The configured GitHub repository is invalid.');
  }

  return { token, repository, branch };
}

async function githubRequest(path, options = {}) {
  const { token } = repositoryConfig();
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'nemathahmed-site-editor',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    }
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `GitHub request failed with ${response.status}.`);
    error.statusCode = response.status === 404 ? 404 : 502;
    throw error;
  }

  return payload;
}

async function getFile(path) {
  const { repository, branch } = repositoryConfig();
  try {
    const file = await githubRequest(`/repos/${repository}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
    return Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8');
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

async function commitFiles(files, message) {
  const { repository, branch } = repositoryConfig();
  const encodedBranch = encodeURIComponent(branch);
  const reference = await githubRequest(`/repos/${repository}/git/ref/heads/${encodedBranch}`);
  const parentSha = reference.object.sha;
  const parentCommit = await githubRequest(`/repos/${repository}/git/commits/${parentSha}`);

  const entries = await Promise.all(files.map(async ({ path, content }) => {
    const blob = await githubRequest(`/repos/${repository}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content, encoding: 'utf-8' })
    });

    return {
      path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    };
  }));

  const tree = await githubRequest(`/repos/${repository}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: parentCommit.tree.sha,
      tree: entries
    })
  });

  const commit = await githubRequest(`/repos/${repository}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: [parentSha]
    })
  });

  await githubRequest(`/repos/${repository}/git/refs/heads/${encodedBranch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false })
  });

  return {
    sha: commit.sha,
    url: `https://github.com/${repository}/commit/${commit.sha}`
  };
}

module.exports = {
  commitFiles,
  getFile
};
