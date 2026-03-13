// IVAS SMS Capture - Side Panel Logic

(function () {
  'use strict';

  let allMessages = [];

  const messageList = document.getElementById('messageList');
  const emptyState = document.getElementById('emptyState');
  const totalCount = document.getElementById('totalCount');
  const searchInput = document.getElementById('searchInput');
  const copyAllBtn = document.getElementById('copyAllBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');

  /**
   * Show toast notification
   */
  function showToast(msg) {
    toastMessage.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  /**
   * Format timestamp
   */
  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /**
   * Create a single SMS card element
   */
  function createCardEl(sms) {
    const card = document.createElement('div');
    card.className = 'sms-card';

    const paidClass = sms.paid.toLowerCase().includes('paid') ? 'status-paid' : 'status-unpaid';
    const paidLabel = sms.paid.toLowerCase().includes('paid') ? 'Paid' : 'Unpaid';

    card.innerHTML = `
      <div class="sms-card-header">
        <div class="sms-card-identity">
          ${sms.flagSrc ? `<img class="sms-flag" src="${sms.flagSrc}" alt="flag">` : ''}
          <div>
            <div class="sms-label">${escapeHtml(sms.label)}</div>
            <div class="sms-phone">${escapeHtml(sms.phone)}</div>
          </div>
        </div>
        <span class="sms-sid-badge">${escapeHtml(sms.sid)}</span>
      </div>
      <div class="sms-message">${highlightCode(escapeHtml(sms.message))}</div>
      <div class="sms-card-footer">
        <div class="sms-meta">
          <span class="sms-status ${paidClass}">${paidLabel}</span>
          <span class="sms-time">${formatTime(sms.timestamp)}</span>
        </div>
        <button class="sms-copy-btn" data-phone="${escapeHtml(sms.phone)}" data-code="${escapeHtml(sms.code)}">
          <i class="fas fa-copy"></i> Copy
        </button>
      </div>
    `;

    // Single card copy button
    const copyBtn = card.querySelector('.sms-copy-btn');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const phone = copyBtn.dataset.phone;
      const code = copyBtn.dataset.code;
      const text = `${phone}|${code}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied: ${text}`);
      });
    });

    return card;
  }

  /**
   * Escape HTML
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /**
   * Highlight numeric codes in message text
   */
  function highlightCode(text) {
    return text.replace(/\b(\d{4,8})\b/, '<span class="sms-code">$1</span>');
  }

  /**
   * Render the message list from allMessages, applying search filter
   */
  function renderMessages() {
    const query = searchInput.value.toLowerCase().trim();

    // Filter messages
    const filtered = query
      ? allMessages.filter(sms =>
          sms.phone.toLowerCase().includes(query) ||
          sms.sid.toLowerCase().includes(query) ||
          sms.message.toLowerCase().includes(query) ||
          sms.label.toLowerCase().includes(query)
        )
      : allMessages;

    // Clear existing cards (but keep empty state)
    const cards = messageList.querySelectorAll('.sms-card');
    cards.forEach(c => c.remove());

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
    } else {
      emptyState.style.display = 'none';
      filtered.forEach(sms => {
        messageList.appendChild(createCardEl(sms));
      });
    }

    totalCount.textContent = allMessages.length;
  }

  /**
   * Load messages from chrome.storage.local
   */
  function loadFromStorage() {
    chrome.storage.local.get(['smsData'], (result) => {
      allMessages = result.smsData || [];
      renderMessages();
    });
  }

  /**
   * Listen for storage changes to auto-update
   */
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.smsData) {
      allMessages = changes.smsData.newValue || [];
      renderMessages();
    }
  });

  /**
   * Copy All button — formats as phone|code
   */
  copyAllBtn.addEventListener('click', () => {
    if (allMessages.length === 0) {
      showToast('No messages to copy');
      return;
    }

    const lines = allMessages
      .filter(sms => sms.phone && sms.code)
      .map(sms => `${sms.phone}|${sms.code}`)
      .join('\n');

    if (!lines) {
      showToast('No codes found in messages');
      return;
    }

    navigator.clipboard.writeText(lines).then(() => {
      showToast(`Copied ${lines.split('\n').length} entries!`);
    }).catch(() => {
      // Fallback for clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = lines;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(`Copied ${lines.split('\n').length} entries!`);
    });
  });

  /**
   * Clear All button
   */
  clearAllBtn.addEventListener('click', () => {
    if (allMessages.length === 0) return;
    if (confirm('Clear all captured SMS messages?')) {
      allMessages = [];
      chrome.storage.local.set({ smsData: [] });
      renderMessages();
      showToast('All messages cleared');
    }
  });

  /**
   * Search input
   */
  searchInput.addEventListener('input', () => {
    renderMessages();
  });

  // Initial load
  loadFromStorage();
})();
