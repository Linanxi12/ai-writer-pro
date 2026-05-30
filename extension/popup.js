// AI Writer Pro - Popup Script
const API_SERVER = 'https://aiwriter-api.onrender.com'; // Will update after deploy

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyBtn = document.getElementById('saveKey');
  const keyStatus = document.getElementById('keyStatus');
  const licenseInput = document.getElementById('licenseKey');
  const saveLicenseBtn = document.getElementById('saveLicense');
  const licenseStatus = document.getElementById('licenseStatus');
  const usageCountEl = document.getElementById('usageCount');
  const planNameEl = document.getElementById('planName');

  // --- Load state ---
  chrome.storage.local.get(['apiKey', 'licenseKey', 'plan', 'dailyLimit', 'usageCount', 'usageDate'], (data) => {
    // API key
    if (data.apiKey) {
      apiKeyInput.value = data.apiKey.slice(0, 7) + '•••' + data.apiKey.slice(-4);
      apiKeyInput.dataset.realKey = data.apiKey;
      keyStatus.textContent = '✓ Key saved';
      keyStatus.className = 'status success';
    }
    // License key
    if (data.licenseKey) {
      licenseInput.value = data.licenseKey.slice(0, 12) + '•••' + data.licenseKey.slice(-4);
      licenseInput.dataset.realKey = data.licenseKey;
      licenseStatus.textContent = '✓ ' + (data.plan || 'Pro') + ' · ' + (data.dailyLimit || 500) + '/day';
      licenseStatus.className = 'status success';
    }
    // Usage
    const today = new Date().toDateString();
    usageCountEl.textContent = (data.usageDate === today ? data.usageCount : 0) || '0';
    planNameEl.textContent = data.plan || 'Free';
  });

  // --- API Key: Show full on focus, mask on blur ---
  apiKeyInput.addEventListener('focus', () => {
    const real = apiKeyInput.dataset.realKey;
    if (real) { apiKeyInput.value = real; apiKeyInput.type = 'text'; }
  });
  apiKeyInput.addEventListener('blur', () => {
    const real = apiKeyInput.dataset.realKey || apiKeyInput.value.trim();
    if (real?.startsWith('sk-')) {
      apiKeyInput.value = real.slice(0, 7) + '•••' + real.slice(-4);
      apiKeyInput.type = 'password';
      apiKeyInput.dataset.realKey = real;
    }
  });

  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.dataset.realKey || apiKeyInput.value.trim();
    if (!key) { keyStatus.textContent = 'Enter your key'; keyStatus.className = 'status error'; return; }
    if (!key.startsWith('sk-') || key.length < 35) { keyStatus.textContent = 'Invalid format'; keyStatus.className = 'status error'; return; }
    chrome.storage.local.set({ apiKey: key }, () => {
      apiKeyInput.dataset.realKey = key;
      apiKeyInput.value = key.slice(0, 7) + '•••' + key.slice(-4);
      apiKeyInput.type = 'password';
      keyStatus.textContent = '✓ Key saved';
      keyStatus.className = 'status success';
    });
  });

  // --- License Key: verify with server ---
  licenseInput.addEventListener('focus', () => {
    const real = licenseInput.dataset.realKey;
    if (real) { licenseInput.value = real; licenseInput.type = 'text'; }
  });
  licenseInput.addEventListener('blur', () => {
    const real = licenseInput.dataset.realKey || licenseInput.value.trim();
    if (real?.startsWith('AIW-')) {
      licenseInput.value = real.slice(0, 12) + '•••' + real.slice(-4);
      licenseInput.type = 'password';
      licenseInput.dataset.realKey = real;
    }
  });

  saveLicenseBtn.addEventListener('click', async () => {
    const key = licenseInput.dataset.realKey || licenseInput.value.trim();
    if (!key) { licenseStatus.textContent = 'Enter license key'; licenseStatus.className = 'status error'; return; }
    if (!key.startsWith('AIW-')) { licenseStatus.textContent = 'Invalid format (AIW-...)'; licenseStatus.className = 'status error'; return; }

    licenseStatus.textContent = 'Verifying...';
    licenseStatus.className = 'status';

    try {
      const res = await fetch(API_SERVER + '/v1/verify-license/' + encodeURIComponent(key));
      const data = await res.json();
      if (data.valid) {
        chrome.storage.local.set({
          licenseKey: key,
          plan: data.plan,
          dailyLimit: data.daily_limit
        }, () => {
          licenseInput.dataset.realKey = key;
          licenseInput.value = key.slice(0, 12) + '•••' + key.slice(-4);
          licenseInput.type = 'password';
          licenseStatus.textContent = '✓ ' + data.plan.toUpperCase() + ' · ' + data.daily_limit + '/day';
          licenseStatus.className = 'status success';
          planNameEl.textContent = data.plan;
        });
      } else {
        licenseStatus.textContent = 'Invalid license key';
        licenseStatus.className = 'status error';
        chrome.storage.local.remove(['licenseKey', 'plan', 'dailyLimit']);
        planNameEl.textContent = 'Free';
      }
    } catch (_) {
      licenseStatus.textContent = 'Server unreachable. Try again.';
      licenseStatus.className = 'status error';
    }
  });

  // --- Usage updates ---
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
