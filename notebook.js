const notesList = document.querySelector('#notes-list');
const notesStatus = document.querySelector('#notes-status');
const noteInput = document.querySelector('#note-input');
const noteAddButton = document.querySelector('#note-add');
const categoryButtons = document.querySelectorAll('[data-category]');
const passkeyInput = document.querySelector('#notebook-passkey');
const unlockButton = document.querySelector('#notebook-unlock');
const gateStatus = document.querySelector('#notebook-gate-status');
const gate = document.querySelector('#notebook-gate');
const mainContent = document.querySelector('main');

const PASSKEY_KEY = 'barolo-notebook-passkey';
const PASSKEY_COOKIE = 'barolo_notebook_passkey';
const CATEGORY_KEY = 'barolo-notebook-category';
const CATEGORIES = ['barolo', 'harem'];
const savedCategory = sessionStorage.getItem(CATEGORY_KEY);

let notes = [];
let currentCategory = CATEGORIES.includes(savedCategory) ? savedCategory : 'barolo';

const setNotesStatus = (message, state) => {
  if (!notesStatus) {
    return;
  }
  notesStatus.textContent = message;
  notesStatus.dataset.state = state || '';
};

const setGateStatus = (message, state) => {
  if (!gateStatus) {
    return;
  }
  gateStatus.textContent = message;
  gateStatus.dataset.state = state || '';
};

const readCookie = (name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
};

const getPasskey = () => sessionStorage.getItem(PASSKEY_KEY) || readCookie(PASSKEY_COOKIE);

const clearPasskey = () => {
  sessionStorage.removeItem(PASSKEY_KEY);
  document.cookie = `${PASSKEY_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
};

const showGate = (message) => {
  if (mainContent) {
    mainContent.hidden = true;
  }
  if (gate) {
    gate.hidden = false;
  }
  setNotebookEnabled(false);
  if (message) {
    setGateStatus(message, 'error');
  }
};

const hideGate = () => {
  if (mainContent) {
    mainContent.hidden = false;
  }
  if (gate) {
    gate.hidden = true;
  }
  setGateStatus('', '');
};

const setNotebookEnabled = (isEnabled) => {
  if (noteInput) {
    noteInput.disabled = !isEnabled;
  }
  if (noteAddButton) {
    noteAddButton.disabled = !isEnabled;
  }
  categoryButtons.forEach((button) => {
    button.disabled = !isEnabled;
  });
};

const setActiveCategory = (category, shouldLoad = true) => {
  const nextCategory = CATEGORIES.includes(category) ? category : 'barolo';
  if (nextCategory === currentCategory && shouldLoad) {
    return;
  }
  currentCategory = nextCategory;
  sessionStorage.setItem(CATEGORY_KEY, currentCategory);
  categoryButtons.forEach((button) => {
    const isActive = button.dataset.category === currentCategory;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  if (shouldLoad) {
    if (!getPasskey()) {
      showGate('Enter the pass key to view notes.');
      return;
    }
    loadNotes();
  }
};

const renderNotes = () => {
  if (!notesList) {
    return;
  }
  notesList.textContent = '';
  if (!notes.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No notes yet.';
    empty.className = 'admin-hint';
    notesList.appendChild(empty);
    return;
  }
  notes.forEach((note) => {
    const item = document.createElement('label');
    item.className = `admin-note${note.done ? ' done' : ''}`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(note.done);
    checkbox.addEventListener('change', () => {
      updateNote(note.id, checkbox.checked);
    });

    const text = document.createElement('span');
    text.className = 'admin-note-text';
    text.textContent = note.text;

    item.appendChild(checkbox);
    item.appendChild(text);
    notesList.appendChild(item);
  });
};

const notebookFetch = async (path, options = {}) => {
  const passkey = getPasskey();
  const headers = {
    ...(options.headers || {}),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (passkey) {
    headers['x-notebook-passkey'] = passkey;
  }
  return fetch(path, { ...options, headers, credentials: 'same-origin' });
};

const loadNotes = async () => {
  if (!notesList) {
    return;
  }
  if (!getPasskey()) {
    setNotesStatus('', '');
    showGate('Enter the pass key to view notes.');
    return;
  }
  setNotesStatus('Loading notes...', 'loading');
  try {
    const response = await notebookFetch(
      `/api/notebook-notes?category=${encodeURIComponent(currentCategory)}`
    );
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        clearPasskey();
        setNotesStatus('', '');
        showGate(data.error || 'Invalid pass key.');
        return;
      }
      throw new Error(data.error || 'Failed to load notes.');
    }
    notes = Array.isArray(data.notes) ? data.notes : [];
    renderNotes();
    setNotesStatus('', '');
    setGateStatus('', '');
  } catch (error) {
    setNotesStatus(error.message || 'Failed to load notes.', 'error');
  }
};

const addNote = async () => {
  if (!noteInput) {
    return;
  }
  if (!getPasskey()) {
    showGate('Enter the pass key to add notes.');
    return;
  }
  const text = noteInput.value.trim();
  if (!text) {
    setNotesStatus('Please enter a note.', 'error');
    return;
  }
  setNotesStatus('Saving note...', 'loading');
  if (noteAddButton) {
    noteAddButton.disabled = true;
  }
  try {
    const response = await notebookFetch('/api/notebook-notes', {
      method: 'POST',
      body: JSON.stringify({ text, category: currentCategory }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        clearPasskey();
        setNotesStatus('', '');
        showGate(data.error || 'Invalid pass key.');
        return;
      }
      throw new Error(data.error || 'Failed to save note.');
    }
    const created = data.note;
    if (created) {
      notes = [created, ...notes];
      renderNotes();
    } else {
      loadNotes();
    }
    noteInput.value = '';
    setNotesStatus('', '');
  } catch (error) {
    setNotesStatus(error.message || 'Failed to save note.', 'error');
  } finally {
    if (noteAddButton) {
      noteAddButton.disabled = false;
    }
  }
};

const updateNote = async (id, done) => {
  if (!getPasskey()) {
    showGate('Enter the pass key to update notes.');
    return;
  }
  const previous = notes.find((note) => note.id === id);
  notes = notes.map((note) => (note.id === id ? { ...note, done } : note));
  renderNotes();
  try {
    const response = await notebookFetch('/api/notebook-notes', {
      method: 'PATCH',
      body: JSON.stringify({ id, done, category: currentCategory }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        clearPasskey();
        setNotesStatus('', '');
        showGate(data.error || 'Invalid pass key.');
        return;
      }
      throw new Error(data.error || 'Failed to update note.');
    }
    if (data.note) {
      notes = notes.map((note) => (note.id === id ? data.note : note));
      renderNotes();
    }
    setNotesStatus('', '');
  } catch (error) {
    if (previous) {
      notes = notes.map((note) => (note.id === id ? previous : note));
      renderNotes();
    }
    setNotesStatus(error.message || 'Failed to update note.', 'error');
  }
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
    sessionStorage.setItem(PASSKEY_KEY, passkey);
    document.cookie = `${PASSKEY_COOKIE}=${encodeURIComponent(passkey)}; path=/; SameSite=Lax`;
    setGateStatus('', '');
    setNotebookEnabled(true);
    hideGate();
    loadNotes();
    if (noteInput) {
      noteInput.focus();
    }
  } catch (error) {
    setNotebookEnabled(false);
    setGateStatus(error.message || 'Invalid pass key.', 'error');
  } finally {
    if (unlockButton) {
      unlockButton.disabled = false;
    }
  }
};

if (noteAddButton) {
  noteAddButton.addEventListener('click', addNote);
}

if (noteInput) {
  noteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addNote();
    }
  });
}

if (passkeyInput) {
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

categoryButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (!getPasskey()) {
      showGate('Enter the pass key to switch categories.');
      return;
    }
    setActiveCategory(button.dataset.category);
  });
});

setActiveCategory(currentCategory, false);

if (getPasskey()) {
  setNotebookEnabled(true);
  hideGate();
  loadNotes();
} else {
  showGate('Enter the pass key to unlock notes.');
}
