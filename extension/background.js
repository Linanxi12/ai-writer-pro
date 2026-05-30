// AI Writer Pro - Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Writer Pro installed');

  // Initialize defaults
  chrome.storage.local.get(['usageCount', 'plan'], (data) => {
    if (data.usageCount === undefined) {
      chrome.storage.local.set({ usageCount: 0, plan: 'Free' });
    }
  });

  // Open landing page on install
  chrome.tabs.create({ url: 'https://aiwriter.pro/welcome' });
});

// Reset daily usage counter at midnight
function scheduleDailyReset() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const msUntilMidnight = midnight - now;

  setTimeout(() => {
    chrome.storage.local.set({ usageCount: 0 });
    scheduleDailyReset(); // Re-schedule
  }, msUntilMidnight);
}

scheduleDailyReset();

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'incrementUsage') {
    chrome.storage.local.get(['usageCount'], (data) => {
      const newCount = (data.usageCount || 0) + 1;
      chrome.storage.local.set({ usageCount: newCount });
      sendResponse({ success: true, count: newCount });
    });
    return true; // Keep channel open for async response
  }
});
