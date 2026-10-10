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

  // Called by the layout every time the page changes: back to the top, then fade-ins start watching the new page.
  pageEntered(first) {
    if (!first) scrollTo({ top: 0, left: 0, behavior: 'instant' });
    this.observeReveals();
  },

  // Scroll to an element by id (used by the ABOUT / CONTACT links in the nav).
  goTo(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  },

  // Cosmic background motion. Scroll progress and pointer position are EASED (exponential lerp, frame-rate independent)
  // and written straight to the layers: [data-par] = pointer/scroll parallax, [data-turn] = degrees turned over a full page scroll.
  // Nothing touches :root, so scrolling never forces the whole page to re-style.
  initBackground() {
    if (window.__cosmosInit) return;
    window.__cosmosInit = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const root = document.documentElement;
    const pars = [...document.querySelectorAll('.cosmos-par')].map(el => ({
      el, par: parseFloat(el.dataset.par) || 0, sy: parseFloat(el.dataset.parSy) || 0 }));
    const turns = [...document.querySelectorAll('[data-turn]')].map(el => ({ el, turn: parseFloat(el.dataset.turn) || 0 }));

    const cur = { sp: 0, mx: 0, my: 0 };
    const tgt = { sp: 0, mx: 0, my: 0 };
    let raf = 0, last = 0, max = 1;

    const apply = () => {
      for (const p of pars)
        p.el.style.transform = `translate3d(${(cur.mx * p.par).toFixed(2)}px, ${(cur.my * p.par + cur.sp * p.sy).toFixed(2)}px, 0)`;
      for (const t of turns)
        t.el.style.transform = `rotate(${(cur.sp * t.turn).toFixed(3)}deg)`;
    };

    const frame = (now) => {
      raf = 0;
      const dt = Math.min(50, last ? now - last : 16);
      last = now;
      const k = 1 - Math.exp(-dt / 170);          // ~170ms smoothing, same feel at 60Hz or 144Hz
      let moving = false;
      for (const key of ['sp', 'mx', 'my']) {
        const d = tgt[key] - cur[key];
        if (Math.abs(d) > (key === 'sp' ? 0.0002 : 0.002)) { cur[key] += d * k; moving = true; }
        else cur[key] = tgt[key];
      }
      apply();
      if (moving) raf = requestAnimationFrame(frame); else last = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

    const measure = () => { max = Math.max(1, root.scrollHeight - innerHeight); tgt.sp = Math.min(1, Math.max(0, scrollY / max)); kick(); };
    measure();
    new ResizeObserver(measure).observe(document.body);
    addEventListener('resize', measure);
    addEventListener('scroll', () => { tgt.sp = Math.min(1, Math.max(0, scrollY / max)); kick(); }, { passive: true });

    if (matchMedia('(pointer: fine)').matches) {
      addEventListener('mousemove', e => {
        tgt.mx = e.clientX / innerWidth * 2 - 1;
        tgt.my = e.clientY / innerHeight * 2 - 1;
        kick();
      }, { passive: true });
    }
  }
};
