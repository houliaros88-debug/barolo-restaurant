const tokenInput = document.querySelector('#admin-token');
const status = document.querySelector('#admin-status');
const loadButton = document.querySelector('#load-bookings');
const clearButton = document.querySelector('#clear-token');
const tableBody = document.querySelector('#bookings-table tbody');

const setStatus = (message, state) => {
  if (!status) {
    return;
  }
  status.textContent = message;
  status.dataset.state = state || '';
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderRows = (bookings) => {
  if (!tableBody) {
    return;
  }

  if (!bookings.length) {
    tableBody.innerHTML = '<tr><td colspan="8" class="admin-empty">No bookings found.</td></tr>';
    return;
  }

  tableBody.innerHTML = bookings
    .map((booking) => {
      return `
        <tr>
          <td>${escapeHtml(booking.date)}</td>
          <td>${escapeHtml(booking.time)}</td>
          <td>${escapeHtml(booking.guests)}</td>
          <td>${escapeHtml(booking.name)}</td>
          <td>${escapeHtml(booking.email)}</td>
          <td>${escapeHtml(booking.phone)}</td>
          <td>${escapeHtml(booking.notes || '')}</td>
          <td>${escapeHtml(new Date(booking.created_at).toLocaleString())}</td>
        </tr>
      `;
    })
    .join('');
};

const loadBookings = async () => {
  const token = tokenInput?.value.trim();
  if (!token) {
    setStatus('Enter the admin token to load bookings.', 'error');
    return;
  }

  localStorage.setItem('baroloAdminToken', token);
  setStatus('Loading reservations...', 'loading');

  try {
    const response = await fetch('/api/bookings', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Could not load bookings.');
    }
    renderRows(data.bookings || []);
    setStatus(`Loaded ${data.bookings.length} bookings.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Could not load bookings.', 'error');
  }
};

if (loadButton) {
  loadButton.addEventListener('click', loadBookings);
}

if (clearButton) {
  clearButton.addEventListener('click', () => {
    localStorage.removeItem('baroloAdminToken');
    if (tokenInput) {
      tokenInput.value = '';
    }
    setStatus('Token cleared.', '');
  });
}

const savedToken = localStorage.getItem('baroloAdminToken');
if (savedToken && tokenInput) {
  tokenInput.value = savedToken;
}
