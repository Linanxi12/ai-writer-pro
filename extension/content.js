// AI Writer Pro - Content Script
(function() {
  'use strict';

  // Prevent multiple instances
  if (window.__aiWriterLoaded) return;
  window.__aiWriterLoaded = true;

  // --- State ---
  let floatingBtn = null;
  let popup = null;
  let activeInput = null;
  let isProcessing = false;

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

  // --- Safe DOM helper: appends to body when available ---
  function safeAppend(el, parent) {
    const target = parent || document.body;
    if (!target) return false;
    try {
      target.appendChild(el);
      return true;
    } catch (e) {
      // If body is not available (e.g., frameset pages), try documentElement
      if (document.documentElement && target === document.body) {
        try {
          document.documentElement.appendChild(el);
          return true;
        } catch (_) {}
      }
      return false;
    }
  }

  function safeRemove(el) {
    if (!el || !el.parentNode) return;
    try { el.remove(); } catch (_) {}
  }

  // --- API: Direct to DeepSeek (no backend needed!) ---
  async function getApiKey() {
    return new Promise(resolve => {
      chrome.storage.local.get(['apiKey'], result => {
        resolve(result.apiKey || null);
      });
    });
  }

  async function callAI(text, actionKey) {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('Click the extension icon ⚡ and enter your DeepSeek API key. Get one free: platform.deepseek.com');
    }

    const action = ACTIONS[actionKey];
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 2048,
        messages: [{ role: 'user', content: action.prompt + '\n\n' + text }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error('Invalid API key. Get one at platform.deepseek.com');
      throw new Error(err.error?.message || 'API error: ' + response.status);
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content;
    if (!result) throw new Error('No response from AI');
    return result.trim();
  }

  // --- UI ---
  function createFloatingButton() {
    const btn = document.createElement('button');
    btn.className = 'aiw-floating-btn';
    btn.innerHTML = '✨';
    btn.title = 'AI Writer Pro (Ctrl+Shift+K)';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePopup();
    });
    safeAppend(btn);
    return btn;
  }

  function createPopup() {
    const el = document.createElement('div');
    el.className = 'aiw-popup';
    el.style.display = 'none';
    el.style.left = '24px';
    el.style.top = '100px';
    el.innerHTML = `
      <div class="aiw-popup-header">
        <h3>✨ AI Writer Pro</h3>
        <button class="aiw-popup-close">×</button>
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

    // Close button
    el.querySelector('.aiw-popup-close').addEventListener('click', (e) => {
      e.stopPropagation();
      hidePopup();
    });

    // Textarea auto-fill from selection
    const textarea = el.querySelector('.aiw-input-area');
    textarea.addEventListener('focus', () => {
      const selection = window.getSelection().toString().trim();
      if (selection && !textarea.value) {
        textarea.value = selection;
      }
    });

    // Action buttons
    el.querySelectorAll('.aiw-action-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const action = btn.dataset.action;
        const text = textarea.value.trim();
        if (!text) {
          textarea.focus();
          textarea.style.borderColor = '#ef4444';
          setTimeout(() => textarea.style.borderColor = '', 1500);
          return;
        }
        await handleAction(action, text, el);
      });
    });

    safeAppend(el);
    return el;
  }

  async function handleAction(actionKey, text, popupEl) {
    if (isProcessing) return;
    isProcessing = true;

    const resultEl = popupEl.querySelector('.aiw-result');
    const actionBtns = popupEl.querySelectorAll('.aiw-action-btn');

    resultEl.style.display = 'block';
    resultEl.innerHTML = `
      <div class="aiw-loading">
        <span>AI is working</span>
        <div class="aiw-loading-dot"></div>
        <div class="aiw-loading-dot"></div>
        <div class="aiw-loading-dot"></div>
      </div>
    `;
    actionBtns.forEach(b => b.disabled = true);

    try {
      const result = await callAI(text, actionKey);
      resultEl.innerHTML = result.replace(/\n/g, '<br>');
      resultEl.innerHTML += `
        <div class="aiw-result-actions">
          <button class="aiw-action-btn aiw-primary aiw-copy-btn">📋 Copy</button>
          <button class="aiw-action-btn aiw-replace-btn">🔄 Replace Input</button>
        </div>
      `;

      resultEl.querySelector('.aiw-copy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const plain = resultEl.innerText.replace('📋 Copy', '').replace('🔄 Replace Input', '').trim();
        navigator.clipboard.writeText(plain).catch(() => {});
        showToast('Copied! ✓');
      });

      resultEl.querySelector('.aiw-replace-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const plain = resultEl.innerText.replace('📋 Copy', '').replace('🔄 Replace Input', '').trim();
        const ta = popupEl.querySelector('.aiw-input-area');
        ta.value = plain;
        if (activeInput) {
          activeInput.value = plain;
          activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        showToast('Replaced! ✓');
      });
    } catch (err) {
      resultEl.innerHTML = `<div style="color:#ef4444;font-size:13px;">⚠️ ${err.message}</div>`;
    } finally {
      isProcessing = false;
      actionBtns.forEach(b => b.disabled = false);
    }
  }

  function positionPopup() {
    if (!popup || popup.style.display === 'none') return;
    if (!floatingBtn) return;

    try {
      const btnRect = floatingBtn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pw = 420;
      let left = btnRect.left - pw + 52;
      let top = btnRect.top - 540;

      if (left < 12) left = 12;
      if (left + pw > vw - 12) left = vw - pw - 12;
      if (top < 60) top = btnRect.bottom + 12;
      if (top + 540 > vh - 12) top = vh - 540 - 12;
      if (top < 12) top = 12;

      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
    } catch (_) {}
  }

  function showPopup() {
    if (!popup) popup = createPopup();
    if (!popup) return;
    popup.style.display = 'block';
    positionPopup();

    const textarea = popup.querySelector('.aiw-input-area');
    const selection = window.getSelection().toString().trim();
    if (selection) textarea.value = selection;
    setTimeout(() => textarea.focus(), 100);
  }

  function hidePopup() {
    if (popup) popup.style.display = 'none';
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
      activeInput = el;
    }
  });

  // --- Init: wait for body ---
  function init() {
    if (!document.body) {
      // Body not ready yet — rare but possible (e.g., scripts in <head> on slow pages)
      setTimeout(init, 50);
      return;
    }
    floatingBtn = createFloatingButton();
    popup = createPopup();
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup);
  }

  // Run as soon as body is available
  if (document.body) {
    init();
  } else {
    // Wait for body to appear (handles edge cases like frames, XHTML, etc.)
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        init();
      }
    });
    observer.observe(document.documentElement || document, { childList: true, subtree: true });
    // Fallback timeout
    setTimeout(() => {
      observer.disconnect();
      if (!floatingBtn) init();
    }, 3000);
  }

})();
