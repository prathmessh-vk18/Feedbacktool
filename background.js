// ── background.js ─────────────────────────────────────────────────
// Service worker: handles icon click, screenshot capture, and storage.

// Click the extension icon → open side panel + capture current tab
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true }).catch(console.error);

chrome.action.onClicked.addListener(async (tab) => {
  try {
    // Open the side panel, which triggers a slide-in animation
    await chrome.sidePanel.open({ tabId: tab.id });
    
    // Wait for the animation to finish so the viewport width stabilizes.
    // If we capture immediately, the screenshot will have the pre-animation width, 
    // causing it to look horribly squished when rendered in the fully squeezed viewport.
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await captureAndSend(tab);
  } catch (err) {
    console.error('[DF] onClicked error:', err);
  }
});

async function captureAndSend(tab) {
  // Hide existing overlay to prevent toolbar from being baked into the new screenshot
  try { 
    await chrome.tabs.sendMessage(tab.id, { action: 'hideOverlay' }); 
    await new Promise(r => setTimeout(r, 100)); // allow DOM to update
  } catch(e) {}

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const payload = {
    action: 'showOverlay',
    screenshot: dataUrl,
    url: tab.url,
    timestamp: new Date().toISOString()
  };

  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch (err) {
    console.warn('[DF] Direct message failed, attempting to inject content script...', err);
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, payload);
  }
}

// ── Message bus ────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // Triggered from side panel "Capture" button
  if (msg.action === 'captureFromPanel') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab) { sendResponse({ ok: false, err: 'No active tab' }); return; }
      try {
        await captureAndSend(tab);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, err: e.message });
      }
    });
    return true; // async
  }

  // Save an annotated screenshot to local storage
  if (msg.action === 'saveScreenshot') {
    chrome.storage.local.get(['screenshots'], (res) => {
      const list = res.screenshots || [];
      const entry = {
        id:        `ss_${Date.now()}`,
        image:     msg.image,
        url:       msg.url,
        timestamp: msg.timestamp,
        comment:   msg.comment || ''
      };
      list.unshift(entry);
      chrome.storage.local.set({ screenshots: list }, () => {
        sendResponse({ success: true, entry });
        // Tell the side panel to refresh its list
        chrome.runtime.sendMessage({ action: 'refresh' }).catch(() => {});
      });
    });
    return true;
  }

  // Load all screenshots
  if (msg.action === 'getScreenshots') {
    chrome.storage.local.get(['screenshots'], (res) => {
      sendResponse({ screenshots: res.screenshots || [] });
    });
    return true;
  }

  // Delete one screenshot by id
  if (msg.action === 'deleteOne') {
    chrome.storage.local.get(['screenshots'], (res) => {
      const list = (res.screenshots || []).filter(s => s.id !== msg.id);
      chrome.storage.local.set({ screenshots: list }, () => sendResponse({ ok: true }));
    });
    return true;
  }

  // Delete multiple screenshots by ids array
  if (msg.action === 'deleteMany') {
    const ids = new Set(msg.ids);
    chrome.storage.local.get(['screenshots'], (res) => {
      const list = (res.screenshots || []).filter(s => !ids.has(s.id));
      chrome.storage.local.set({ screenshots: list }, () => sendResponse({ ok: true }));
    });
    return true;
  }
});
