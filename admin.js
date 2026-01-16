const config = window.BAROLO_SUPABASE || {};
const STORAGE_KEY = 'barolo-admin-session';

const status = document.querySelector('#admin-status');
const authStatus = document.querySelector('#admin-auth-status');
const authSection = document.querySelector('#admin-auth');
const contentSection = document.querySelector('#admin-content');
const emailInput = document.querySelector('#admin-email');
const passwordInput = document.querySelector('#admin-password');
const loginButton = document.querySelector('#admin-login');
const logoutButton = document.querySelector('#admin-logout');
const loadButton = document.querySelector('#load-bookings');
const exportButton = document.querySelector('#export-bookings');
const filterMode = document.querySelector('#filter-mode');
const filterDate = document.querySelector('#filter-date');
const tableBody = document.querySelector('#bookings-table tbody');
const formTitle = document.querySelector('#form-title');
const cancelEditButton = document.querySelector('#cancel-edit');
const saveButton = document.querySelector('#save-reservation');
const formStatus = document.querySelector('#form-status-message');
const formContainer = document.querySelector('#admin-form');
const formName = document.querySelector('#form-name');
const formEmail = document.querySelector('#form-email');
const formPhone = document.querySelector('#form-phone');
const formDate = document.querySelector('#form-date');
const formTime = document.querySelector('#form-time');
const formGuests = document.querySelector('#form-guests');
const formTable = document.querySelector('#form-table');
const formStatusSelect = document.querySelector('#form-status');
const formNotes = document.querySelector('#form-notes');
const openAddButton = document.querySelector('#open-add-reservation');
const infoModal = document.querySelector('#info-modal');
const closeInfoButton = document.querySelector('#close-info');
const infoTable = document.querySelector('#info-table');
const infoEmail = document.querySelector('#info-email');
const infoPhone = document.querySelector('#info-phone');
const infoNotes = document.querySelector('#info-notes');
const infoCreated = document.querySelector('#info-created');

let allBookings = [];
let visibleBookings = [];
let editingId = null;
let currentSession = null;

const setStatus = (message, state) => {
  if (!status) {
    return;
  }
  status.textContent = message;
  status.dataset.state = state || '';
};

const setAuthStatus = (message, state) => {
  if (!authStatus) {
    return;
  }
  authStatus.textContent = message;
  authStatus.dataset.state = state || '';
};

const setFormStatus = (message, state) => {
  if (!formStatus) {
    return;
  }
  formStatus.textContent = message;
  formStatus.dataset.state = state || '';
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDateTime = (value) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
};

const normalizeStatus = (value) => {
  const statusValue = String(value || 'pending').toLowerCase();
  if (
    statusValue === 'confirmed' ||
    statusValue === 'cancelled' ||
    statusValue === 'seated' ||
    statusValue === 'no_show'
  ) {
    return statusValue;
  }
  return 'pending';
};

const statusPriority = (value) => {
  const map = {
    pending: 0,
    confirmed: 1,
    seated: 2,
    no_show: 3,
    cancelled: 4,
  };
  return map[normalizeStatus(value)] ?? 9;
};

const sortBookings = (bookings) => {
  return [...bookings].sort((a, b) => {
    const statusDiff = statusPriority(a.status) - statusPriority(b.status);
    if (statusDiff !== 0) {
      return statusDiff;
    }
    const aDate = `${a.date || ''}T${a.time || '00:00'}`;
    const bDate = `${b.date || ''}T${b.time || '00:00'}`;
    return aDate.localeCompare(bDate);
  });
};

const applyFilters = () => {
  const mode = filterMode?.value || 'upcoming';
  const selectedDate = filterDate?.value;
  const today = new Date().toISOString().slice(0, 10);

  if (filterDate) {
    filterDate.disabled = mode !== 'date';
    if (mode === 'date' && !filterDate.value) {
      filterDate.value = today;
    }
    if (mode === 'upcoming' || mode === 'pending') {
      filterDate.value = today;
    }
  }

  let filtered = allBookings;

  if (mode === 'pending') {
    filtered = filtered.filter((booking) => normalizeStatus(booking.status) === 'pending');
  } else if (mode === 'upcoming') {
    filtered = filtered.filter((booking) => (booking.date || '') === today);
  } else if (mode === 'past') {
    filtered = filtered.filter((booking) => (booking.date || '') < today);
  } else if (mode === 'date' && selectedDate) {
    filtered = filtered.filter((booking) => booking.date === selectedDate);
  }

  renderRows(sortBookings(filtered));
};

const toggleAdmin = (isAuthed) => {
  if (authSection) {
    authSection.hidden = isAuthed;
  }
  if (contentSection) {
    contentSection.hidden = !isAuthed;
  }
};

const disableLogin = (message) => {
  setAuthStatus(message, 'error');
  if (loginButton) {
    loginButton.disabled = true;
  }
};

const authHeaders = () => ({
  apikey: config.anonKey,
  Authorization: `Bearer ${config.anonKey}`,
  'Content-Type': 'application/json',
});

const saveSession = (session) => {
  currentSession = session;
  if (session) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } else {
    sessionStorage.removeItem(STORAGE_KEY);
  }
};

const loadSession = () => {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
};

const isSessionValid = (session) => {
  if (!session?.access_token || !session?.expires_at) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  return session.expires_at > now + 30;
};

const requestToken = async (grantType, payload) => {
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=${grantType}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  return { response, data };
};

const refreshSession = async () => {
  if (!config.url || !config.anonKey) {
    disableLogin('Login unavailable. Missing configuration.');
    return null;
  }

  let session = currentSession || loadSession();
  if (session && isSessionValid(session)) {
    currentSession = session;
    toggleAdmin(true);
    return session;
  }

  if (session?.refresh_token) {
    const { response, data } = await requestToken('refresh_token', {
      refresh_token: session.refresh_token,
    });
    if (response.ok) {
      const updated = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in,
      };
      saveSession(updated);
      toggleAdmin(true);
      return updated;
    }
  }

  saveSession(null);
  toggleAdmin(false);
  return null;
};

const getAccessToken = async () => {
  const session = await refreshSession();
  return session?.access_token || null;
};

const renderRows = (bookings) => {
  if (!tableBody) {
    return;
  }

  visibleBookings = bookings;

  if (!bookings.length) {
    tableBody.innerHTML = '<tr><td colspan="7" class="admin-empty">No bookings found.</td></tr>';
    return;
  }

  tableBody.innerHTML = bookings
    .map((booking) => {
      const statusValue = normalizeStatus(booking.status);
      const infoPayload = escapeHtml(
        JSON.stringify({
          table: booking.table_number ?? null,
          email: booking.email,
          phone: booking.phone,
          notes: booking.notes || '',
          created: booking.created_at,
        })
      );
      return `
        <tr>
          <td>${escapeHtml(booking.date)}</td>
          <td>${escapeHtml(booking.time)}</td>
          <td>${escapeHtml(booking.guests)}</td>
          <td>${escapeHtml(booking.name)}</td>
          <td><span class="status-pill status-${statusValue}">${escapeHtml(statusValue)}</span></td>
          <td>
            <button class="admin-action info" data-info-id="${escapeHtml(booking.id)}" data-info="${infoPayload}" type="button">i</button>
          </td>
          <td>
            <div class="admin-actions">
              <button class="admin-action confirm" data-action="confirmed" data-id="${escapeHtml(booking.id)}" type="button">Confirm</button>
              <button class="admin-action seated" data-action="seated" data-id="${escapeHtml(booking.id)}" type="button">Seated</button>
              <button class="admin-action no-show" data-action="no_show" data-id="${escapeHtml(booking.id)}" type="button">No show</button>
              <button class="admin-action pending" data-action="pending" data-id="${escapeHtml(booking.id)}" type="button">Pending</button>
              <button class="admin-action cancel" data-action="cancelled" data-id="${escapeHtml(booking.id)}" type="button">Cancel</button>
              <button class="admin-action edit" data-edit="true" data-id="${escapeHtml(booking.id)}" type="button">Edit</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  if (exportButton) {
    exportButton.disabled = bookings.length === 0;
  }
};

const downloadCsv = (bookings) => {
  if (!bookings.length) {
    setStatus('No bookings to export.', 'error');
    return;
  }

  const headers = ['Date', 'Time', 'Guests', 'Table', 'Name', 'Email', 'Phone', 'Notes', 'Status', 'Created'];
  const rows = bookings.map((booking) => [
    booking.date,
    booking.time,
    booking.guests,
    booking.table_number ?? '',
    booking.name,
    booking.email,
    booking.phone,
    booking.notes || '',
    normalizeStatus(booking.status),
    formatDateTime(booking.created_at),
  ]);

  const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `barolo-bookings-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const loadBookings = async () => {
  const token = await getAccessToken();
  if (!token) {
    setAuthStatus('Please log in to load bookings.', 'error');
    return;
  }

  setStatus('Loading reservations...', 'loading');

  try {
    const response = await fetch('/api/bookings', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data.error || 'Could not load bookings.';
      if (response.status === 401) {
        saveSession(null);
        toggleAdmin(false);
        throw new Error('Session expired. Please log in again.');
      }
      if (message === 'Not allowed.') {
        throw new Error('Not authorized. Add your email to ADMIN_EMAILS in Vercel.');
      }
      if (message === 'Admin access not configured.') {
        throw new Error('Admin access not configured. Set ADMIN_EMAILS in Vercel.');
      }
      throw new Error(message);
    }
    allBookings = data.bookings || [];
    applyFilters();
    setStatus(`Loaded ${data.bookings.length} bookings.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Could not load bookings.', 'error');
  }
};

const updateBookingStatus = async (id, nextStatus) => {
  const token = await getAccessToken();
  if (!token) {
    setAuthStatus('Please log in to update bookings.', 'error');
    return;
  }

  setStatus('Updating status...', 'loading');

  try {
    const response = await fetch('/api/bookings', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, status: nextStatus }),
    });
    const data = await response.json();
    if (!response.ok) {
      const message = data.error || 'Could not update booking.';
      if (response.status === 401) {
        saveSession(null);
        toggleAdmin(false);
        throw new Error('Session expired. Please log in again.');
      }
      if (message === 'Not allowed.') {
        throw new Error('Not authorized. Add your email to ADMIN_EMAILS in Vercel.');
      }
      if (message === 'Admin access not configured.') {
        throw new Error('Admin access not configured. Set ADMIN_EMAILS in Vercel.');
      }
      throw new Error(message);
    }
    allBookings = allBookings.map((booking) =>
      booking.id === id ? { ...booking, status: data.booking.status } : booking
    );
    applyFilters();
    if (data.emailError) {
      setStatus(`Status updated. ${data.emailError}`, 'error');
    } else {
      setStatus('Status updated.', 'success');
    }
  } catch (error) {
    setStatus(error.message || 'Could not update booking.', 'error');
  }
};

const resetForm = () => {
  editingId = null;
  if (formTitle) {
    formTitle.textContent = 'Add reservation';
  }
  if (cancelEditButton) {
    cancelEditButton.hidden = true;
  }
  if (saveButton) {
    saveButton.textContent = 'Save reservation';
  }
  if (formName) formName.value = '';
  if (formEmail) formEmail.value = '';
  if (formPhone) formPhone.value = '';
  if (formDate) formDate.value = '';
  if (formTime) formTime.value = '';
  if (formGuests) formGuests.value = '';
  if (formTable) formTable.value = '';
  if (formStatusSelect) formStatusSelect.value = 'pending';
  if (formNotes) formNotes.value = '';
  setFormStatus('', '');
};

const showForm = () => {
  if (formContainer) {
    formContainer.hidden = false;
  }
};

const hideForm = () => {
  if (formContainer) {
    formContainer.hidden = true;
  }
};

const populateForm = (booking) => {
  editingId = booking.id;
  showForm();
  if (formTitle) {
    formTitle.textContent = 'Edit reservation';
  }
  if (cancelEditButton) {
    cancelEditButton.hidden = false;
  }
  if (saveButton) {
    saveButton.textContent = 'Save changes';
  }
  if (formName) formName.value = booking.name || '';
  if (formEmail) formEmail.value = booking.email || '';
  if (formPhone) formPhone.value = booking.phone || '';
  if (formDate) formDate.value = booking.date || '';
  if (formTime) formTime.value = booking.time || '';
  if (formGuests) formGuests.value = booking.guests || '';
  if (formTable) formTable.value = booking.table_number ?? '';
  if (formStatusSelect) formStatusSelect.value = normalizeStatus(booking.status);
  if (formNotes) formNotes.value = booking.notes || '';
  setFormStatus('', '');
};

const saveReservation = async () => {
  const token = await getAccessToken();
  if (!token) {
    setAuthStatus('Please log in to save reservations.', 'error');
    return;
  }

  const name = formName?.value.trim();
  const email = formEmail?.value.trim();
  const phone = formPhone?.value.trim();
  const date = formDate?.value;
  const time = formTime?.value;
  const guests = Number(formGuests?.value || 0);
  const tableRaw = formTable?.value.trim();
  const tableNumber = tableRaw ? Number(tableRaw) : null;
  const statusValue = normalizeStatus(formStatusSelect?.value);
  const notes = formNotes?.value.trim() || null;

  if (!name || !email || !phone || !date || !time) {
    setFormStatus('Please fill in all required fields.', 'error');
    return;
  }

  if (!Number.isFinite(guests) || guests < 1) {
    setFormStatus('Guests must be at least 1.', 'error');
    return;
  }

  if (Number.isNaN(tableNumber) && tableRaw) {
    setFormStatus('Table must be a number.', 'error');
    return;
  }

  setFormStatus(editingId ? 'Saving changes...' : 'Adding reservation...', 'loading');

  try {
    const payload = {
      name,
      email,
      phone,
      date,
      time,
      guests,
      table_number: tableNumber,
      status: statusValue,
      notes,
    };

    const response = await fetch('/api/bookings', {
      method: editingId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Could not save reservation.');
    }

    const booking = data.booking;
    if (editingId) {
      allBookings = allBookings.map((item) => (item.id === booking.id ? booking : item));
    } else {
      allBookings = [booking, ...allBookings];
    }
    applyFilters();
  resetForm();
  hideForm();
  setFormStatus('Saved.', 'success');
  } catch (error) {
    setFormStatus(error.message || 'Could not save reservation.', 'error');
  }
};

const login = async () => {
  if (!config.url || !config.anonKey) {
    disableLogin('Login unavailable. Missing configuration.');
    return;
  }
  const email = emailInput?.value.trim();
  const password = passwordInput?.value || '';

  if (!email || !password) {
    setAuthStatus('Enter email and password.', 'error');
    return;
  }

  setAuthStatus('Signing in...', 'loading');
  const { response, data } = await requestToken('password', { email, password });
  if (!response.ok) {
    setAuthStatus(data.error_description || data.error || 'Could not sign in.', 'error');
    return;
  }

  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + data.expires_in,
  };

  saveSession(session);
  toggleAdmin(true);
  setAuthStatus('', '');
  loadBookings();
};

const logout = () => {
  saveSession(null);
  allBookings = [];
  visibleBookings = [];
  renderRows([]);
  resetForm();
  hideForm();
  setStatus('', '');
  toggleAdmin(false);
};

const openAddReservation = async () => {
  const token = await getAccessToken();
  if (!token) {
    toggleAdmin(false);
    setAuthStatus('Please log in to add a reservation.', 'error');
    authSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  resetForm();
  showForm();
  if (formContainer) {
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    formContainer.classList.add('highlight');
    window.setTimeout(() => formContainer.classList.remove('highlight'), 1200);
  }
};

if (loadButton) {
  loadButton.addEventListener('click', () => {
    if (filterMode) {
      filterMode.value = 'pending';
    }
    loadBookings();
  });
}

if (exportButton) {
  exportButton.addEventListener('click', () => downloadCsv(visibleBookings));
}

if (logoutButton) {
  logoutButton.addEventListener('click', logout);
}

if (loginButton) {
  loginButton.addEventListener('click', login);
}

if (openAddButton) {
  openAddButton.addEventListener('click', openAddReservation);
}

if (closeInfoButton) {
  closeInfoButton.addEventListener('click', () => {
    if (infoModal) {
      infoModal.hidden = true;
    }
  });
}

if (infoModal) {
  infoModal.addEventListener('click', (event) => {
    if (event.target === infoModal) {
      infoModal.hidden = true;
    }
  });
}

if (tableBody) {
  tableBody.addEventListener('click', (event) => {
    const infoButton = event.target.closest('button[data-info-id], button[data-info]');
    if (infoButton) {
      const booking = allBookings.find(
        (item) => String(item.id) === String(infoButton.dataset.infoId || '')
      );
      if (booking) {
        if (infoTable) infoTable.textContent = booking.table_number ?? '—';
        if (infoEmail) infoEmail.textContent = booking.email || '—';
        if (infoPhone) infoPhone.textContent = booking.phone || '—';
        if (infoNotes) infoNotes.textContent = booking.notes || '—';
        if (infoCreated) infoCreated.textContent = formatDateTime(booking.created_at) || '—';
        if (infoModal) infoModal.hidden = false;
      } else {
        try {
          const payload = JSON.parse(infoButton.dataset.info || '{}');
          if (infoTable) infoTable.textContent = payload.table ?? '—';
          if (infoEmail) infoEmail.textContent = payload.email || '—';
          if (infoPhone) infoPhone.textContent = payload.phone || '—';
          if (infoNotes) infoNotes.textContent = payload.notes || '—';
          if (infoCreated) infoCreated.textContent = formatDateTime(payload.created) || '—';
          if (infoModal) infoModal.hidden = false;
        } catch (error) {
          if (infoModal) infoModal.hidden = true;
        }
      }
      return;
    }
    const statusButton = event.target.closest('button[data-action][data-id]');
    if (statusButton) {
      updateBookingStatus(statusButton.dataset.id, statusButton.dataset.action);
      return;
    }
    const editButton = event.target.closest('button[data-edit][data-id]');
    if (editButton) {
      const booking = allBookings.find((item) => item.id === editButton.dataset.id);
      if (booking) {
        populateForm(booking);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  });
}

if (filterMode) {
  filterMode.addEventListener('change', applyFilters);
}

if (filterDate) {
  filterDate.addEventListener('change', applyFilters);
}

if (saveButton) {
  saveButton.addEventListener('click', saveReservation);
}

if (cancelEditButton) {
  cancelEditButton.addEventListener('click', () => {
    resetForm();
    hideForm();
  });
}

if (!config.url || !config.anonKey) {
  disableLogin('Login unavailable. Missing configuration.');
} else {
  refreshSession().then((session) => {
    if (session) {
      setAuthStatus('', '');
      loadBookings();
      hideForm();
    }
  });
}
