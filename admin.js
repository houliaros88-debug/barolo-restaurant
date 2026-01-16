const config = window.BAROLO_SUPABASE || {};
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
const tableBody = document.querySelector('#bookings-table tbody');

let cachedBookings = [];
let supabaseClient = null;
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
  if (statusValue === 'confirmed' || statusValue === 'cancelled') {
    return statusValue;
  }
  return 'pending';
};

const toggleAdmin = (isAuthed) => {
  if (authSection) {
    authSection.hidden = isAuthed;
  }
  if (contentSection) {
    contentSection.hidden = !isAuthed;
  }
};

const initSupabase = () => {
  if (!window.supabase || !config.url || !config.anonKey) {
    setAuthStatus('Supabase is not configured.', 'error');
    return null;
  }
  return window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: window.sessionStorage,
      storageKey: 'barolo-admin-session',
    },
  });
};

const refreshSession = async () => {
  if (!supabaseClient) {
    return;
  }
  const { data } = await supabaseClient.auth.getSession();
  currentSession = data.session;
  toggleAdmin(Boolean(currentSession));
  if (currentSession) {
    setAuthStatus('', '');
    if (!cachedBookings.length) {
      loadBookings();
    }
  }
};

const getAccessToken = async () => {
  if (currentSession?.access_token) {
    return currentSession.access_token;
  }
  if (!supabaseClient) {
    return null;
  }
  const { data } = await supabaseClient.auth.getSession();
  currentSession = data.session;
  return data.session?.access_token || null;
};

const renderRows = (bookings) => {
  if (!tableBody) {
    return;
  }

  cachedBookings = bookings;

  if (!bookings.length) {
    tableBody.innerHTML = '<tr><td colspan="10" class="admin-empty">No bookings found.</td></tr>';
    return;
  }

  tableBody.innerHTML = bookings
    .map((booking) => {
      const statusValue = normalizeStatus(booking.status);
      return `
        <tr>
          <td>${escapeHtml(booking.date)}</td>
          <td>${escapeHtml(booking.time)}</td>
          <td>${escapeHtml(booking.guests)}</td>
          <td>${escapeHtml(booking.name)}</td>
          <td>${escapeHtml(booking.email)}</td>
          <td>${escapeHtml(booking.phone)}</td>
          <td>${escapeHtml(booking.notes || '')}</td>
          <td><span class="status-pill status-${statusValue}">${escapeHtml(statusValue)}</span></td>
          <td>${escapeHtml(formatDateTime(booking.created_at))}</td>
          <td>
            <div class="admin-actions">
              <button class="admin-action confirm" data-action="confirmed" data-id="${escapeHtml(booking.id)}" type="button">Confirm</button>
              <button class="admin-action pending" data-action="pending" data-id="${escapeHtml(booking.id)}" type="button">Pending</button>
              <button class="admin-action cancel" data-action="cancelled" data-id="${escapeHtml(booking.id)}" type="button">Cancel</button>
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

  const headers = ['Date', 'Time', 'Guests', 'Name', 'Email', 'Phone', 'Notes', 'Status', 'Created'];
  const rows = bookings.map((booking) => [
    booking.date,
    booking.time,
    booking.guests,
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
      if (message === 'Not allowed.') {
        throw new Error('Not authorized. Add your email to ADMIN_EMAILS in Vercel.');
      }
      if (message === 'Admin access not configured.') {
        throw new Error('Admin access not configured. Set ADMIN_EMAILS in Vercel.');
      }
      throw new Error(message);
    }
    renderRows(data.bookings || []);
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
      if (message === 'Not allowed.') {
        throw new Error('Not authorized. Add your email to ADMIN_EMAILS in Vercel.');
      }
      if (message === 'Admin access not configured.') {
        throw new Error('Admin access not configured. Set ADMIN_EMAILS in Vercel.');
      }
      throw new Error(message);
    }
    cachedBookings = cachedBookings.map((booking) =>
      booking.id === id ? { ...booking, status: data.booking.status } : booking
    );
    renderRows(cachedBookings);
    if (data.emailError) {
      setStatus(`Status updated. ${data.emailError}`, 'error');
    } else {
      setStatus('Status updated.', 'success');
    }
  } catch (error) {
    setStatus(error.message || 'Could not update booking.', 'error');
  }
};

const login = async () => {
  if (!supabaseClient) {
    return;
  }
  const email = emailInput?.value.trim();
  const password = passwordInput?.value || '';

  if (!email || !password) {
    setAuthStatus('Enter email and password.', 'error');
    return;
  }

  setAuthStatus('Signing in...', 'loading');
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    setAuthStatus(error.message || 'Could not sign in.', 'error');
    return;
  }

  toggleAdmin(true);
  await refreshSession();
  setAuthStatus('', '');
  loadBookings();
};

const logout = async () => {
  if (!supabaseClient) {
    return;
  }
  await supabaseClient.auth.signOut();
  cachedBookings = [];
  renderRows([]);
  setStatus('', '');
  toggleAdmin(false);
};

if (loadButton) {
  loadButton.addEventListener('click', loadBookings);
}

if (exportButton) {
  exportButton.addEventListener('click', () => downloadCsv(cachedBookings));
}

if (logoutButton) {
  logoutButton.addEventListener('click', logout);
}

if (loginButton) {
  loginButton.addEventListener('click', login);
}

if (tableBody) {
  tableBody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action][data-id]');
    if (!button) {
      return;
    }
    updateBookingStatus(button.dataset.id, button.dataset.action);
  });
}

supabaseClient = initSupabase();
if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    toggleAdmin(Boolean(session));
    if (session && !cachedBookings.length) {
      loadBookings();
    }
  });
  refreshSession();
}
