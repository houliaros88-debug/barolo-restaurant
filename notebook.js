const notesList = document.querySelector('#notes-list');
const notesStatus = document.querySelector('#notes-status');
const noteInput = document.querySelector('#note-input');
const noteAddButton = document.querySelector('#note-add');
const lockButton = document.querySelector('#notebook-lock');
const categoryButtons = document.querySelectorAll('[data-category]');
const gate = document.querySelector('#notebook-gate');
const mainContent = document.querySelector('main');

const PASSKEY_KEY = 'barolo-notebook-passkey';
const OK_KEY = 'barolo-notebook-passkey-ok';
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

const getPasskey = () => sessionStorage.getItem(PASSKEY_KEY) || '';

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
  if (!passkey) {
    throw new Error('Pass key missing. Unlock the notebook again.');
  }
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    'x-notebook-passkey': passkey,
  };
  return fetch(path, { ...options, headers });
};

const loadNotes = async () => {
  if (!notesList) {
    return;
  }
  setNotesStatus('Loading notes...', 'loading');
  try {
    const response = await notebookFetch(
      `/api/notebook-notes?category=${encodeURIComponent(currentCategory)}`
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to load notes.');
    }
    notes = Array.isArray(data.notes) ? data.notes : [];
    renderNotes();
    setNotesStatus('', '');
  } catch (error) {
    setNotesStatus(error.message || 'Failed to load notes.', 'error');
  }
};

const addNote = async () => {
  if (!noteInput) {
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

const lockNotebook = () => {
  sessionStorage.removeItem(PASSKEY_KEY);
  sessionStorage.removeItem(OK_KEY);
  notes = [];
  renderNotes();
  if (mainContent) {
    mainContent.hidden = true;
  }
  if (gate) {
    gate.hidden = false;
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

if (lockButton) {
  lockButton.addEventListener('click', lockNotebook);
}

categoryButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveCategory(button.dataset.category);
  });
});

setActiveCategory(currentCategory, false);

if (getPasskey()) {
  loadNotes();
} else {
  document.addEventListener(
    'notebook:unlock',
    () => {
      if (getPasskey()) {
        loadNotes();
      }
    },
    { once: true }
  );
}
