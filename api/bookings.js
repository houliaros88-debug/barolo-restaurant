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
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_EMAILS,
    RESEND_API_KEY,
    RESERVATION_FROM_EMAIL,
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_EMAILS) {
    sendJson(res, 500, { error: 'Server not configured.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/Bearer\s+/i, '').trim();
  if (!token) {
    sendJson(res, 401, { error: 'Unauthorized.' });
    return;
  }

  const allowedEmails = ADMIN_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!allowedEmails.length) {
    sendJson(res, 500, { error: 'Admin access not configured.' });
    return;
  }

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (!userResponse.ok) {
    sendJson(res, 401, { error: 'Unauthorized.' });
    return;
  }

  const user = await userResponse.json();
  const userEmail = String(user?.email || '').toLowerCase();
  if (!allowedEmails.includes(userEmail)) {
    sendJson(res, 401, { error: 'Not allowed.' });
    return;
  }

  if (req.method === 'GET') {
    const limit = Math.min(Number(req.query?.limit || 200), 500);
    const url = new URL(`${SUPABASE_URL}/rest/v1/bookings`);
    url.searchParams.set('select', '*');
    url.searchParams.set('order', 'created_at.desc');
    url.searchParams.set('limit', String(limit));

    const response = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) {
      const message = await response.text();
      sendJson(res, 500, { error: message || 'Failed to load bookings.' });
      return;
    }

    const bookings = await response.json();
    sendJson(res, 200, { bookings });
    return;
  }

  const body = await parseBody(req);
  const id = String(body?.id || '').trim();
  const statusValue = String(body?.status || '').trim().toLowerCase();
  const allowedStatuses = ['pending', 'confirmed', 'cancelled'];

  if (!id || !allowedStatuses.includes(statusValue)) {
    sendJson(res, 400, { error: 'Invalid booking update.' });
    return;
  }

  const url = new URL(`${SUPABASE_URL}/rest/v1/bookings`);
  url.searchParams.set('id', `eq.${id}`);

  const response = await fetch(url.toString(), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      status: statusValue,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    sendJson(res, 500, { error: message || 'Failed to update booking.' });
    return;
  }

  const updated = await response.json();
  const booking = updated[0];
  let emailError = null;

  if ((statusValue === 'confirmed' || statusValue === 'cancelled') && booking?.email) {
    if (!RESEND_API_KEY || !RESERVATION_FROM_EMAIL) {
      emailError = 'Email service not configured.';
    } else {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = host ? `${proto}://${host}` : '';
      const cancelUrl =
        statusValue === 'confirmed' && booking.cancel_token && baseUrl
          ? `${baseUrl}/cancel.html?token=${encodeURIComponent(booking.cancel_token)}`
          : '';
      const detailsHtml = `
        <ul>
          <li><strong>Name:</strong> ${escapeHtml(booking.name)}</li>
          <li><strong>Date:</strong> ${escapeHtml(booking.date)}</li>
          <li><strong>Time:</strong> ${escapeHtml(booking.time)}</li>
          <li><strong>Guests:</strong> ${escapeHtml(booking.guests)}</li>
        </ul>
      `;
      const detailsText = [
        `Name: ${booking.name}`,
        `Date: ${booking.date}`,
        `Time: ${booking.time}`,
        `Guests: ${booking.guests}`,
      ].join('\n');

      const subject =
        statusValue === 'confirmed'
          ? 'Your reservation is confirmed'
          : 'Your reservation has been cancelled';
      const intro =
        statusValue === 'confirmed'
          ? 'Your reservation at Barolo is confirmed. We look forward to welcoming you.'
          : 'Your reservation at Barolo has been cancelled. If this is a mistake, please contact us.';
      const cancelLine =
        statusValue === 'confirmed' && cancelUrl
          ? `<p>If you need to cancel, use this link: <a href="${cancelUrl}">${cancelUrl}</a></p>`
          : '';
      const cancelText =
        statusValue === 'confirmed' && cancelUrl
          ? `\n\nCancel link: ${cancelUrl}`
          : '';

      try {
        await sendResendEmail({
          from: RESERVATION_FROM_EMAIL,
          to: booking.email,
          subject,
          html: `
            <p>${escapeHtml(intro)}</p>
            ${detailsHtml}
            ${cancelLine}
          `,
          text: `${intro}\n\n${detailsText}${cancelText}`,
          apiKey: RESEND_API_KEY,
        });
      } catch (error) {
        emailError = `${statusValue === 'confirmed' ? 'Confirmation' : 'Cancellation'} email failed to send.`;
      }
    }
  }

  sendJson(res, 200, { booking, emailError });
};
