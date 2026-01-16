const sendJson = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
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
};
