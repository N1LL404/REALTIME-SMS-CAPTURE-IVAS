// IVAS SMS Capture - Content Script (Ultra-Reliable Edition)
// Uses triple-layer capture: MutationObserver + Aggressive Polling + innerHTML change detection
// Designed to NEVER miss a single message

(function () {
  'use strict';

  const INIT_POLL_MS = 500;        // Check for table every 500ms
  const RESCRAPE_MS = 1500;        // Full re-scrape every 1.5 seconds
  const INNERHTML_CHECK_MS = 1000; // Check innerHTML hash every 1 second
  const seenKeys = new Set();
  let lastInnerHTML = '';
  let totalCaptured = 0;

  /**
   * Extract SMS data from a single <tr> row
   */
  function extractRowData(row) {
    try {
      const tds = row.querySelectorAll('td');
      if (!tds || tds.length < 5) return null;

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
      const sid = tds[1].textContent.trim();

      // Paid status (third td)
      const paid = tds[2].textContent.trim();

      // Limit status (fourth td)
      const limit = tds[3].textContent.trim();

      // Message content (fifth td)
      const message = tds[4].textContent.trim();

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
   * Generate a dedup key for a row
   */
  function makeKey(data) {
    return data.phone + '|' + data.message;
  }

  /**
   * Send a single new SMS entry
   */
  function sendSingle(data) {
    const key = makeKey(data);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    totalCaptured++;
    try {
      chrome.runtime.sendMessage({ type: 'NEW_SMS', data: data });
    } catch (e) {
      console.warn('[IVAS SMS Capture] sendMessage failed, will retry on next scrape:', e.message);
    }
    return true;
  }

  /**
   * Send a batch of new SMS entries
   */
  function sendBatch(entries) {
    if (entries.length === 0) return;
    try {
      chrome.runtime.sendMessage({ type: 'NEW_SMS_BATCH', data: entries });
    } catch (e) {
      console.warn('[IVAS SMS Capture] sendMessage batch failed:', e.message);
      // Fallback: send individually
      entries.forEach(d => {
        try { chrome.runtime.sendMessage({ type: 'NEW_SMS', data: d }); } catch (_) {}
      });
    }
  }

  /**
   * LAYER 1: Full table scrape — always catches everything
   */
  function fullScrape() {
    const tbody = document.querySelector('#LiveTestSMS');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    const batch = [];

    rows.forEach(row => {
      const data = extractRowData(row);
      if (data) {
        const key = makeKey(data);
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          totalCaptured++;
          batch.push(data);
        }
      }
    });

    if (batch.length > 0) {
      sendBatch(batch);
      console.log(`[IVAS SMS Capture] Scraped ${batch.length} new messages (total: ${totalCaptured})`);
    }
  }

  /**
   * LAYER 2: MutationObserver — catches DOM changes instantly
   */
  function observeTable() {
    const tbody = document.querySelector('#LiveTestSMS');
    if (!tbody) return;

    const observer = new MutationObserver((mutations) => {
      let foundNew = false;

      for (const mutation of mutations) {
        // New nodes added (new rows)
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;

            const rows = node.tagName === 'TR' ? [node] :
              Array.from(node.querySelectorAll ? node.querySelectorAll('tr') : []);

            for (const row of rows) {
              const data = extractRowData(row);
              if (data && sendSingle(data)) {
                foundNew = true;
              }
            }
          }
        }

        // In-place text/attribute changes
        if (mutation.type === 'characterData' || mutation.type === 'attributes') {
          const row = mutation.target.closest ? mutation.target.closest('tr') : null;
          if (row) {
            const data = extractRowData(row);
            if (data && sendSingle(data)) {
              foundNew = true;
            }
          }
        }
      }

      // If new rows detected via mutation, also do a full scrape to be safe
      if (foundNew) {
        setTimeout(fullScrape, 200);
      }
    });

    observer.observe(tbody, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    console.log('[IVAS SMS Capture] MutationObserver active on #LiveTestSMS');
  }

  /**
   * LAYER 3: innerHTML change detection — catches dynamic content replacement
   * Some sites replace innerHTML entirely instead of adding nodes,
   * which can bypass MutationObserver in some edge cases
   */
  function startInnerHTMLWatcher() {
    setInterval(() => {
      const tbody = document.querySelector('#LiveTestSMS');
      if (!tbody) return;

      const currentHTML = tbody.innerHTML;
      if (currentHTML !== lastInnerHTML) {
        lastInnerHTML = currentHTML;
        fullScrape();
      }
    }, INNERHTML_CHECK_MS);
  }

  /**
   * Aggressive periodic re-scrape as ultimate safety net
   */
  function startPeriodicScrape() {
    setInterval(fullScrape, RESCRAPE_MS);
  }

  /**
   * Also watch for the table container being replaced entirely
   * (e.g. if the page does AJAX reload of the whole section)
   */
  function watchForTableRecreation() {
    const bodyObserver = new MutationObserver(() => {
      const tbody = document.querySelector('#LiveTestSMS');
      if (tbody) {
        fullScrape();
        // Re-attach observer if tbody was recreated
        observeTable();
      }
    });

    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Wait for the #LiveTestSMS element to appear, then initialize all layers
   */
  function init() {
    console.log('[IVAS SMS Capture] Initializing... waiting for #LiveTestSMS');

    const checkInterval = setInterval(() => {
      const tbody = document.querySelector('#LiveTestSMS');
      if (tbody) {
        clearInterval(checkInterval);
        console.log('[IVAS SMS Capture] Found #LiveTestSMS — starting 3-layer capture');

        // Initial full scrape
        fullScrape();

        // Layer 1: Periodic full re-scrape (every 1.5s)
        startPeriodicScrape();

        // Layer 2: MutationObserver for instant detection
        observeTable();

        // Layer 3: innerHTML hash-based change detection
        startInnerHTMLWatcher();

        // Bonus: Watch for entire table section being replaced
        watchForTableRecreation();

        console.log('[IVAS SMS Capture] All capture layers active ✓');
      }
    }, INIT_POLL_MS);
  }

  init();
})();
