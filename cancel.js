const status = document.querySelector('#cancel-status');
const cancelButton = document.querySelector('#confirm-cancel');

const setStatus = (message, state) => {
  if (!status) {
    return;
  }
  status.textContent = message;
  status.dataset.state = state || '';
};

const token = new URLSearchParams(window.location.search).get('token');

if (!token) {
  setStatus('Missing cancellation link. Please check your email.', 'error');
  if (cancelButton) {
    cancelButton.disabled = true;
  }
}

const cancelReservation = async () => {
  if (!token) {
    return;
  }
  setStatus('Cancelling reservation...', 'loading');
  if (cancelButton) {
    cancelButton.disabled = true;
  }

  try {
    const response = await fetch('/api/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Could not cancel reservation.');
    }
    setStatus(data.message || 'Reservation cancelled.', 'success');
  } catch (error) {
    setStatus(error.message || 'Could not cancel reservation.', 'error');
    if (cancelButton) {
      cancelButton.disabled = false;
    }
  }
};

if (cancelButton) {
  cancelButton.addEventListener('click', cancelReservation);
}
