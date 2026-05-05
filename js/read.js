/* Reading page: scroll progress bar + subtle fade-in */
(() => {
  const bar = document.querySelector('.read-progress');
  if (bar) {
    const onScroll = () => {
      const h = document.documentElement;
      const scrolled = h.scrollTop / (h.scrollHeight - h.clientHeight);
      bar.style.width = (scrolled * 100) + '%';
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Gentle fade-in for body content
  const article = document.querySelector('article.post');
  if (article) {
    article.style.opacity = '0';
    article.style.transform = 'translateY(12px)';
    requestAnimationFrame(() => {
      article.style.transition = 'opacity 0.7s ease, transform 0.7s cubic-bezier(.16,1,.3,1)';
      article.style.opacity = '1';
      article.style.transform = 'translateY(0)';
    });
  }
})();
