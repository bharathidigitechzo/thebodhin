// Bodhin Local PostgreSQL Bridge Server
// Connects Expo Web Portal & Android APK directly to local PostgreSQL 18
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Lightweight .env loader (no external dependencies needed)
function loadEnv() {
  const candidates = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', 'apps', 'student', '.env.local'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const k = trimmed.slice(0, eq).trim();
            const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
            if (!process.env[k]) process.env[k] = v;
          }
        }
      } catch (_) {}
    }
  }
}
loadEnv();

const PORT = process.env.PORT || 54321;
const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE || 'bodhin_db',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
});

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, Authorization, Content-Type, Prefer, X-Client-Info',
  });
  res.end(body);
}

function handleCors(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'apikey, Authorization, Content-Type, Prefer, X-Client-Info',
    });
    res.end();
    return true;
  }
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (handleCors(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    // Health check
    if (pathname === '/' || pathname === '/health') {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      return sendJson(res, 200, { status: 'ok', database: 'bodhin_db', postgres: '18.6' });
    }

    // Auth: Token (Sign In)
    if (pathname === '/auth/v1/token') {
      const body = await readBody(req);
      const email = body.email || '';
      const client = await pool.connect();
      try {
        const { rows } = await client.query('SELECT id, email, raw_user_meta_data FROM auth.users WHERE email = $1', [email]);
        let user;
        if (rows.length > 0) {
          user = rows[0];
        } else {
          // Auto-provision demo user if not found
          const ins = await client.query(
            'INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2) RETURNING id, email, raw_user_meta_data',
            [email, JSON.stringify({ name: email.split('@')[0] })]
          );
          user = ins.rows[0];
          await client.query('INSERT INTO public.profiles (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [user.id, email.split('@')[0]]);
        }
        return sendJson(res, 200, {
          access_token: `token_${user.id}`,
          token_type: 'bearer',
          expires_in: 604800,
          refresh_token: `refresh_${user.id}`,
          user: {
            id: user.id,
            email: user.email,
            user_metadata: user.raw_user_meta_data || {},
            aud: 'authenticated',
            role: 'authenticated',
          },
        });
      } finally {
        client.release();
      }
    }

    // Auth: Sign Up
    if (pathname === '/auth/v1/signup') {
      const body = await readBody(req);
      const email = body.email || '';
      const meta = body.data || {};
      const client = await pool.connect();
      try {
        const ins = await client.query(
          'INSERT INTO auth.users (email, raw_user_meta_data) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET raw_user_meta_data = EXCLUDED.raw_user_meta_data RETURNING id, email, raw_user_meta_data',
          [email, JSON.stringify(meta)]
        );
        const user = ins.rows[0];
        await client.query('INSERT INTO public.profiles (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [user.id, meta.name || email.split('@')[0]]);
        return sendJson(res, 200, {
          access_token: `token_${user.id}`,
          token_type: 'bearer',
          expires_in: 604800,
          user: {
            id: user.id,
            email: user.email,
            user_metadata: user.raw_user_meta_data || {},
            aud: 'authenticated',
            role: 'authenticated',
          },
        });
      } finally {
        client.release();
      }
    }

    // Auth: Get User
    if (pathname === '/auth/v1/user') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const userId = token.replace(/^token_/, '');
      const client = await pool.connect();
      try {
        const { rows } = await client.query('SELECT id, email, raw_user_meta_data FROM auth.users WHERE id::text = $1', [userId]);
        if (rows.length === 0) {
          return sendJson(res, 401, { message: 'Invalid token' });
        }
        const user = rows[0];
        return sendJson(res, 200, {
          id: user.id,
          email: user.email,
          user_metadata: user.raw_user_meta_data || {},
          aud: 'authenticated',
          role: 'authenticated',
        });
      } finally {
        client.release();
      }
    }

    // Auth: Sign Out
    if (pathname === '/auth/v1/logout') {
      return sendJson(res, 204, {});
    }

    // REST: app_store table
    if (pathname === '/rest/v1/app_store') {
      const client = await pool.connect();
      try {
        if (req.method === 'GET') {
          const { rows } = await client.query('SELECT field, key, ord, data FROM public.app_store ORDER BY ord ASC');
          return sendJson(res, 200, rows);
        }

        if (req.method === 'POST') {
          const body = await readBody(req);
          const items = Array.isArray(body) ? body : [body];
          for (const item of items) {
            await client.query(
              `INSERT INTO public.app_store (field, key, ord, data, updated_at)
               VALUES ($1, $2, $3, $4, now())
               ON CONFLICT (field, key) DO UPDATE
               SET ord = EXCLUDED.ord, data = EXCLUDED.data, updated_at = now()`,
              [item.field, item.key, item.ord || 0, JSON.stringify(item.data)]
            );
          }
          return sendJson(res, 201, items);
        }

        if (req.method === 'DELETE') {
          const fieldParam = url.searchParams.get('field');
          const keyParam = url.searchParams.get('key');
          if (fieldParam) {
            const fieldVal = fieldParam.replace(/^eq\./, '');
            if (keyParam && keyParam.startsWith('in.(') && keyParam.endsWith(')')) {
              const keys = keyParam.slice(4, -1).split(',').map((k) => k.trim());
              await client.query('DELETE FROM public.app_store WHERE field = $1 AND key = ANY($2)', [fieldVal, keys]);
            } else if (keyParam && keyParam.startsWith('eq.')) {
              await client.query('DELETE FROM public.app_store WHERE field = $1 AND key = $2', [fieldVal, keyParam.slice(3)]);
            } else {
              await client.query('DELETE FROM public.app_store WHERE field = $1', [fieldVal]);
            }
          }
          return sendJson(res, 204, {});
        }
      } finally {
        client.release();
      }
    }

    // RPC: login_email
    if (pathname === '/rest/v1/rpc/login_email') {
      const body = await readBody(req);
      const phone = body.p_phone || '';
      const client = await pool.connect();
      try {
        const { rows } = await client.query('SELECT public.login_email($1) AS email', [phone]);
        return sendJson(res, 200, rows[0]?.email || null);
      } finally {
        client.release();
      }
    }

    // Fallback: 404
    sendJson(res, 404, { message: `Route ${pathname} not found` });
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Bodhin Backend] Listening on http://0.0.0.0:${PORT} -> connected to PostgreSQL 18 (bodhin_db)`);
});
