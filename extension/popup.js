// AI Writer Pro - Popup Script
document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyBtn = document.getElementById('saveKey');
  const keyStatus = document.getElementById('keyStatus');
  const usageCountEl = document.getElementById('usageCount');
  const planNameEl = document.getElementById('planName');

  // --- Load state ---
  chrome.storage.local.get(['apiKey', 'usageCount', 'plan', 'usageDate'], (data) => {
    if (data.apiKey) {
      // Show masked version
      apiKeyInput.value = data.apiKey.slice(0, 7) + '•••' + data.apiKey.slice(-4);
      apiKeyInput.dataset.realKey = data.apiKey;
      keyStatus.textContent = '✓ API key saved';
      keyStatus.className = 'status success';
    }

    // Check if usage needs daily reset
    const today = new Date().toDateString();
    if (data.usageDate !== today) {
      usageCountEl.textContent = '0';
    } else {
      usageCountEl.textContent = data.usageCount || '0';
    }
    planNameEl.textContent = data.plan || 'Free';
  });

  // --- Show full key on focus, mask on blur ---
  apiKeyInput.addEventListener('focus', () => {
    const realKey = apiKeyInput.dataset.realKey;
    if (realKey) {
      apiKeyInput.value = realKey;
      apiKeyInput.type = 'text';
    }
  });

  apiKeyInput.addEventListener('blur', () => {
    const realKey = apiKeyInput.dataset.realKey || apiKeyInput.value.trim();
    if (realKey && realKey.startsWith('sk-')) {
      apiKeyInput.value = realKey.slice(0, 7) + '•••' + realKey.slice(-4);
      apiKeyInput.type = 'password';
      apiKeyInput.dataset.realKey = realKey;
    }
  });

  // --- Save API key ---
  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.dataset.realKey || apiKeyInput.value.trim();

    if (!key) {
      keyStatus.textContent = 'Please enter your API key';
      keyStatus.className = 'status error';
      return;
    }

    if (!key.startsWith('sk-') || key.length < 35) {
      keyStatus.textContent = 'Invalid key format. Must start with "sk-" and be 35+ characters.';
      keyStatus.className = 'status error';
      return;
    }

    chrome.storage.local.set({ apiKey: key }, () => {
      apiKeyInput.dataset.realKey = key;
      apiKeyInput.value = key.slice(0, 7) + '•••' + key.slice(-4);
      apiKeyInput.type = 'password';
      keyStatus.textContent = '✓ API key saved';
      keyStatus.className = 'status success';
    });
  });

  // --- Usage updates from background ---
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.usageCount) usageCountEl.textContent = changes.usageCount.newValue;
    if (changes.plan) planNameEl.textContent = changes.plan.newValue;
  });

  // --- Upgrade → Lemon Squeezy ---
  const upgradeLink = document.querySelector('.upgrade-link');
  if (upgradeLink) {
    upgradeLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({
        url: 'https://xiaoqi.lemonsqueezy.com/checkout/buy/a9844e25-dc1f-483f-8207-0dec1e5afde2'
      });
    });
  }
});
