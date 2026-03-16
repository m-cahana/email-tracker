(() => {
  let config = { serverUrl: '', password: '', enabled: false };
  const instrumented = new WeakSet();
  let trackedEmails = new Map(); // key: "subject||recipient" -> { id, opened }

  chrome.storage.sync.get(['serverUrl', 'password', 'enabled'], (result) => {
    config = { serverUrl: result.serverUrl || '', password: result.password || '', enabled: !!result.enabled };
    fetchStatuses();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.serverUrl) config.serverUrl = changes.serverUrl.newValue || '';
    if (changes.password) config.password = changes.password.newValue || '';
    if (changes.enabled !== undefined) config.enabled = !!changes.enabled.newValue;
  });

  // --- Send button interception (existing) ---

  function findSendButtons() {
    return document.querySelectorAll('div[aria-label*="Send"], div[data-tooltip*="Send"]');
  }

  function getComposeContext(sendBtn) {
    let container = sendBtn.closest('div.M9, div[role="dialog"], div.AD');
    if (!container) container = sendBtn.closest('table')?.closest('div');
    if (!container) container = document.body;

    const subjectEl = container.querySelector('input[name="subjectbox"]');
    const subject = subjectEl ? subjectEl.value : '(no subject)';

    let recipient = '';
    const emailSpan = container.querySelector('span[email]');
    if (emailSpan) {
      recipient = emailSpan.getAttribute('email');
    } else {
      const toInput = container.querySelector('input[aria-label="To"]');
      if (toInput) recipient = toInput.value;
    }

    const body = container.querySelector('div[aria-label="Message Body"]');
    return { subject, recipient, body };
  }

  function handleSendClick(e) {
    if (!config.enabled || !config.serverUrl) return;

    const sendBtn = e.currentTarget;
    const { subject, recipient, body } = getComposeContext(sendBtn);
    if (!body) return;

    const emailId = crypto.randomUUID();

    const img = document.createElement('img');
    const serverUrl = config.serverUrl.replace(/\/+$/, '');
    img.src = `${serverUrl}/t/${emailId}`;
    img.style.display = 'none';
    img.width = 1;
    img.height = 1;
    body.appendChild(img);

    // Register with server
    fetch(`${serverUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dashboard-password': config.password
      },
      body: JSON.stringify({ id: emailId, subject, recipient })
    }).catch(() => {});

    // Update local state immediately (show single checkmark)
    const key = makeKey(subject, recipient);
    trackedEmails.set(key, { id: emailId, opened: false });
    debouncedScan();
  }

  function scanForSendButtons() {
    const buttons = findSendButtons();
    buttons.forEach((btn) => {
      if (instrumented.has(btn)) return;
      instrumented.add(btn);
      btn.addEventListener('click', handleSendClick, true);
    });
  }

  // --- Status tracking ---

  function makeKey(subject, recipient) {
    return (subject || '').toLowerCase().trim() + '||' + (recipient || '').toLowerCase().trim();
  }

  async function fetchStatuses() {
    if (!config.enabled || !config.serverUrl) return;
    try {
      const serverUrl = config.serverUrl.replace(/\/+$/, '');
      const res = await fetch(`${serverUrl}/api/status`, {
        headers: { 'x-dashboard-password': config.password }
      });
      if (!res.ok) return;
      const { emails } = await res.json();
      trackedEmails.clear();
      for (const e of emails) {
        const key = makeKey(e.subject, e.recipient);
        trackedEmails.set(key, { id: e.id, opened: !!e.opened });
      }
      debouncedScan();
    } catch (err) {
      // silently fail
    }
  }

  // Poll every 30s
  setInterval(fetchStatuses, 30000);

  // --- DOM injection ---

  function getCheckmarkSVG(opened) {
    // Single checkmark = tracked, double = opened
    const color = '#2563eb';
    if (opened) {
      // Double checkmark
      return `<svg width="18" height="14" viewBox="0 0 18 14" style="vertical-align:middle;margin-right:4px;">
        <polyline points="1,7 4.5,11 11,3" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="6,7 9.5,11 16,3" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    }
    // Single checkmark
    return `<svg width="12" height="14" viewBox="0 0 12 14" style="vertical-align:middle;margin-right:4px;">
      <polyline points="1,7 4.5,11 11,3" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }

  function scanAndInjectIndicators() {
    if (trackedEmails.size === 0) return;

    // Gmail email list rows have class 'zA'
    const rows = document.querySelectorAll('tr.zA');
    for (const row of rows) {
      // Get subject text
      const subjectSpan = row.querySelector('.bog, .bqe');
      if (!subjectSpan) continue;
      const subject = subjectSpan.textContent.trim();

      // Get recipient/sender email
      let recipient = '';
      const emailEl = row.querySelector('span[email]');
      if (emailEl) recipient = emailEl.getAttribute('email');

      const key = makeKey(subject, recipient);
      const status = trackedEmails.get(key);

      // Find or create indicator container
      const subjectCell = subjectSpan.closest('.xY, .a4W') || subjectSpan.parentElement;
      let indicator = row.querySelector('[data-email-tracker]');

      if (status) {
        const desiredState = status.opened ? 'opened' : 'tracked';
        if (indicator && indicator.dataset.emailTrackerState === desiredState) continue;

        if (!indicator) {
          indicator = document.createElement('span');
          indicator.dataset.emailTracker = '1';
          indicator.style.cssText = 'display:inline-flex;align-items:center;flex-shrink:0;';
          subjectCell.insertBefore(indicator, subjectCell.firstChild);
        }
        indicator.dataset.emailTrackerState = desiredState;
        indicator.innerHTML = getCheckmarkSVG(status.opened);
      } else if (indicator) {
        indicator.remove();
      }
    }
  }

  let scanTimeout = null;
  function debouncedScan() {
    if (scanTimeout) clearTimeout(scanTimeout);
    scanTimeout = setTimeout(scanAndInjectIndicators, 200);
  }

  // --- Observer ---

  const observer = new MutationObserver(() => {
    scanForSendButtons();
    debouncedScan();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scanForSendButtons();

  // Re-scan on navigation within Gmail
  let lastHash = location.hash;
  setInterval(() => {
    if (location.hash !== lastHash) {
      lastHash = location.hash;
      debouncedScan();
    }
  }, 500);
})();
