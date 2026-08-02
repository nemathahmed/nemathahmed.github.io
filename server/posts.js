const cheerio = require('cheerio');

const SUBSTACK_HOST = 'nemath.substack.com';
const HOME_MARKER = '<!-- editor-posts:start -->';
const ARCHIVE_MARKER = '<!-- editor-posts:start -->';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeSubstackUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid Substack post URL.');
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== SUBSTACK_HOST) {
    throw new Error(`Use a post URL from ${SUBSTACK_HOST}.`);
  }

  const match = url.pathname.match(/^\/p\/([a-z0-9-]+)/i);
  if (!match) throw new Error('Enter a published Substack post URL.');
  return `https://${SUBSTACK_HOST}/p/${match[1]}`;
}

function imageMarkup($, image, caption = '') {
  const source = image.attr('src');
  if (!source) return '';

  const attributes = [
    `src="${escapeAttribute(source)}"`,
    `alt="${escapeAttribute(image.attr('alt') || caption)}"`,
    'loading="lazy"'
  ];

  const width = image.attr('width');
  const height = image.attr('height');
  if (/^\d+$/.test(width || '')) attributes.push(`width="${width}"`);
  if (/^\d+$/.test(height || '')) attributes.push(`height="${height}"`);

  return `<figure class="post-figure"><img ${attributes.join(' ')}>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
}

const allowedTags = new Set([
  'p', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'a', 'blockquote',
  'ul', 'ol', 'li', 'figure', 'figcaption', 'img', 'hr', 'br', 'code', 'pre'
]);

const allowedAttributes = {
  a: new Set(['href', 'target', 'rel']),
  h2: new Set(['id']),
  h3: new Set(['id']),
  h4: new Set(['id']),
  figure: new Set(['class']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading'])
};

function safeLink(value) {
  const href = String(value || '').trim();
  if (href.startsWith('/') || href.startsWith('#')) return href;

  try {
    const url = new URL(href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? href : '';
  } catch {
    return '';
  }
}

function safeImage(value) {
  const source = String(value || '').trim();
  if (source.startsWith('/')) return source;

  try {
    const url = new URL(source);
    return ['http:', 'https:'].includes(url.protocol) ? source : '';
  } catch {
    return '';
  }
}

function sanitizeDom($, root) {
  root.find('*').toArray().reverse().forEach((element) => {
    const node = $(element);
    const tag = element.tagName.toLowerCase();

    if (!allowedTags.has(tag)) {
      node.replaceWith(node.contents());
      return;
    }

    const tagAttributes = allowedAttributes[tag] || new Set();
    Object.keys(element.attribs || {}).forEach((attribute) => {
      if (!tagAttributes.has(attribute)) node.removeAttr(attribute);
    });

    if (tag === 'a') {
      const href = safeLink(node.attr('href'));
      if (!href) {
        node.removeAttr('href');
        node.removeAttr('target');
        node.removeAttr('rel');
      } else {
        node.attr('href', href);
        if (/^https?:\/\//i.test(href)) {
          node.attr('target', '_blank');
          node.attr('rel', 'noopener');
        } else {
          node.removeAttr('target');
          node.removeAttr('rel');
        }
      }
    }

    if (tag === 'img') {
      const source = safeImage(node.attr('src'));
      if (!source) {
        node.remove();
        return;
      }

      node.attr('src', source);
      node.attr('alt', node.attr('alt') || '');
      node.attr('loading', 'lazy');
      ['width', 'height'].forEach((dimension) => {
        if (!/^\d+$/.test(node.attr(dimension) || '')) node.removeAttr(dimension);
      });
    }

    if (tag === 'figure') node.attr('class', 'post-figure');
  });
}

function normalizeArticleContent(input) {
  const $ = cheerio.load(`<main id="article-root">${input || ''}</main>`, {
    decodeEntities: false
  }, false);
  const root = $('#article-root');

  root.find('script, style, iframe, object, embed, form, input, button, svg, .subscription-widget-wrap-editor, .subscription-widget, .image-link-expand').remove();

  root.find('.captioned-image-container').each((index, element) => {
    const container = $(element);
    const image = container.find('img').first();
    const caption = container.find('figcaption').first().text().trim();
    container.replaceWith(imageMarkup($, image, caption));
  });

  root.find('picture').each((index, element) => {
    const image = $(element).find('img').first();
    $(element).replaceWith(image);
  });

  root.find('div').each((index, element) => {
    $(element).replaceWith($(element).contents());
  });

  const usedIds = new Set();

  sanitizeDom($, root);

  root.find('h2, h3, h4').each((index, element) => {
    const heading = $(element);
    const base = slugify(heading.text()) || `section-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}-${suffix++}`;
    usedIds.add(id);
    heading.attr('id', id);
  });

  root.find('p').each((index, element) => {
    const paragraph = $(element);
    if (!paragraph.text().trim() && paragraph.find('img, br').length === 0) paragraph.remove();
  });

  return (root.html() || '').trim();
}

function textFromHtml(html) {
  return cheerio.load(html || '').text().replace(/\s+/g, ' ').trim();
}

function readingMinutes(html) {
  const words = textFromHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

async function importSubstackPost(value) {
  const canonicalUrl = normalizeSubstackUrl(value);
  const response = await fetch(`https://${SUBSTACK_HOST}/feed`, {
    headers: { 'User-Agent': 'nemathahmed-site-editor/1.0' }
  });

  if (!response.ok) throw new Error('Substack could not be reached. Try pasting the article instead.');

  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: false });
  let imported = null;

  $('item').each((index, element) => {
    if (imported) return;

    const item = $(element);
    const link = item.children('link').first().text().trim().replace(/\/$/, '');
    if (link !== canonicalUrl) return;

    const encoded = item.children().filter((childIndex, child) => child.name === 'content:encoded').first().text();
    const published = new Date(item.children('pubDate').first().text());
    imported = {
      title: item.children('title').first().text().trim(),
      summary: item.children('description').first().text().trim(),
      slug: canonicalUrl.split('/').pop(),
      date: Number.isNaN(published.getTime()) ? new Date().toISOString().slice(0, 10) : published.toISOString().slice(0, 10),
      content: normalizeArticleContent(encoded),
      sourceUrl: canonicalUrl
    };
  });

  if (!imported) {
    const error = new Error('That post is not in the current Substack feed. Paste its contents into the editor instead.');
    error.statusCode = 404;
    throw error;
  }

  return imported;
}

function firstImage(html) {
  const source = cheerio.load(html || '')('img').first().attr('src');
  return source || 'https://nemathahmed.com/photos/eyeem-172895690.jpg';
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatMonth(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${date}T12:00:00Z`));
}

function buildArticleDocument(post) {
  const title = escapeHtml(post.title);
  const summary = escapeHtml(post.summary);
  const canonical = `https://nemathahmed.com/${post.slug}/`;
  const image = firstImage(post.content);
  const minutes = readingMinutes(post.content);
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      '@type': 'Person',
      name: 'Nemath Ahmed',
      url: 'https://nemathahmed.com/about/'
    },
    image,
    mainEntityOfPage: canonical
  }, null, 2).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
  <meta name="description" content="${summary}">
  <link rel="canonical" href="${canonical}">

  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="Nemath Ahmed">
  <meta property="og:description" content="${summary}">
  <meta property="og:locale" content="en_US">
  <meta property="og:image" content="${escapeAttribute(image)}">
  <meta property="article:published_time" content="${post.date}">
  <meta property="article:author" content="Nemath Ahmed">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${summary}">
  <meta name="twitter:image" content="${escapeAttribute(image)}">

  <link rel="icon" type="image/svg+xml" href="/images/favicon.svg?v=20260506">
  <link rel="alternate icon" href="/images/favicon.ico?v=20260506">
  <link rel="apple-touch-icon" sizes="180x180" href="/images/apple-touch-icon.png?v=20260506">
  <link rel="manifest" href="/images/site.webmanifest?v=20260506">
  <meta name="theme-color" content="#ffffff">

  <title>${title} - Nemath Ahmed</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/read.css?v=20260801-reader-nav">

  <script type="application/ld+json">
${schema}
  </script>
</head>

<body class="article-page max-width mx-auto px3 ltr">
  <div class="read-progress"></div>
  <nav class="read-nav" aria-label="Primary">
    <a class="read-mark" href="/" aria-label="Nemath Ahmed home"><img src="/images/logo.png" alt="" width="32" height="32"></a>
  </nav>

  <main class="content index py4">
    <article class="post h-entry" itemscope itemtype="https://schema.org/BlogPosting">
      <header>
        <h1 class="posttitle p-name" itemprop="name headline">${title}</h1>
        <p class="post-deck">${summary}</p>
        <div class="meta">
          <span class="author p-author h-card" itemprop="author" itemscope itemtype="https://schema.org/Person">
            <span class="p-name" itemprop="name">Nemath Ahmed</span>
          </span>
          <time datetime="${post.date}" class="dt-published" itemprop="datePublished">${formatDate(post.date)}</time>
          <span>${minutes} min read</span>
        </div>
      </header>

      <div class="content e-content" itemprop="articleBody">
${post.content.split('\n').map((line) => `        ${line}`).join('\n')}
      </div>
    </article>
  </main>

  <footer class="read-outro">
    <div>Thanks for reading.</div>
    <div class="read-outro-links">
      <a href="/">back to home</a>
      <a href="/archives/">all writing</a>
      <a href="https://twitter.com/nemathahmed" target="_blank" rel="noopener">twitter</a>
      <button type="button" data-email-contact>email</button>
    </div>
  </footer>

  <script src="/js/read.js?v=20260801-recap" defer></script>
  <script src="/js/contact.js?v=20260801" defer></script>
</body>
</html>
`;
}

function findListItem(html, href) {
  const hrefIndex = html.indexOf(`href="${href}"`);
  if (hrefIndex === -1) return null;

  const start = html.lastIndexOf('<li', hrefIndex);
  const closingIndex = html.indexOf('</li>', hrefIndex);
  if (start === -1 || closingIndex === -1) return null;

  const end = closingIndex + '</li>'.length;
  return {
    start,
    end,
    value: html.slice(start, end)
  };
}

function updateListItem(html, item, post, datetime, displayDate) {
  let nextItem = item.value.replace(
    /(<a\b[^>]*>)[\s\S]*?(<\/a>)/,
    `$1${escapeHtml(post.title)}$2`
  );
  nextItem = nextItem.replace(
    /(<time\b[^>]*datetime=")[^"]*("[^>]*>)[\s\S]*?(<\/time>)/,
    `$1${datetime}$2${displayDate}$3`
  );

  return `${html.slice(0, item.start)}${nextItem}${html.slice(item.end)}`;
}

function updateHomepage(html, post) {
  const href = `/${post.slug}/`;
  const existingItem = findListItem(html, href);
  if (existingItem) {
    if (!post.featureOnHome) {
      return `${html.slice(0, existingItem.start)}${html.slice(existingItem.end)}`;
    }

    return updateListItem(
      html,
      existingItem,
      post,
      post.date.slice(0, 7),
      formatMonth(post.date)
    );
  }

  if (!post.featureOnHome) return html;
  if (!html.includes(HOME_MARKER)) throw new Error('Homepage publishing marker is missing.');

  const item = `
        <li>
          <a href="${href}">${escapeHtml(post.title)}</a>
          <time datetime="${post.date.slice(0, 7)}">${formatMonth(post.date)}</time>
        </li>`;

  return html.replace(HOME_MARKER, `${HOME_MARKER}${item}`);
}

function updateArchive(html, post) {
  const href = `/${post.slug}/`;
  const existingItem = findListItem(html, href);
  if (existingItem) {
    return updateListItem(
      html,
      existingItem,
      post,
      `${post.date}T12:00:00.000Z`,
      post.date.slice(0, 7)
    );
  }

  if (!html.includes(ARCHIVE_MARKER)) throw new Error('Archive publishing marker is missing.');

  const year = post.date.slice(0, 4);
  const month = post.date.slice(0, 7);
  const item = `

      <li class="post-item">
        <div class="meta">
          <time datetime="${post.date}T12:00:00.000Z" class="dt-published" itemprop="datePublished">${month}</time>
        </div>
        <span><a href="${href}">${escapeHtml(post.title)}</a></span>
      </li>`;
  const yearHeading = `<li class="post-year"><h2>${year}</h2></li>`;

  if (html.includes(yearHeading)) {
    return html.replace(yearHeading, `${yearHeading}${item}`);
  }

  return html.replace(ARCHIVE_MARKER, `${ARCHIVE_MARKER}\n        ${yearHeading}${item}`);
}

function validatePost(input) {
  const title = String(input.title || '').trim();
  const summary = String(input.summary || '').trim();
  const slug = slugify(input.slug || '');
  const date = String(input.date || '').trim();
  const content = normalizeArticleContent(input.content || '');

  if (!title || title.length > 160) throw new Error('Title must be between 1 and 160 characters.');
  if (!summary || summary.length > 300) throw new Error('Summary must be between 1 and 300 characters.');
  if (!slug || slug !== input.slug) throw new Error('Slug can contain lowercase letters, numbers, and hyphens only.');
  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error('Choose a valid publication date.');
  }
  if (textFromHtml(content).length < 40) throw new Error('The article body is too short.');

  return {
    title,
    summary,
    slug,
    date,
    content,
    featureOnHome: input.featureOnHome !== false,
    overwrite: input.overwrite === true
  };
}

module.exports = {
  buildArticleDocument,
  importSubstackPost,
  normalizeArticleContent,
  normalizeSubstackUrl,
  readingMinutes,
  slugify,
  updateArchive,
  updateHomepage,
  validatePost
};
