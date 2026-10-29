(() => {
  const section = document.querySelector('.news-section');
  const scroller = section?.querySelector('.news-scroll');
  const toggle = section?.querySelector('.news-toggle');
  if (!scroller || !toggle) return;

  const timeline = scroller.querySelector('.timeline');
  const pauseIcon = toggle.querySelector('.news-pause-icon');
  const playIcon = toggle.querySelector('.news-play-icon');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const printMode = window.matchMedia('print');
  const pixelsPerSecond = 14;
  const endPause = 3000;
  let manuallyPaused = reducedMotion.matches;
  let hovered = window.matchMedia('(hover: hover)').matches && section.matches(':hover');
  let keyboardFocused = false;
  let touching = false;
  let visible = false;
  let overflowing = false;
  let frame = null;
  let previousTime = null;
  let fractionalPixels = 0;
  let bottomSince = null;
  let resumeAt = performance.now() + 1800;

  function paused() {
    return manuallyPaused || hovered || keyboardFocused || touching ||
      document.hidden || printMode.matches || !visible || !overflowing;
  }

  function sync() {
    toggle.hidden = !overflowing;
    const label = manuallyPaused ? 'Resume news scrolling' : 'Pause news scrolling';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    pauseIcon.hidden = manuallyPaused;
    playIcon.hidden = !manuallyPaused;

    if (paused()) {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previousTime = null;
      fractionalPixels = 0;
      bottomSince = null;
    } else if (frame === null) {
      frame = requestAnimationFrame(tick);
    }
  }

  function tick(time) {
    frame = null;
    if (paused()) return sync();
    const elapsed = previousTime === null ? 0 : Math.min(time - previousTime, 100);
    previousTime = time;

    if (time >= resumeAt) {
      const bottom = scroller.scrollHeight - scroller.clientHeight;
      if (scroller.scrollTop >= bottom - 1) {
        bottomSince ??= time;
        if (time - bottomSince >= endPause) {
          scroller.scrollTop = 0;
          bottomSince = null;
          fractionalPixels = 0;
          resumeAt = time + 1800;
        }
      } else {
        bottomSince = null;
        // Accumulate fractions because some browsers round scrollTop to pixels.
        fractionalPixels += elapsed * pixelsPerSecond / 1000;
        const distance = Math.floor(fractionalPixels);
        if (distance > 0) {
          scroller.scrollTop += distance;
          fractionalPixels -= distance;
        }
      }
    }
    frame = requestAnimationFrame(tick);
  }

  section.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch') return;
    hovered = true;
    sync();
  });
  section.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'touch') return;
    hovered = false;
    sync();
  });
  section.addEventListener('focusin', (event) => {
    keyboardFocused = event.target.matches(':focus-visible');
    sync();
  });
  section.addEventListener('focusout', (event) => {
    keyboardFocused = Boolean(event.relatedTarget &&
      section.contains(event.relatedTarget) && event.relatedTarget.matches(':focus-visible'));
    sync();
  });
  section.addEventListener('pointerdown', () => {
    keyboardFocused = false;
    sync();
  });
  scroller.addEventListener('touchstart', () => {
    touching = true;
    sync();
  }, { passive: true });
  function finishTouch(event) {
    touching = event.touches.length > 0;
    resumeAt = performance.now() + 3000;
    sync();
  }
  scroller.addEventListener('touchend', finishTouch, { passive: true });
  scroller.addEventListener('touchcancel', finishTouch, { passive: true });
  toggle.addEventListener('click', () => {
    manuallyPaused = !manuallyPaused;
    sync();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) manuallyPaused = true;
    sync();
  });
  printMode.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(scroller);

  const resizeObserver = new ResizeObserver(() => {
    overflowing = scroller.scrollHeight > scroller.clientHeight + 1;
    sync();
  });
  resizeObserver.observe(scroller);
  resizeObserver.observe(timeline);
})();
