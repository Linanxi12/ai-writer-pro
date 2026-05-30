// AI Writer Pro - Popup Script
document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyBtn = document.getElementById('saveKey');
  const keyStatus = document.getElementById('keyStatus');
  const usageCountEl = document.getElementById('usageCount');
  const planNameEl = document.getElementById('planName');

  // Load saved state
  chrome.storage.local.get(['apiKey', 'usageCount', 'plan'], (data) => {
    if (data.apiKey) {
      apiKeyInput.value = data.apiKey;
      keyStatus.textContent = '✓ API key saved';
      keyStatus.className = 'status success';
    }
    usageCountEl.textContent = data.usageCount || 0;
    planNameEl.textContent = data.plan || 'Free';
  });

  // Save API key
  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      keyStatus.textContent = 'Please enter a valid API key';
      keyStatus.className = 'status error';
      return;
    }
    chrome.storage.local.set({ apiKey: key }, () => {
      keyStatus.textContent = '✓ API key saved';
      keyStatus.className = 'status success';
    });
  });

  // Mask API key on blur
  apiKeyInput.addEventListener('blur', () => {
    chrome.storage.local.get(['apiKey'], (data) => {
      if (data.apiKey) apiKeyInput.value = data.apiKey;
    });
  });

  // Listen for usage updates from background
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.usageCount) usageCountEl.textContent = changes.usageCount.newValue;
    if (changes.plan) planNameEl.textContent = changes.plan.newValue;
  });

  // Upgrade button → Lemon Squeezy
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
