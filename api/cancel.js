const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parseBody = async (req) => {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch (error) {
        return {};
      }
    }
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
};

const sendResendEmail = async ({ from, to, subject, html, text, apiKey }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to send email.');
  }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY,
    RESERVATION_FROM_EMAIL,
    RESERVATION_NOTIFY_EMAIL,
  } = process.env;

  const missing = [
    !SUPABASE_URL && 'SUPABASE_URL',
    !SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
    !RESEND_API_KEY && 'RESEND_API_KEY',
    !RESERVATION_FROM_EMAIL && 'RESERVATION_FROM_EMAIL',
    !RESERVATION_NOTIFY_EMAIL && 'RESERVATION_NOTIFY_EMAIL',
  ].filter(Boolean);

  if (missing.length) {
    sendJson(res, 500, { error: 'Server not configured.' });
    return;
  }

  const body = await parseBody(req);
  const token = String(body?.token || '').trim();

  if (!token) {
    sendJson(res, 400, { error: 'Missing cancellation token.' });
    return;
  }

  const lookupUrl = new URL(`${SUPABASE_URL}/rest/v1/bookings`);
  lookupUrl.searchParams.set('select', '*');
  lookupUrl.searchParams.set('cancel_token', `eq.${token}`);
  lookupUrl.searchParams.set('limit', '1');

  const lookupResponse = await fetch(lookupUrl.toString(), {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!lookupResponse.ok) {
    const message = await lookupResponse.text();
    sendJson(res, 500, { error: message || 'Could not find booking.' });
    return;
  }

  const bookings = await lookupResponse.json();
  const booking = bookings?.[0];

  if (!booking) {
    sendJson(res, 404, { error: 'Reservation not found.' });
    return;
  }

  if (booking.status === 'cancelled') {
    sendJson(res, 200, { ok: true, message: 'Reservation already cancelled.' });
    return;
  }

  const updateUrl = new URL(`${SUPABASE_URL}/rest/v1/bookings`);
  updateUrl.searchParams.set('id', `eq.${booking.id}`);

  const updateResponse = await fetch(updateUrl.toString(), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });

  if (!updateResponse.ok) {
    const message = await updateResponse.text();
    sendJson(res, 500, { error: message || 'Could not cancel reservation.' });
    return;
  }

  const updated = await updateResponse.json();
  const updatedBooking = updated?.[0] || booking;

  const detailsHtml = `
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(updatedBooking.name)}</li>
      <li><strong>Date:</strong> ${escapeHtml(updatedBooking.date)}</li>
      <li><strong>Time:</strong> ${escapeHtml(updatedBooking.time)}</li>
      <li><strong>Guests:</strong> ${escapeHtml(updatedBooking.guests)}</li>
    </ul>
  `;

  const detailsText = [
    `Name: ${updatedBooking.name}`,
    `Date: ${updatedBooking.date}`,
    `Time: ${updatedBooking.time}`,
    `Guests: ${updatedBooking.guests}`,
  ].join('\n');

  try {
    await sendResendEmail({
      from: RESERVATION_FROM_EMAIL,
      to: updatedBooking.email,
      subject: 'Your reservation has been cancelled',
      html: `
        <p>Your reservation at Barolo has been cancelled.</p>
        ${detailsHtml}
      `,
      text: `Your reservation at Barolo has been cancelled.\n\n${detailsText}`,
      apiKey: RESEND_API_KEY,
    });

    await sendResendEmail({
      from: RESERVATION_FROM_EMAIL,
      to: RESERVATION_NOTIFY_EMAIL,
      subject: 'Reservation cancelled by guest',
      html: `
        <p>A reservation was cancelled by the guest:</p>
        ${detailsHtml}
      `,
      text: `A reservation was cancelled by the guest:\n\n${detailsText}`,
      apiKey: RESEND_API_KEY,
    });
  } catch (error) {
    sendJson(res, 200, {
      ok: true,
      message: 'Reservation cancelled. Email notice will follow shortly.',
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    message: 'Reservation cancelled. A confirmation email has been sent.',
  });
};
