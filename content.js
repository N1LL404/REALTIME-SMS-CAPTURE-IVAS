// IVAS SMS Capture - Content Script
// Monitors #LiveTestSMS for new SMS rows and sends data to the extension

(function () {
  'use strict';

  const POLL_INTERVAL = 2000; // Check every 2 seconds for the table
  const seenKeys = new Set();

  /**
   * Extract SMS data from a single <tr> row
   */
  function extractRowData(row) {
    try {
      // Phone number from .CopyText element
      const phoneEl = row.querySelector('.CopyText');
      const phone = phoneEl ? phoneEl.textContent.trim() : '';

      // Country/Label from h6 > a
      const labelEl = row.querySelector('h6 a');
      const label = labelEl ? labelEl.textContent.trim() : '';

      // Flag image src
      const flagImg = row.querySelector('img');
      const flagSrc = flagImg ? flagImg.src : '';

      // SID (second td)
      const tds = row.querySelectorAll('td');
      const sid = tds.length > 1 ? tds[1].textContent.trim() : '';

      // Paid status (third td)
      const paid = tds.length > 2 ? tds[2].textContent.trim() : '';

      // Limit status (fourth td)
      const limit = tds.length > 3 ? tds[3].textContent.trim() : '';

      // Message content (fifth td)
      const message = tds.length > 4 ? tds[4].textContent.trim() : '';

      // Extract numeric code from the message (first sequence of 4-8 digits)
      const codeMatch = message.match(/\b(\d{4,8})\b/);
      const code = codeMatch ? codeMatch[1] : '';

      if (!phone || !message) return null;

      return {
        phone,
        label,
        flagSrc,
        sid,
        paid,
        limit,
        message,
        code,
        timestamp: Date.now()
      };
    } catch (e) {
      console.error('[IVAS SMS Capture] Error extracting row:', e);
      return null;
    }
  }

  /**
   * Scrape all existing rows from the table
   */
  function scrapeExistingRows() {
    const tbody = document.querySelector('#LiveTestSMS');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    const batch = [];

    rows.forEach(row => {
      const data = extractRowData(row);
      if (data) {
        const key = data.phone + '|' + data.message;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          batch.push(data);
        }
      }
    });

    if (batch.length > 0) {
      chrome.runtime.sendMessage({ type: 'NEW_SMS_BATCH', data: batch });
    }
  }

  /**
   * Set up MutationObserver to watch for new rows
   */
  function observeTable() {
    const tbody = document.querySelector('#LiveTestSMS');
    if (!tbody) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Handle added nodes (new rows)
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            let rows = [];
            if (node.tagName === 'TR') {
              rows.push(node);
            } else {
              rows = Array.from(node.querySelectorAll ? node.querySelectorAll('tr') : []);
            }

            rows.forEach(row => {
              const data = extractRowData(row);
              if (data) {
                const key = data.phone + '|' + data.message;
                if (!seenKeys.has(key)) {
                  seenKeys.add(key);
                  chrome.runtime.sendMessage({ type: 'NEW_SMS', data: data });
                }
              }
            });
          }
        }

        // Also handle characterData and attribute changes (in case content updates in-place)
        if (mutation.type === 'characterData' || mutation.type === 'attributes') {
          const row = mutation.target.closest ? mutation.target.closest('tr') : null;
          if (row) {
            const data = extractRowData(row);
            if (data) {
              const key = data.phone + '|' + data.message;
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                chrome.runtime.sendMessage({ type: 'NEW_SMS', data: data });
              }
            }
          }
        }
      }
    });

    observer.observe(tbody, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    console.log('[IVAS SMS Capture] MutationObserver started on #LiveTestSMS');
  }

  /**
   * Periodically re-scrape to catch any missed rows
   */
  function startPeriodicScrape() {
    setInterval(() => {
      scrapeExistingRows();
    }, 5000);
  }

  /**
   * Wait for the #LiveTestSMS element to appear, then initialize
   */
  function init() {
    const checkInterval = setInterval(() => {
      const tbody = document.querySelector('#LiveTestSMS');
      if (tbody) {
        clearInterval(checkInterval);
        console.log('[IVAS SMS Capture] Found #LiveTestSMS, initializing...');
        scrapeExistingRows();
        observeTable();
        startPeriodicScrape();
      }
    }, POLL_INTERVAL);
  }

  init();
})();
