// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Relay messages from content script to side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NEW_SMS_BATCH' || message.type === 'NEW_SMS') {
    // Store in chrome.storage.local
    if (message.type === 'NEW_SMS_BATCH') {
      chrome.storage.local.get(['smsData'], (result) => {
        const existing = result.smsData || [];
        const existingKeys = new Set(existing.map(e => e.phone + '|' + e.message));
        const newEntries = message.data.filter(e => !existingKeys.has(e.phone + '|' + e.message));
        if (newEntries.length > 0) {
          const updated = [...newEntries, ...existing];
          chrome.storage.local.set({ smsData: updated });
        }
      });
    } else if (message.type === 'NEW_SMS') {
      chrome.storage.local.get(['smsData'], (result) => {
        const existing = result.smsData || [];
        const key = message.data.phone + '|' + message.data.message;
        const exists = existing.some(e => (e.phone + '|' + e.message) === key);
        if (!exists) {
          const updated = [message.data, ...existing];
          chrome.storage.local.set({ smsData: updated });
        }
      });
    }
  }

  if (message.type === 'CLEAR_ALL') {
    chrome.storage.local.set({ smsData: [] });
  }

  return true;
});
