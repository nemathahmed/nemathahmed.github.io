/* Reading progress for long essays. */
(() => {
  const bar = document.querySelector('.read-progress');
  if (bar) {
    const onScroll = () => {
      const h = document.documentElement;
      const available = h.scrollHeight - h.clientHeight;
      const scrolled = available > 0 ? h.scrollTop / available : 0;
      bar.style.width = (scrolled * 100) + '%';
    };
    document.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
