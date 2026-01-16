const tokenInput = document.querySelector('#admin-token');
const status = document.querySelector('#admin-status');
const loadButton = document.querySelector('#load-bookings');
const exportButton = document.querySelector('#export-bookings');
const clearButton = document.querySelector('#clear-token');
const tableBody = document.querySelector('#bookings-table tbody');

let cachedBookings = [];

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

const updateBookingStatus = async (id, nextStatus) => {
  const token = tokenInput?.value.trim();
  if (!token) {
    setStatus('Enter the admin token to update bookings.', 'error');
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
      throw new Error(data.error || 'Could not update booking.');
    }
    cachedBookings = cachedBookings.map((booking) =>
      booking.id === id ? { ...booking, status: data.booking.status } : booking
    );
    renderRows(cachedBookings);
    setStatus('Status updated.', 'success');
  } catch (error) {
    setStatus(error.message || 'Could not update booking.', 'error');
  }
};

if (loadButton) {
  loadButton.addEventListener('click', loadBookings);
}

if (exportButton) {
  exportButton.addEventListener('click', () => downloadCsv(cachedBookings));
}

if (clearButton) {
  clearButton.addEventListener('click', () => {
    localStorage.removeItem('baroloAdminToken');
    if (tokenInput) {
      tokenInput.value = '';
    }
    cachedBookings = [];
    if (exportButton) {
      exportButton.disabled = true;
    }
    setStatus('Token cleared.', '');
  });
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

const savedToken = localStorage.getItem('baroloAdminToken');
if (savedToken && tokenInput) {
  tokenInput.value = savedToken;
}
