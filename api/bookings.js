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

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    ADMIN_TOKEN,
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_TOKEN) {
    sendJson(res, 500, { error: 'Server not configured.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer', '').trim();
  if (!token || token !== ADMIN_TOKEN) {
    sendJson(res, 401, { error: 'Unauthorized.' });
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
  sendJson(res, 200, { booking: updated[0] });
};
