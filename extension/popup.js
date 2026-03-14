document.addEventListener('DOMContentLoaded', () => {
  const serverUrlInput = document.getElementById('serverUrl');
  const passwordInput = document.getElementById('password');
  const enabledInput = document.getElementById('enabled');
  const saveBtn = document.getElementById('saveBtn');
  const dashBtn = document.getElementById('dashBtn');
  const status = document.getElementById('status');

  chrome.storage.sync.get(['serverUrl', 'password', 'enabled'], (result) => {
    serverUrlInput.value = result.serverUrl || '';
    passwordInput.value = result.password || '';
    enabledInput.checked = !!result.enabled;
  });

  saveBtn.addEventListener('click', () => {
    chrome.storage.sync.set({
      serverUrl: serverUrlInput.value.replace(/\/+$/, ''),
      password: passwordInput.value,
      enabled: enabledInput.checked
    }, () => {
      status.style.display = 'block';
      setTimeout(() => { status.style.display = 'none'; }, 1500);
    });
  });

  dashBtn.addEventListener('click', () => {
    const url = serverUrlInput.value.replace(/\/+$/, '');
    if (url) chrome.tabs.create({ url });
  });
});
