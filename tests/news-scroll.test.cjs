const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'news-scroll.js'), 'utf8');

function setup({ reduced = false, height = 600, hovering = false } = {}) {
  function element() {
    const listeners = new Map();
    return {
      hidden: false,
      focusVisible: false,
      attributes: {},
      addEventListener(name, callback) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(callback);
      },
      fire(name, event = {}) {
        for (const callback of listeners.get(name) || []) callback(event);
      },
      matches(selector) {
        return selector === ':hover' ? hovering : this.focusVisible;
      },
      setAttribute(name, value) { this.attributes[name] = value; },
    };
  }
  const section = element();
  const scroller = element();
  const toggle = element();
  const pause = element();
  const play = element();
  const timeline = element();
  const document = element();
  const motion = Object.assign(element(), { matches: reduced });
  const printing = Object.assign(element(), { matches: false });
  section.querySelector = (selector) => selector === '.news-scroll' ? scroller : toggle;
  section.contains = (target) => target === scroller || target === toggle;
  scroller.querySelector = () => timeline;
  toggle.querySelector = (selector) => selector === '.news-pause-icon' ? pause : play;
  document.querySelector = () => section;
  let scrollTop = 0;
  Object.assign(scroller, { clientHeight: 288, scrollHeight: height });
  Object.defineProperty(scroller, 'scrollTop', {
    get: () => scrollTop,
    set: (value) => { scrollTop = Math.max(0, Math.min(Math.round(value), scroller.scrollHeight - scroller.clientHeight)); },
  });
  let time = 0;
  let nextFrame = 0;
  const frames = new Map();
  let intersection;
  let resize;
  vm.runInNewContext(source, {
    document,
    window: {
      matchMedia: (query) => query === 'print' ? printing :
        query === '(hover: hover)' ? { matches: true } : motion,
    },
    performance: { now: () => time },
    requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    IntersectionObserver: class {
      constructor(callback) { intersection = callback; }
      observe() {}
    },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe() {}
    },
  });
  intersection([{ isIntersecting: true }]);
  resize();
  function advance(milliseconds) {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 20) {
      time += 20;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(time);
      assert.ok(frames.size <= 1, 'only one animation loop may be active');
    }
  }
  return { section, scroller, toggle, pause, play, document, motion, printing,
    advance, resize, intersect: (visible) => intersection([{ isIntersecting: visible }]) };
}

test('starts slowly after a reading pause, including integer-rounded scrollTop', () => {
  const app = setup();
  app.advance(1600);
  assert.equal(app.scroller.scrollTop, 0);
  app.advance(2200);
  assert.ok(app.scroller.scrollTop >= 26 && app.scroller.scrollTop <= 29);
});

test('hover pauses immediately and mouse exit resumes', () => {
  const app = setup();
  app.advance(3000);
  app.section.fire('pointerenter', { pointerType: 'mouse' });
  const position = app.scroller.scrollTop;
  app.advance(5000);
  assert.equal(app.scroller.scrollTop, position);
  app.section.fire('pointerleave', { pointerType: 'mouse' });
  app.advance(1000);
  assert.ok(app.scroller.scrollTop > position);
});

test('keyboard focus pauses, but mouse focus does not prevent resuming', () => {
  const app = setup();
  app.advance(3000);
  app.scroller.focusVisible = true;
  app.section.fire('focusin', { target: app.scroller });
  const position = app.scroller.scrollTop;
  app.advance(3000);
  assert.equal(app.scroller.scrollTop, position);
  app.section.fire('focusout', { relatedTarget: null });
  app.scroller.focusVisible = false;
  app.section.fire('focusin', { target: app.scroller });
  app.advance(1000);
  assert.ok(app.scroller.scrollTop > position);
});

test('explicit pause persists after hovering, with accessible play/pause states', () => {
  const app = setup();
  app.toggle.fire('click');
  assert.equal(app.toggle.attributes['aria-label'], 'Resume news scrolling');
  assert.equal(app.pause.hidden, true);
  assert.equal(app.play.hidden, false);
  app.section.fire('pointerenter', { pointerType: 'mouse' });
  app.section.fire('pointerleave', { pointerType: 'mouse' });
  app.advance(5000);
  assert.equal(app.scroller.scrollTop, 0);
  app.toggle.fire('click');
  app.advance(1000);
  assert.ok(app.scroller.scrollTop > 0);
  assert.equal(app.toggle.title, 'Pause news scrolling');
});

test('reduced motion starts paused and a later preference change stops motion', () => {
  const app = setup({ reduced: true });
  app.advance(5000);
  assert.equal(app.scroller.scrollTop, 0);
  app.toggle.fire('click');
  app.advance(1000);
  assert.ok(app.scroller.scrollTop > 0);
  app.motion.fire('change');
  const position = app.scroller.scrollTop;
  app.advance(5000);
  assert.equal(app.scroller.scrollTop, position);
});

test('touch interaction pauses and leaves time for manual scrolling before resuming', () => {
  const app = setup();
  app.advance(3000);
  app.section.fire('pointerenter', { pointerType: 'touch' });
  app.scroller.fire('touchstart');
  const position = app.scroller.scrollTop;
  app.advance(5000);
  assert.equal(app.scroller.scrollTop, position);
  app.scroller.fire('touchend', { touches: [] });
  app.advance(2800);
  assert.equal(app.scroller.scrollTop, position);
  app.advance(1200);
  assert.ok(app.scroller.scrollTop > position);
});

test('offscreen, background-tab and print states pause without catch-up jumps', () => {
  const app = setup();
  app.advance(3000);
  for (const change of [
    (value) => app.intersect(!value),
    (value) => { app.document.hidden = value; app.document.fire('visibilitychange'); },
    (value) => { app.printing.matches = value; app.printing.fire('change'); },
  ]) {
    change(true);
    const position = app.scroller.scrollTop;
    app.advance(10000);
    assert.equal(app.scroller.scrollTop, position);
    change(false);
    app.advance(1000);
    assert.ok(app.scroller.scrollTop > position && app.scroller.scrollTop <= position + 14);
  }
});

test('waits at the last item, loops to the top and pauses before restarting', () => {
  const app = setup();
  app.advance(3000);
  app.scroller.scrollTop = app.scroller.scrollHeight - app.scroller.clientHeight;
  app.advance(2800);
  assert.equal(app.scroller.scrollTop, 312);
  app.advance(400);
  assert.equal(app.scroller.scrollTop, 0);
  app.advance(1400);
  assert.equal(app.scroller.scrollTop, 0);
  app.advance(1000);
  assert.ok(app.scroller.scrollTop > 0);
});

test('short content stays still and the control appears only when it overflows', () => {
  const app = setup({ height: 200 });
  app.advance(5000);
  assert.equal(app.toggle.hidden, true);
  assert.equal(app.scroller.scrollTop, 0);
  app.scroller.scrollHeight = 600;
  app.resize();
  app.advance(1000);
  assert.equal(app.toggle.hidden, false);
  assert.ok(app.scroller.scrollTop > 0);
});
