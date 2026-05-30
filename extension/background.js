// AI Writer Pro - Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Writer Pro installed');

  // Initialize defaults
  chrome.storage.local.get(['usageCount', 'plan', 'usageDate'], (data) => {
    const today = new Date().toDateString();
    if (data.usageDate !== today) {
      chrome.storage.local.set({ usageCount: 0, usageDate: today, plan: data.plan || 'Free' });
    } else if (data.usageCount === undefined) {
      chrome.storage.local.set({ usageCount: 0, plan: 'Free', usageDate: today });
    }
  });

  // Open landing page on install
  chrome.tabs.create({ url: 'https://linanxi12.github.io/ai-writer-pro/' });
});

// Daily usage reset using chrome.alarms (reliable in service workers)
chrome.alarms.create('dailyReset', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    const today = new Date().toDateString();
    chrome.storage.local.get(['usageDate'], (data) => {
      if (data.usageDate !== today) {
        chrome.storage.local.set({ usageCount: 0, usageDate: today });
        console.log('Daily usage reset');
      }
    });
  }
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'incrementUsage') {
    chrome.storage.local.get(['usageCount', 'usageDate'], (data) => {
      const today = new Date().toDateString();
      const count = (data.usageDate === today ? data.usageCount : 0) + 1;
      chrome.storage.local.set({ usageCount: count, usageDate: today });
      sendResponse({ success: true, count: count });
    });
    return true;
  }
});
