// ── sidepanel.js ──────────────────────────────────────────────────
'use strict';

let screenshots = [];
let selected = new Set();

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadScreenshots();
  bindEvents();

  // Refresh when content script saves a new screenshot
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === 'refresh') loadScreenshots();
  });
});

// ── Load from storage ─────────────────────────────────────────────
async function loadScreenshots() {
  const res = await sendMsg({ action: 'getScreenshots' });
  screenshots = res.screenshots || [];
  // Remove any selected ids that no longer exist
  const existing = new Set(screenshots.map(s => s.id));
  selected = new Set([...selected].filter(id => existing.has(id)));
  renderList();
  updateStats();
}

// ── Bind events ───────────────────────────────────────────────────
function bindEvents() {
  // Capture button in header
  $('capBtn').addEventListener('click', async () => {
    const res = await sendMsg({ action: 'captureFromPanel' });
    if (!res?.ok) showToast('Cannot capture this tab — try a normal webpage', 'err');
  });


  $('delSelBtn').addEventListener('click', async () => {
    await sendMsg({ action: 'deleteMany', ids: [...selected] });
    selected.clear();
    await loadScreenshots();
    showToast('Deleted');
  });

  $('dlBtn').addEventListener('click', generateDocx);
}

// ── Render list ───────────────────────────────────────────────────
function renderList() {
  const list = $('list');

  if (!screenshots.length) {
    list.innerHTML = `
      <div class="empty">
        <div class="empty-ico">
          <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </div>
        <div class="empty-t">No screenshots yet</div>
        <div class="empty-d">Click the extension icon on any page to capture and annotate a UI issue.</div>
      </div>`;
    return;
  }

  list.innerHTML = screenshots.map(s => {
    const sel = selected.has(s.id);
    const host = safeHost(s.url);
    const time = fmtTime(s.timestamp);
    return `
      <div class="card${sel ? ' selected' : ''}" data-id="${s.id}">
        <div class="card-img">
          ${s.image
        ? `<img src="${s.image}" alt="Screenshot"/>`
        : `<div class="no-img"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`
      }
          <div class="chk">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="card-del" data-del="${s.id}">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
        </div>
        <div class="card-meta">
          <div class="card-url">${esc(host)}</div>
          ${s.comment ? `<div class="card-comment">${esc(s.comment)}</div>` : ''}
          <div class="card-time">${time}</div>
        </div>
      </div>`;
  }).join('');

  // Attach events to freshly rendered cards
  list.querySelectorAll('.card').forEach(card => {
    const id = card.dataset.id;

    card.addEventListener('click', e => {
      if (e.target.closest('.card-del')) return;
      selected.has(id) ? selected.delete(id) : selected.add(id);
      card.classList.toggle('selected', selected.has(id));
      updateStats();
    });

    card.querySelector('.card-del').addEventListener('click', async e => {
      e.stopPropagation();
      await sendMsg({ action: 'deleteOne', id });
      selected.delete(id);
      await loadScreenshots();
    });
  });
}

// ── Stats + UI state ──────────────────────────────────────────────
function updateStats() {
  $('totalCount').textContent = screenshots.length;
  $('selCount').textContent = selected.size;

  $('bulkBar').classList.toggle('hidden', selected.size === 0);
  $('bulkLbl').textContent = `${selected.size} selected`;
  $('dlBtn').disabled = selected.size === 0;

  const hint = $('footerHint');
  if (selected.size > 0) {
    hint.innerHTML = `<strong>${selected.size}</strong> screenshot${selected.size > 1 ? 's' : ''} ready — click below to download.`;
  } else {
    hint.innerHTML = `Select screenshots above, then download as a <strong>.docx</strong> report.`;
  }
}

// ── Generate .docx report ─────────────────────────────────────────
async function generateDocx() {
  const items = screenshots.filter(s => selected.has(s.id));
  if (!items.length) return;

  show('genOverlay');

  try {
    const {
      Document, Packer, Paragraph, TextRun, ImageRun,
      HeadingLevel, BorderStyle, AlignmentType
    } = window.docx;

    const children = [];

    // ── Cover ──────────────────────────────────────────────────
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 100 },
        children: [new TextRun({ text: 'Design Feedback Report', bold: true, size: 36, font: 'Arial' })]
      }),
      new Paragraph({
        spacing: { after: 280 },
        children: [
          new TextRun({ text: `Generated: ${new Date().toLocaleString()}`, size: 20, color: '888888', font: 'Arial' }),
          new TextRun({ text: `   ·   ${items.length} issue${items.length > 1 ? 's' : ''}`, size: 20, color: '888888', font: 'Arial' })
        ]
      }),
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DDDDDD', space: 1 } },
        spacing: { after: 360 },
        children: []
      })
    );

    // ── One section per screenshot ─────────────────────────────
    for (let i = 0; i < items.length; i++) {
      const s = items[i];

      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 80 },
          children: [new TextRun({ text: `Issue #${i + 1}`, bold: true, size: 28, font: 'Arial' })]
        }),
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: 'Page:  ', bold: true, size: 19, font: 'Arial', color: '555555' }),
            new TextRun({ text: s.url, size: 19, font: 'Courier New', color: '0055CC' })
          ]
        }),
        new Paragraph({
          spacing: { after: s.comment ? 60 : 160 },
          children: [
            new TextRun({ text: 'Captured:  ', bold: true, size: 19, font: 'Arial', color: '555555' }),
            new TextRun({ text: fmtTime(s.timestamp), size: 19, font: 'Arial', color: '888888' })
          ]
        })
      );

      if (s.comment) {
        children.push(
          new Paragraph({
            spacing: { after: 160 },
            indent: { left: 280 },
            children: [
              new TextRun({ text: `⚠  ${s.comment}`, size: 20, font: 'Arial', color: '555500' })
            ]
          })
        );
      }

      if (s.image) {
        try {
          const { buf, w, h } = await imageToBuffer(s.image);
          const maxPx = 620;   // max display width in points (~8.6 inches)
          const scale = Math.min(1, maxPx / w);
          const dispW = Math.round(w * scale);
          const dispH = Math.round(h * scale);

          children.push(
            new Paragraph({
              spacing: { after: 200 },
              children: [new ImageRun({ data: buf, transformation: { width: dispW, height: dispH }, type: 'png' })]
            })
          );
        } catch (imgErr) {
          console.warn('[DF] image embed error', imgErr);
          children.push(new Paragraph({ children: [new TextRun({ text: '[Image unavailable]', color: 'CC0000', font: 'Arial', size: 18 })] }));
        }
      }

      // Divider between issues
      if (i < items.length - 1) {
        children.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'EEEEEE', space: 1 } },
            spacing: { before: 160, after: 160 },
            children: []
          })
        );
      }
    }

    // ── Build + pack ───────────────────────────────────────────
    const doc = new Document({
      styles: {
        default: { document: { run: { font: 'Arial', size: 22 } } },
        paragraphStyles: [
          {
            id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 36, bold: true, font: 'Arial', color: '111111' },
            paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 0 }
          },
          {
            id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 28, bold: true, font: 'Arial', color: 'FF3B5C' },
            paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 1 }
          }
        ]
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },        // US Letter
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children
      }]
    });

    const blob = await Packer.toBlob(doc);
    triggerDownload(blob, `design-feedback-${Date.now()}.docx`);

    hide('genOverlay');
    showToast(`✓ Report downloaded — ${items.length} issue${items.length > 1 ? 's' : ''}`, 'ok');

  } catch (err) {
    console.error('[DF] docx generation error:', err);
    hide('genOverlay');
    showToast('Failed to generate report', 'err');
  }
}

// ── Image → ArrayBuffer (re-draw through canvas to get clean PNG) ─
function imageToBuffer(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      c.toBlob(blob => {
        blob.arrayBuffer()
          .then(buf => resolve({ buf, w: img.naturalWidth, h: img.naturalHeight }))
          .catch(reject);
      }, 'image/png');
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ── Trigger file download from blob ────────────────────────────
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

// ── Helpers ───────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function safeHost(url) { try { return new URL(url).hostname || url; } catch { return url; } }
function fmtTime(iso) { try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso || ''; } }
function sendMsg(payload) { return chrome.runtime.sendMessage(payload); }

let _toastTimer;
function showToast(text, type = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
}
