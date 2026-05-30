// AI Writer Pro - Content Script
(function() {
  'use strict';

  if (window.__aiWriterLoaded) return;
  window.__aiWriterLoaded = true;

  // --- State ---
  let floatingBtn = null;
  let popup = null;
  let activeInput = null;
  let isProcessing = false;
  let abortController = null;
  let lastResult = '';          // Store raw result for copy/replace
  let hasAutoFilled = false;   // Only auto-fill once per popup open

  // --- Actions ---
  const ACTIONS = {
    rewrite: { label: '✨ Rewrite', prompt: 'Rewrite the following text to be more clear, professional, and engaging. Keep the same meaning. Only return the rewritten text:' },
    summarize: { label: '📝 Summarize', prompt: 'Summarize the following text concisely into key bullet points. Only return the summary:' },
    expand: { label: '📖 Expand', prompt: 'Expand the following text with more detail, examples, and depth. Only return the expanded version:' },
    grammar: { label: '✅ Fix Grammar', prompt: 'Fix all grammar, spelling, and punctuation errors. Only return the corrected version:' },
    shorter: { label: '✂️ Make Shorter', prompt: 'Make this text more concise while keeping the key message. Only return the shortened version:' },
    translate_cn: { label: '🌐 → 中文', prompt: 'Translate the following text to Simplified Chinese. Only return the translation:' },
    translate_en: { label: '🌐 → English', prompt: 'Translate the following text to English. Only return the translation:' },
    casual: { label: '😊 More Casual', prompt: 'Rewrite in a casual, friendly, conversational tone. Only return the rewritten text:' },
    professional: { label: '💼 Professional', prompt: 'Rewrite in a highly professional, business tone. Only return the rewritten text:' },
    reply: { label: '💬 Smart Reply', prompt: 'Write a thoughtful, appropriate reply to this message. Only return the reply:' }
  };

  // --- Safe DOM helpers ---
  function safeAppend(el, parent) {
    const target = parent || document.body;
    if (!target) return false;
    try { target.appendChild(el); return true; } catch (e) { return false; }
  }
  function safeRemove(el) {
    if (!el || !el.parentNode) return;
    try { el.remove(); } catch (_) {}
  }

  // --- API Key ---
  async function getApiKey() {
    return new Promise(resolve => {
      chrome.storage.local.get(['apiKey'], r => resolve(r.apiKey || null));
    });
  }
  async function getStorage(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }

  // --- API Key validation ---
  function isValidApiKey(key) {
    return key && key.startsWith('sk-') && key.length >= 35 && /^[a-zA-Z0-9_-]+$/.test(key);
  }

  // --- Usage limit check ---
  async function checkUsageLimit() {
    const data = await getStorage(['usageCount', 'usageDate', 'dailyLimit', 'plan']);
    const today = new Date().toDateString();
    const count = data.usageDate === today ? (data.usageCount || 0) : 0;
    const limit = data.dailyLimit || 20;
    if (count >= limit) {
      const plan = data.plan || 'Free';
      throw new Error(plan === 'Free'
        ? '🚫 Free limit (20/day). Upgrade to Pro: 500/day → xiaoqi.lemonsqueezy.com'
        : '🚫 Daily limit reached (' + limit + '/day). Upgrade your plan for more.');
    }
    return true;
  }

  // --- AI Call ---
  async function callAI(text, actionKey, signal) {
    // Check usage before making API call
    await checkUsageLimit();

    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('Click the extension icon and enter your DeepSeek API key. Get one free: platform.deepseek.com');
    }
    if (!isValidApiKey(apiKey)) {
      throw new Error('Invalid API key format. It should start with "sk-" and be at least 35 characters. Get one at platform.deepseek.com');
    }

    const action = ACTIONS[actionKey];
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 2048,
        messages: [{ role: 'user', content: action.prompt + '\n\n' + text }]
      }),
      signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error('Invalid API key. Get a new one at platform.deepseek.com');
      if (response.status === 429) throw new Error('Rate limit reached. Please wait a moment and try again.');
      if (response.status === 402) throw new Error('DeepSeek account balance is low. Please top up at platform.deepseek.com');
      throw new Error(err.error?.message || 'API error: ' + response.status);
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content;
    if (!result) throw new Error('No response from AI. Please try again.');
    return result.trim();
  }

  // --- UI: Floating Button ---
  function createFloatingButton() {
    const btn = document.createElement('button');
    btn.className = 'aiw-floating-btn';
    btn.innerHTML = '✨';
    btn.title = 'AI Writer Pro (Ctrl+Shift+K)';
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); togglePopup(); });
    safeAppend(btn);
    return btn;
  }

  // --- UI: Popup ---
  function createPopup() {
    const el = document.createElement('div');
    el.className = 'aiw-popup';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="aiw-popup-header">
        <h3>✨ AI Writer Pro</h3>
        <button class="aiw-popup-close" title="Close (Esc)">×</button>
      </div>
      <div class="aiw-popup-body">
        <textarea class="aiw-input-area" placeholder="Type or paste text here, or select text on the page..."></textarea>
        <div class="aiw-actions">
          ${Object.entries(ACTIONS).map(([key, a]) =>
            `<button class="aiw-action-btn" data-action="${key}">${a.label}</button>`
          ).join('')}
        </div>
        <div class="aiw-result" style="display:none;"></div>
      </div>
    `;

    el.querySelector('.aiw-popup-close').addEventListener('click', (e) => { e.stopPropagation(); hidePopup(); });

    const textarea = el.querySelector('.aiw-input-area');

    // Auto-fill from selection on first focus
    textarea.addEventListener('focus', () => {
      if (!hasAutoFilled && !textarea.value) {
        const sel = window.getSelection().toString().trim();
        if (sel) { textarea.value = sel; hasAutoFilled = true; }
      }
    });

    // Clear result when user types new text
    textarea.addEventListener('input', () => {
      const resultEl = el.querySelector('.aiw-result');
      if (resultEl.style.display !== 'none') {
        resultEl.style.display = 'none';
        lastResult = '';
      }
    });

    // Action buttons
    el.querySelectorAll('.aiw-action-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const action = btn.dataset.action;
        const text = textarea.value.trim();
        if (!text) {
          textarea.focus();
          textarea.style.borderColor = '#ef4444';
          setTimeout(() => textarea.style.borderColor = '', 1500);
          return;
        }
        await handleAction(action, text, el, textarea);
      });
    });

    safeAppend(el);
    return el;
  }

  // --- Handle AI Action ---
  async function handleAction(actionKey, text, popupEl, textarea) {
    if (isProcessing) return;
    isProcessing = true;

    const resultEl = popupEl.querySelector('.aiw-result');
    const actionBtns = popupEl.querySelectorAll('.aiw-action-btn');

    // Show loading with cancel button
    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      <div class="aiw-loading">
        <span>AI is working</span>
        <div class="aiw-loading-dot"></div>
        <div class="aiw-loading-dot"></div>
        <div class="aiw-loading-dot"></div>
        <button class="aiw-action-btn aiw-cancel-btn" style="margin-left:12px;">Cancel</button>
      </div>
    `;
    actionBtns.forEach(b => b.disabled = true);

    // Cancel handler
    abortController = new AbortController();
    resultEl.querySelector('.aiw-cancel-btn')?.addEventListener('click', () => {
      abortController.abort();
      isProcessing = false;
      actionBtns.forEach(b => b.disabled = false);
      resultEl.innerHTML = '<div style="color:#94a3b8;font-size:13px;padding:12px;">Cancelled.</div>';
      abortController = null;
    });

    try {
      lastResult = await callAI(text, actionKey, abortController.signal);

      // Track usage
      chrome.runtime.sendMessage({ type: 'incrementUsage' }).catch(() => {});

      // Show result
      resultEl.innerHTML = lastResult.replace(/\n/g, '<br>');
      resultEl.innerHTML += `
        <div class="aiw-result-actions">
          <button class="aiw-action-btn aiw-primary aiw-copy-btn">📋 Copy</button>
          <button class="aiw-action-btn aiw-replace-btn">🔄 Replace</button>
          <button class="aiw-action-btn aiw-retry-btn" data-action="${actionKey}">🔄 Retry</button>
        </div>
      `;

      // Copy — uses stored lastResult, not innerText
      resultEl.querySelector('.aiw-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(lastResult).then(() => showToast('Copied! ✓')).catch(() => showToast('Copy failed'));
      });

      // Replace into textarea and tracked active input
      resultEl.querySelector('.aiw-replace-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        textarea.value = lastResult;
        if (activeInput && document.contains(activeInput)) {
          activeInput.value = lastResult;
          activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        showToast('Replaced! ✓');
      });

      // Retry
      resultEl.querySelector('.aiw-retry-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handleAction(actionKey, text, popupEl, textarea);
      });

    } catch (err) {
      if (err.name === 'AbortError') return; // Handled by cancel
      resultEl.innerHTML = `<div style="color:#ef4444;font-size:13px;padding:12px;">⚠️ ${escapeHtml(err.message)}</div>`;
      resultEl.innerHTML += `<div class="aiw-result-actions"><button class="aiw-action-btn aiw-retry-btn" data-action="${actionKey}">🔄 Retry</button></div>`;
      resultEl.querySelector('.aiw-retry-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        handleAction(actionKey, text, popupEl, textarea);
      });
    } finally {
      isProcessing = false;
      abortController = null;
      actionBtns.forEach(b => b.disabled = false);
    }
  }

  // --- Escape HTML to prevent XSS ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Popup Positioning ---
  function positionPopup() {
    if (!popup || popup.style.display === 'none') return;
    if (!floatingBtn) return;
    try {
      const btnRect = floatingBtn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pw = Math.min(420, vw - 24);
      const ph = Math.min(560, vh - 80);
      let left = btnRect.left - pw + 52;
      let top = btnRect.top - ph - 12;

      if (left < 12) left = 12;
      if (left + pw > vw - 12) left = vw - pw - 12;
      if (top < 60) top = btnRect.bottom + 12;
      if (top + ph > vh - 12) top = Math.max(12, vh - ph - 12);

      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
      popup.style.width = pw + 'px';
      popup.style.maxHeight = ph + 'px';
    } catch (_) {}
  }

  function showPopup() {
    if (!popup) popup = createPopup();
    if (!popup) return;
    popup.style.display = 'block';
    hasAutoFilled = false;
    lastResult = '';
    positionPopup();

    const textarea = popup.querySelector('.aiw-input-area');
    const sel = window.getSelection().toString().trim();
    if (sel && !textarea.value) { textarea.value = sel; hasAutoFilled = true; }

    // Reset result
    const resultEl = popup.querySelector('.aiw-result');
    if (resultEl) resultEl.style.display = 'none';

    setTimeout(() => textarea.focus(), 100);
  }

  function hidePopup() {
    if (popup) {
      popup.style.display = 'none';
      // Cancel any in-progress request
      if (abortController) {
        abortController.abort();
        abortController = null;
        isProcessing = false;
      }
    }
  }

  function togglePopup() {
    if (popup && popup.style.display === 'block') {
      hidePopup();
    } else {
      showPopup();
    }
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'aiw-toast';
    toast.textContent = msg;
    safeAppend(toast);
    setTimeout(() => safeRemove(toast), 2100);
  }

  // --- Keyboard ---
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
      e.preventDefault();
      togglePopup();
    }
    if (e.key === 'Escape' && popup && popup.style.display === 'block') {
      hidePopup();
    }
  });

  // --- Track active input ---
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el.matches && el.matches('input[type="text"], input:not([type]), input[type="search"], input[type="email"], input[type="url"], textarea, [contenteditable="true"]')) {
      // Don't track our own textarea
      if (!el.classList.contains('aiw-input-area')) {
        activeInput = el;
      }
    }
  });

  // --- Init ---
  function init() {
    if (!document.body) { setTimeout(init, 50); return; }
    floatingBtn = createFloatingButton();
    popup = createPopup();
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup);
  }

  if (document.body) {
    init();
  } else if (document.documentElement) {
    const observer = new MutationObserver(() => {
      if (document.body) { observer.disconnect(); init(); }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); if (!floatingBtn) init(); }, 3000);
  } else {
    setTimeout(init, 100);
  }

})();
