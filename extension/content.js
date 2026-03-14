(() => {
  let config = { serverUrl: '', password: '', enabled: false };
  const instrumented = new WeakSet();

  chrome.storage.sync.get(['serverUrl', 'password', 'enabled'], (result) => {
    config = { serverUrl: result.serverUrl || '', password: result.password || '', enabled: !!result.enabled };
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.serverUrl) config.serverUrl = changes.serverUrl.newValue || '';
    if (changes.password) config.password = changes.password.newValue || '';
    if (changes.enabled !== undefined) config.enabled = !!changes.enabled.newValue;
  });

  function findSendButtons() {
    return document.querySelectorAll('div[aria-label*="Send"], div[data-tooltip*="Send"]');
  }

  function getComposeContext(sendBtn) {
    // Walk up to find the compose container
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

    // Inject tracking pixel
    const img = document.createElement('img');
    const serverUrl = config.serverUrl.replace(/\/+$/, '');
    img.src = `${serverUrl}/t/${emailId}`;
    img.style.display = 'none';
    img.width = 1;
    img.height = 1;
    body.appendChild(img);

    // Fire-and-forget registration
    fetch(`${serverUrl}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dashboard-password': config.password
      },
      body: JSON.stringify({ id: emailId, subject, recipient })
    }).catch(() => {});
  }

  function scanForSendButtons() {
    const buttons = findSendButtons();
    buttons.forEach((btn) => {
      if (instrumented.has(btn)) return;
      instrumented.add(btn);
      btn.addEventListener('click', handleSendClick, true);
    });
  }

  const observer = new MutationObserver(() => {
    scanForSendButtons();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scanForSendButtons();
})();
