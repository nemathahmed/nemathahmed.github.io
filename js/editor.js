(() => {
  if (window.location.hostname.endsWith('github.io')) {
    window.location.replace('https://nemathahmed.com/edit/');
    return;
  }

  const elements = {
    loginView: document.querySelector('#login-view'),
    loginForm: document.querySelector('#login-form'),
    loginStatus: document.querySelector('#login-status'),
    password: document.querySelector('#password'),
    workspace: document.querySelector('#workspace'),
    logoutButton: document.querySelector('#logout-button'),
    importForm: document.querySelector('#import-form'),
    importStatus: document.querySelector('#import-status'),
    substackUrl: document.querySelector('#substack-url'),
    postForm: document.querySelector('#post-form'),
    title: document.querySelector('#post-title'),
    summary: document.querySelector('#post-summary'),
    slug: document.querySelector('#post-slug'),
    date: document.querySelector('#post-date'),
    content: document.querySelector('#post-content'),
    featureHome: document.querySelector('#feature-home'),
    overwrite: document.querySelector('#overwrite-post'),
    previewButton: document.querySelector('#preview-button'),
    publishButton: document.querySelector('#publish-button'),
    publishStatus: document.querySelector('#publish-status'),
    previewDialog: document.querySelector('#preview-dialog'),
    previewTitle: document.querySelector('#preview-title'),
    previewSummary: document.querySelector('#preview-summary'),
    previewContent: document.querySelector('#preview-content'),
    closePreview: document.querySelector('#close-preview'),
    linkButton: document.querySelector('#link-button')
  };

  let slugWasEdited = false;

  function setStatus(element, message = '', tone = '') {
    element.textContent = message;
    if (tone) element.dataset.tone = tone;
    else delete element.dataset.tone;
  }

  function setBusy(button, busy) {
    button.disabled = busy;
    button.setAttribute('aria-busy', String(busy));
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(payload.error || `Request failed with ${response.status}.`);
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function showWorkspace(authenticated) {
    elements.loginView.hidden = authenticated;
    elements.workspace.hidden = !authenticated;
    elements.logoutButton.hidden = !authenticated;
    if (authenticated) elements.title.focus();
    else elements.password.focus();
  }

  function slugify(value) {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function cleanClientHtml(input) {
    const allowedTags = new Set([
      'P', 'H2', 'H3', 'H4', 'STRONG', 'B', 'EM', 'I', 'A', 'BLOCKQUOTE',
      'UL', 'OL', 'LI', 'FIGURE', 'FIGCAPTION', 'IMG', 'HR', 'BR', 'CODE', 'PRE'
    ]);
    const template = document.createElement('template');
    template.innerHTML = input;

    [...template.content.querySelectorAll('*')].reverse().forEach((node) => {
      if (!allowedTags.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
      }

      [...node.attributes].forEach((attribute) => {
        const allowed = (
          (node.tagName === 'A' && ['href', 'target', 'rel'].includes(attribute.name)) ||
          (node.tagName === 'IMG' && ['src', 'alt', 'width', 'height', 'loading'].includes(attribute.name)) ||
          (['H2', 'H3', 'H4'].includes(node.tagName) && attribute.name === 'id') ||
          (node.tagName === 'FIGURE' && attribute.name === 'class')
        );
        if (!allowed) node.removeAttribute(attribute.name);
      });

      if (node.tagName === 'A') {
        const href = node.getAttribute('href') || '';
        if (/^javascript:/i.test(href)) node.removeAttribute('href');
      }

      if (node.tagName === 'IMG') {
        const src = node.getAttribute('src') || '';
        if (!/^https?:\/\//i.test(src) && !src.startsWith('/')) node.remove();
        else node.setAttribute('loading', 'lazy');
      }
    });

    return template.innerHTML.trim();
  }

  function postPayload() {
    return {
      title: elements.title.value.trim(),
      summary: elements.summary.value.trim(),
      slug: elements.slug.value.trim(),
      date: elements.date.value,
      content: cleanClientHtml(elements.content.innerHTML),
      featureOnHome: elements.featureHome.checked,
      overwrite: elements.overwrite.checked
    };
  }

  function fillPost(post) {
    elements.title.value = post.title || '';
    elements.summary.value = post.summary || '';
    elements.slug.value = post.slug || slugify(post.title || '');
    elements.date.value = post.date || new Date().toISOString().slice(0, 10);
    elements.content.innerHTML = post.content || '';
    slugWasEdited = Boolean(post.slug);
  }

  elements.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = elements.loginForm.querySelector('button[type="submit"]');
    setBusy(button, true);
    setStatus(elements.loginStatus);

    try {
      await request('/api/editor-auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'login', password: elements.password.value })
      });
      elements.password.value = '';
      showWorkspace(true);
    } catch (error) {
      setStatus(elements.loginStatus, error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  elements.logoutButton.addEventListener('click', async () => {
    try {
      await request('/api/editor-auth', {
        method: 'POST',
        body: JSON.stringify({ action: 'logout' })
      });
    } finally {
      showWorkspace(false);
    }
  });

  elements.importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = elements.importForm.querySelector('button[type="submit"]');
    setBusy(button, true);
    setStatus(elements.importStatus, 'Importing...');

    try {
      const { post } = await request('/api/editor-import', {
        method: 'POST',
        body: JSON.stringify({ url: elements.substackUrl.value.trim() })
      });
      fillPost(post);
      setStatus(elements.importStatus, 'Imported. Review the article before publishing.', 'success');
      elements.title.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      setStatus(elements.importStatus, error.message, 'error');
    } finally {
      setBusy(button, false);
    }
  });

  elements.title.addEventListener('input', () => {
    if (!slugWasEdited) elements.slug.value = slugify(elements.title.value);
  });

  elements.slug.addEventListener('input', () => {
    slugWasEdited = true;
    elements.slug.value = slugify(elements.slug.value);
  });

  document.querySelectorAll('[data-command]').forEach((button) => {
    button.addEventListener('click', () => {
      elements.content.focus();
      document.execCommand(button.dataset.command, false);
    });
  });

  document.querySelectorAll('[data-block]').forEach((button) => {
    button.addEventListener('click', () => {
      elements.content.focus();
      document.execCommand('formatBlock', false, button.dataset.block);
    });
  });

  elements.linkButton.addEventListener('click', () => {
    const url = window.prompt('Link URL');
    if (!url) return;
    elements.content.focus();
    document.execCommand('createLink', false, url);
  });

  elements.content.addEventListener('paste', (event) => {
    const html = event.clipboardData.getData('text/html');
    if (!html) return;
    event.preventDefault();
    document.execCommand('insertHTML', false, cleanClientHtml(html));
  });

  elements.previewButton.addEventListener('click', () => {
    const post = postPayload();
    elements.previewTitle.textContent = post.title || 'Untitled';
    elements.previewSummary.textContent = post.summary;
    elements.previewContent.innerHTML = post.content;
    elements.previewDialog.showModal();
  });

  elements.closePreview.addEventListener('click', () => elements.previewDialog.close());
  elements.previewDialog.addEventListener('click', (event) => {
    if (event.target === elements.previewDialog) elements.previewDialog.close();
  });

  elements.postForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!elements.postForm.reportValidity()) return;

    const payload = postPayload();
    if (!payload.content) {
      setStatus(elements.publishStatus, 'Add the article body before publishing.', 'error');
      elements.content.focus();
      return;
    }

    if (!window.confirm(`Publish "${payload.title}" to /${payload.slug}/?`)) return;

    setBusy(elements.publishButton, true);
    setBusy(elements.previewButton, true);
    setStatus(elements.publishStatus, 'Publishing to GitHub...');

    try {
      const result = await request('/api/editor-publish', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      elements.publishStatus.textContent = '';
      elements.publishStatus.dataset.tone = 'success';
      const message = document.createTextNode('Published. ');
      const link = document.createElement('a');
      link.href = result.siteUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open article';
      elements.publishStatus.append(message, link);
      elements.overwrite.checked = true;
    } catch (error) {
      if (error.status === 401) showWorkspace(false);
      setStatus(elements.publishStatus, error.message, 'error');
    } finally {
      setBusy(elements.publishButton, false);
      setBusy(elements.previewButton, false);
    }
  });

  elements.date.value = new Date().toISOString().slice(0, 10);

  request('/api/editor-auth')
    .then(() => showWorkspace(true))
    .catch(() => showWorkspace(false));
})();
