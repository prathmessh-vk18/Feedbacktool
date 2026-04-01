// ── content.js — annotation overlay (no external deps) ────────────
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────
  let root, bgEl, canvas, ctx;
  let shapes       = [];
  let drawing      = false;
  let startX = 0,  startY = 0;
  let penPoints    = [];
  let currentTool  = 'rect';
  let currentColor = '#FF3B5C';
  let currentWidth = 3;
  let pageUrl      = '';
  let pageTimestamp= '';
  let scale        = 1;

  // ── Listen for message from background ────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'showOverlay') {
      pageUrl       = msg.url;
      pageTimestamp = msg.timestamp;
      buildOverlay(msg.screenshot);
      sendResponse({ ok: true });
    }
    if (msg.action === 'hideOverlay') {
      teardown();
      sendResponse({ ok: true });
    }
    return true;
  });

  // ── Build overlay DOM ─────────────────────────────────────────
  function buildOverlay(screenshotUrl) {
    teardown();

    root = make('div', { id: 'df-root' });

    // Frozen screenshot as CSS background
    bgEl = make('div', { id: 'df-bg' });
    bgEl.style.backgroundImage = `url(${screenshotUrl})`;
    root.appendChild(bgEl);

    // Drawing canvas
    canvas = make('canvas', { id: 'df-canvas' });
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx = canvas.getContext('2d');
    root.appendChild(canvas);

    // UI chrome
    root.appendChild(buildToolbar());
    root.appendChild(buildCloseCorner());
    root.appendChild(buildTextPopup());
    root.appendChild(buildToast());

    document.body.appendChild(root);
    root.classList.add('df-visible');

    // Canvas interaction
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup',   onUp);
    canvas.addEventListener('mouseleave', onUp);

    // Keyboard shortcuts: Delete/Backspace to undo
    window.addEventListener('keydown', onKey);

    // Zoom resistance
    window.visualViewport?.addEventListener('resize', updateZoomScale);
    updateZoomScale();

    // Block scroll from passing through
    root.addEventListener('wheel', e => e.stopPropagation(), { passive: false });

    // Initial tool state (sets cursor)
    selectTool('rect');

    // Camera flash effect
    showFlash();
  }

  function onKey(e) {
    if (!root) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Don't undo if typing in a label
      if (document.activeElement.tagName === 'INPUT') return;
      undoLast();
    }
  }

  function updateZoomScale() {
    if (!root) return;
    const v = window.visualViewport;
    if (v) {
      scale = 1 / v.scale;
      const tb = root.querySelector('#df-toolbar');
      const closeBtn = root.querySelector('#df-close-corner');
      if (tb) tb.style.transform = `translateX(-50%) scale(${scale})`;
      if (closeBtn) closeBtn.style.transform = `scale(${scale})`;
    }
  }

  function showFlash() {
    const flash = make('div', { id: 'df-flash' });
    root.appendChild(flash);
    setTimeout(() => flash.classList.add('df-fade-out'), 50);
    setTimeout(() => flash.remove(), 600);
  }

  // ── Close corner button (top-right ✕) ─────────────────────────
  function buildCloseCorner() {
    const btn = make('button', { id: 'df-close-corner', title: 'Close' });
    btn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', teardown);
    return btn;
  }

  // ── Toolbar ───────────────────────────────────────────────────
  const TOOLS = [
    { id: 'rect',   svg: '<rect x="3" y="5" width="18" height="14" rx="2"/>' },
    { id: 'circle', svg: '<circle cx="12" cy="12" r="9"/>' },
    { id: 'arrow',  svg: '<line x1="5" y1="19" x2="19" y2="5"/><polyline points="9 5 19 5 19 15"/>' },
    { id: 'text',   svg: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>' },
    { id: 'pen',    svg: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4z"/>' },
  ];
  const COLORS = ['#FF3B5C', '#ffffff', '#000000'];

  function buildToolbar() {
    const tb = make('div', { id: 'df-toolbar' });
    tb.addEventListener('mousedown', e => e.stopPropagation());

    // Tool buttons
    TOOLS.forEach(t => {
      const btn = make('button', { className: 'df-tool-btn' + (t.id === 'rect' ? ' df-active' : ''), title: t.id });
      btn.dataset.tool = t.id;
      btn.innerHTML = `<svg viewBox="0 0 24 24">${t.svg}</svg>`;
      btn.addEventListener('click', () => selectTool(t.id));
      tb.appendChild(btn);
    });

    tb.appendChild(sep());

    // Color swatches
    COLORS.forEach(c => {
      const sw = make('div', { className: 'df-swatch' + (c === currentColor ? ' df-active' : '') });
      sw.style.setProperty('--swatch-color', c);
      sw.dataset.color = c;
      sw.addEventListener('click', () => selectColor(c));
      tb.appendChild(sw);
    });

    tb.appendChild(sep());

    // Undo
    const undo = make('button', { className: 'df-undo-btn', title: 'Undo' });
    undo.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/></svg>';
    undo.addEventListener('click', undoLast);
    tb.appendChild(undo);

    // Save
    const save = make('button', { className: 'df-save-btn' });
    save.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save';
    save.addEventListener('click', saveShot);
    tb.appendChild(save);

    return tb;
  }

  function buildTextPopup() {
    const pop = make('div', { id: 'df-text-popup' });
    pop.addEventListener('mousedown', e => e.stopPropagation());
    const inp = make('input', { type: 'text', placeholder: 'Type label…' });
    const btn = make('button'); btn.textContent = 'Add';
    btn.addEventListener('click', confirmText);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter')  confirmText();
      if (e.key === 'Escape') hideTextPopup();
    });
    pop.appendChild(inp);
    pop.appendChild(btn);
    return pop;
  }

  function buildToast() {
    return make('div', { id: 'df-toast' });
  }

  // ── Tool / color selection ────────────────────────────────────
  function selectTool(id) {
    currentTool = id;
    root.querySelectorAll('.df-tool-btn').forEach(b =>
      b.classList.toggle('df-active', b.dataset.tool === id)
    );
    canvas.style.cursor = id === 'text' ? 'text' : 'crosshair';
  }

  function selectColor(c) {
    currentColor = c;
    root.querySelectorAll('.df-swatch').forEach(s =>
      s.classList.toggle('df-active', s.dataset.color === c)
    );
  }

  // ── Canvas drawing ────────────────────────────────────────────
  function onDown(e) {
    if (currentTool === 'text') {
      showTextPopup(e.clientX, e.clientY); return;
    }
    drawing = true;
    const [x, y] = pos(e);
    startX = x; startY = y;
    if (currentTool === 'pen') penPoints = [{ x, y }];
  }

  function onMove(e) {
    if (!drawing) return;
    const [x, y] = pos(e);
    redraw();

    if (currentTool === 'pen') {
      penPoints.push({ x, y });
      drawPen(ctx, penPoints, currentColor, currentWidth);
    } else {
      drawPreview(x, y);
    }
  }

  function onUp(e) {
    if (!drawing) return;
    drawing = false;
    const [x, y] = pos(e);
    const s = buildShape(x, y);
    if (s) { shapes.push(s); redraw(); }
    penPoints = [];
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function buildShape(x, y) {
    if (currentTool === 'pen' && penPoints.length > 1)
      return { type: 'pen', pts: [...penPoints], color: currentColor, lw: currentWidth };
    if (currentTool === 'rect')
      return { type: 'rect', x: Math.min(x, startX), y: Math.min(y, startY), w: Math.abs(x - startX), h: Math.abs(y - startY), color: currentColor, lw: currentWidth };
    if (currentTool === 'circle')
      return { type: 'circle', x: Math.min(x, startX), y: Math.min(y, startY), w: x - startX, h: y - startY, color: currentColor, lw: currentWidth };
    if (currentTool === 'arrow' && (Math.abs(x - startX) > 4 || Math.abs(y - startY) > 4))
      return { type: 'arrow', x1: startX, y1: startY, x2: x, y2: y, color: currentColor, lw: currentWidth };
    return null;
  }

  // ── Shape renderers ───────────────────────────────────────────
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shapes.forEach(s => renderShape(ctx, s));
  }

  function drawPreview(x, y) {
    const s = buildShape(x, y);
    if (s) renderShape(ctx, s);
  }

  function renderShape(c, s) {
    c.save();
    c.strokeStyle = s.color; c.fillStyle = s.color;
    c.lineWidth = s.lw; c.lineCap = 'round'; c.lineJoin = 'round';

    if (s.type === 'rect') {
      c.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.type === 'circle') {
      c.beginPath();
      c.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.max(1, Math.abs(s.w / 2)), Math.max(1, Math.abs(s.h / 2)), 0, 0, Math.PI * 2);
      c.stroke();
    } else if (s.type === 'arrow') {
      drawArrow(c, s.x1, s.y1, s.x2, s.y2, s.color, s.lw);
    } else if (s.type === 'pen') {
      drawPen(c, s.pts, s.color, s.lw);
    } else if (s.type === 'text') {
      c.font = `bold ${14 + s.lw * 2}px 'Plus Jakarta Sans', sans-serif`;
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.5)';
      c.strokeText(s.text, s.x, s.y);
      c.fillText(s.text, s.x, s.y);
    }
    c.restore();
  }

  function drawArrow(c, x1, y1, x2, y2, color, lw) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head  = 13 + lw * 2;
    c.save();
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = lw; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
    c.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
    c.closePath(); c.fill();
    c.restore();
  }

  function drawPen(c, pts, color, lw) {
    if (pts.length < 2) return;
    c.save();
    c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => c.lineTo(p.x, p.y));
    c.stroke(); c.restore();
  }

  // ── Text popup ────────────────────────────────────────────────
  let textX = 0, textY = 0;

  function showTextPopup(cx, cy) {
    textX = cx; textY = cy;
    const pop = root.querySelector('#df-text-popup');
    pop.style.left = cx + 'px';
    pop.style.top  = (cy - 50) + 'px';
    pop.classList.add('df-visible');
    pop.querySelector('input').value = '';
    setTimeout(() => pop.querySelector('input').focus(), 30);
  }

  function hideTextPopup() {
    root.querySelector('#df-text-popup').classList.remove('df-visible');
  }

  function confirmText() {
    const val = (root.querySelector('#df-text-popup input').value || '').trim();
    if (val) {
      shapes.push({ type: 'text', x: textX, y: textY, text: val, color: currentColor, lw: currentWidth });
      redraw();
    }
    hideTextPopup();
  }

  // ── Undo ─────────────────────────────────────────────────────
  function undoLast() {
    shapes.pop();
    redraw();
  }

  // ── Save screenshot ───────────────────────────────────────────
  async function saveShot() {
    // Composite: frozen screenshot bg + annotation canvas → single PNG
    const W = canvas.width, H = canvas.height;
    const flat = document.createElement('canvas');
    flat.width = W; flat.height = H;
    const fc = flat.getContext('2d');

    // Draw the screenshot background image
    const img = new Image();
    img.onload = async () => {
      fc.drawImage(img, 0, 0, W, H);
      fc.drawImage(canvas, 0, 0);               // annotations on top
      const dataUrl = flat.toDataURL('image/png');

      try {
        const res = await chrome.runtime.sendMessage({
          action:    'saveScreenshot',
          image:     dataUrl,
          url:       pageUrl,
          timestamp: pageTimestamp,
          comment:   ''
        });
        if (res?.success) {
          // Hide canvas and tools immediately so the user can interact with the page
          if (canvas) canvas.style.display = 'none';
          if (bgEl) bgEl.style.display = 'none';
          const tb = root.querySelector('#df-toolbar');
          if (tb) tb.style.display = 'none';
          const cc = root.querySelector('#df-close-corner');
          if (cc) cc.style.display = 'none';

          toast('✓ Saved — open the panel to review', true);
          setTimeout(teardown, 1500);
        }
      } catch (err) {
        toast('Error saving screenshot', false);
      }
    };
    // Extract URL from background-image style: url("...")
    img.src = bgEl.style.backgroundImage.slice(5, -2);
  }

  // ── Toast ─────────────────────────────────────────────────────
  let _toastTimer;
  function toast(msg, ok = true) {
    const el = root.querySelector('#df-toast');
    if (!el) return;
    el.textContent = msg;
    el.className   = 'df-visible' + (ok ? ' df-success' : '');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.className = ''; }, 2200);
  }

  // ── Cleanup ───────────────────────────────────────────────────
  function teardown() {
    if (root) { root.remove(); root = null; }
    window.removeEventListener('keydown', onKey);
    window.visualViewport?.removeEventListener('resize', updateZoomScale);
    shapes = []; drawing = false; penPoints = [];
  }

  // ── DOM helper ────────────────────────────────────────────────
  function make(tag, attrs = {}) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') el.className = v;
      else el.setAttribute(k, v);
    });
    return el;
  }

  function sep() {
    const d = document.createElement('div');
    d.className = 'df-sep';
    return d;
  }

})();
