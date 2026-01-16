const crypto = require('crypto');

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

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
    sendJson(res, 500, {
      error: `Server not configured. Missing ${missing.join(', ')}.`,
    });
    return;
  }

  const body = await parseBody(req);
  const {
    name,
    email,
    phone,
    date,
    time,
    guests,
    notes,
    website,
  } = body || {};

  if (website && String(website).trim()) {
    sendJson(res, 200, { ok: true, message: 'Thanks. We will be in touch shortly.' });
    return;
  }

  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim();
  const trimmedPhone = String(phone || '').trim();
  const trimmedDate = String(date || '').trim();
  const trimmedTime = String(time || '').trim();
  const guestsNumber = Number(guests);
  const trimmedNotes = String(notes || '').trim();

  if (
    !trimmedName ||
    !trimmedEmail ||
    !trimmedPhone ||
    !trimmedDate ||
    !trimmedTime
  ) {
    sendJson(res, 400, { error: 'Please fill in all required fields.' });
    return;
  }

  if (!Number.isFinite(guestsNumber) || guestsNumber < 1) {
    sendJson(res, 400, { error: 'Guests must be at least 1.' });
    return;
  }

  const cancelToken = crypto.randomBytes(16).toString('hex');
  const bookingPayload = {
    name: trimmedName,
    email: trimmedEmail,
    phone: trimmedPhone,
    date: trimmedDate,
    time: trimmedTime,
    guests: Math.round(guestsNumber),
    notes: trimmedNotes ? trimmedNotes : null,
    status: 'pending',
    cancel_token: cancelToken,
  };

  const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(bookingPayload),
  });

  if (!supabaseResponse.ok) {
    const message = await supabaseResponse.text();
    sendJson(res, 500, {
      error: message || 'Could not save booking. Please try again.',
    });
    return;
  }

  const insertedBookings = await supabaseResponse.json();
  const insertedBooking = insertedBookings?.[0];
  const resolvedCancelToken = insertedBooking?.cancel_token || cancelToken;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = host ? `${proto}://${host}` : '';
  const cancelUrl = baseUrl
    ? `${baseUrl}/cancel.html?token=${encodeURIComponent(resolvedCancelToken)}`
    : '';

  const subjectDate = `${trimmedDate} at ${trimmedTime}`;
  const detailsHtml = `
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(trimmedName)}</li>
      <li><strong>Email:</strong> ${escapeHtml(trimmedEmail)}</li>
      <li><strong>Phone:</strong> ${escapeHtml(trimmedPhone)}</li>
      <li><strong>Date:</strong> ${escapeHtml(trimmedDate)}</li>
      <li><strong>Time:</strong> ${escapeHtml(trimmedTime)}</li>
      <li><strong>Guests:</strong> ${escapeHtml(bookingPayload.guests)}</li>
      ${trimmedNotes ? `<li><strong>Notes:</strong> ${escapeHtml(trimmedNotes)}</li>` : ''}
    </ul>
  `;

  const detailsText = [
    `Name: ${trimmedName}`,
    `Email: ${trimmedEmail}`,
    `Phone: ${trimmedPhone}`,
    `Date: ${trimmedDate}`,
    `Time: ${trimmedTime}`,
    `Guests: ${bookingPayload.guests}`,
    trimmedNotes ? `Notes: ${trimmedNotes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await sendResendEmail({
      from: RESERVATION_FROM_EMAIL,
      to: RESERVATION_NOTIFY_EMAIL,
      subject: `New reservation request - ${subjectDate}`,
      html: `<p>New reservation request received:</p>${detailsHtml}`,
      text: `New reservation request received:\n\n${detailsText}`,
      apiKey: RESEND_API_KEY,
    });

    const customerHtml = `
      <p>Thank you for your request at Barolo.</p>
      <p>We will confirm your reservation shortly.</p>
      ${detailsHtml}
      ${cancelUrl ? `<p>If you need to cancel, use this link: <a href="${cancelUrl}">${cancelUrl}</a></p>` : ''}
    `;
    const customerText = `Thank you for your request at Barolo.\nWe will confirm your reservation shortly.\n\n${detailsText}${
      cancelUrl ? `\n\nCancel link: ${cancelUrl}` : ''
    }`;

    await sendResendEmail({
      from: RESERVATION_FROM_EMAIL,
      to: trimmedEmail,
      subject: `We received your reservation request - ${subjectDate}`,
      html: customerHtml,
      text: customerText,
      apiKey: RESEND_API_KEY,
    });
  } catch (error) {
    sendJson(res, 200, {
      ok: true,
      message: 'Request received. Email confirmation will follow shortly.',
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    message: 'Request received. We will confirm by email.',
  });
};
