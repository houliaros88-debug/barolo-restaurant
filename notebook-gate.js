const gate = document.querySelector('#notebook-gate');
const mainContent = document.querySelector('main');
const passkeyInput = document.querySelector('#notebook-passkey');
const unlockButton = document.querySelector('#notebook-unlock');
const gateStatus = document.querySelector('#notebook-gate-status');
const STORAGE_KEY = 'barolo-notebook-passkey-ok';

const setGateStatus = (message, state) => {
  if (!gateStatus) {
    return;
  }
  gateStatus.textContent = message;
  gateStatus.dataset.state = state || '';
};

const loadAdminScript = () => {
  if (document.querySelector('script[data-admin-script]')) {
    return;
  }
  const script = document.createElement('script');
  script.src = 'admin.js';
  script.defer = true;
  script.dataset.adminScript = 'true';
  document.body.appendChild(script);
};

const unlockNotebook = () => {
  if (mainContent) {
    mainContent.hidden = false;
  }
  if (gate) {
    gate.hidden = true;
  }
  loadAdminScript();
};

const submitPasskey = async () => {
  if (!passkeyInput) {
    return;
  }
  const passkey = passkeyInput.value.trim();
  if (!passkey) {
    setGateStatus('Enter the pass key.', 'error');
    return;
  }
  setGateStatus('Checking...', 'loading');
  if (unlockButton) {
    unlockButton.disabled = true;
  }
  try {
    const response = await fetch('/api/notebook-passkey', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ passkey }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Invalid pass key.');
    }
    sessionStorage.setItem(STORAGE_KEY, '1');
    setGateStatus('', '');
    unlockNotebook();
  } catch (error) {
    setGateStatus(error.message || 'Invalid pass key.', 'error');
  } finally {
    if (unlockButton) {
      unlockButton.disabled = false;
    }
  }
};

if (!gate || !mainContent) {
  loadAdminScript();
} else if (sessionStorage.getItem(STORAGE_KEY) === '1') {
  unlockNotebook();
} else {
  if (passkeyInput) {
    passkeyInput.focus();
    passkeyInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitPasskey();
      }
    });
  }
  if (unlockButton) {
    unlockButton.addEventListener('click', submitPasskey);
  }
}
