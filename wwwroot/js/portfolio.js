window.portfolio = {
  observeReveals() {
    const els = document.querySelectorAll('.reveal:not(.is-visible)');
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
  },

  // Drives the cosmic background: --sp (scroll progress 0..1) and --mx/--my (eased pointer position -1..1)
  initBackground() {
    if (window.__cosmosInit) return;
    window.__cosmosInit = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const max = Math.max(1, root.scrollHeight - innerHeight);
        root.style.setProperty('--sp', Math.min(1, Math.max(0, scrollY / max)).toFixed(4));
        ticking = false;
      });
    };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    onScroll();

    if (matchMedia('(pointer: fine)').matches) {
      let tx = 0, ty = 0, cx = 0, cy = 0, running = false;
      const tick = () => {
        cx += (tx - cx) * 0.06;
        cy += (ty - cy) * 0.06;
        root.style.setProperty('--mx', cx.toFixed(3));
        root.style.setProperty('--my', cy.toFixed(3));
        if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) requestAnimationFrame(tick);
        else running = false;
      };
      addEventListener('mousemove', e => {
        tx = e.clientX / innerWidth * 2 - 1;
        ty = e.clientY / innerHeight * 2 - 1;
        if (!running) { running = true; requestAnimationFrame(tick); }
      }, { passive: true });
    }
  }
};
