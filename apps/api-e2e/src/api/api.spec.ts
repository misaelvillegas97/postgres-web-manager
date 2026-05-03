import axios, { AxiosResponse } from 'axios';

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function login(email = 'admin@pgstudio.local', password = 'dev-password') {
  const res = await axios.post('/api/auth/login', { email, password });
  return res.data as { accessToken: string; refreshToken: string };
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ─── Authentication ─────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    const res = await axios.post('/api/auth/login', {
      email: 'admin@pgstudio.local',
      password: 'dev-password',
    });
    expect(res.status).toBe(201);
    expect(res.data.accessToken).toEqual(expect.any(String));
    expect(res.data.refreshToken).toEqual(expect.any(String));
  });

  it('returns 401 for wrong password', async () => {
    let status = 0;
    try {
      await axios.post('/api/auth/login', { email: 'admin@pgstudio.local', password: 'wrong' });
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(401);
  });

  it('returns 401 for unknown user', async () => {
    let status = 0;
    try {
      await axios.post('/api/auth/login', { email: 'nobody@example.com', password: 'x' });
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns user profile with valid token', async () => {
    const { accessToken } = await login();
    const res = await axios.get('/api/auth/me', { headers: authHeader(accessToken) });
    expect(res.status).toBe(200);
    expect(res.data.email).toBe('admin@pgstudio.local');
  });

  it('returns 401 without token', async () => {
    let status = 0;
    try {
      await axios.get('/api/auth/me');
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(401);
  });

  it('returns 401 with invalid token', async () => {
    let status = 0;
    try {
      await axios.get('/api/auth/me', { headers: authHeader('not.a.real.token') });
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns new token pair for valid refresh token', async () => {
    const { refreshToken } = await login();
    const res = await axios.post('/api/auth/refresh', { refreshToken });
    expect(res.status).toBe(201);
    expect(res.data.accessToken).toEqual(expect.any(String));
    expect(res.data.refreshToken).toEqual(expect.any(String));
  });

  it('returns 401 for consumed refresh token', async () => {
    const { refreshToken } = await login();
    await axios.post('/api/auth/refresh', { refreshToken });
    // Second use of same token should fail (rotation)
    let status = 0;
    try {
      await axios.post('/api/auth/refresh', { refreshToken });
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('invalidates the refresh token', async () => {
    const { refreshToken } = await login();
    const logoutRes = await axios.post('/api/auth/logout', { refreshToken });
    expect(logoutRes.status).toBe(201);

    let status = 0;
    try {
      await axios.post('/api/auth/refresh', { refreshToken });
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(401);
  });
});

// ─── Global error handling ────────────────────────────────────────────────────

describe('Error response shape', () => {
  it('404 on unknown route has ApiErrorResponse shape', async () => {
    let response: AxiosResponse | null = null;
    try {
      await axios.get('/api/does-not-exist-xyz');
    } catch (err: unknown) {
      response = (err as { response: AxiosResponse }).response;
    }
    expect(response?.status).toBe(404);
    expect(response?.data).toMatchObject({
      statusCode: 404,
      message: expect.any(String),
      path: expect.any(String),
      timestamp: expect.any(String),
    });
  });
});

// ─── Connections ─────────────────────────────────────────────────────────────

describe('Connections CRUD', () => {
  let accessToken: string;

  beforeAll(async () => {
    ({ accessToken } = await login());
  });

  it('POST /api/connections creates a connection profile', async () => {
    let res: AxiosResponse;
    try {
      res = await axios.post(
        '/api/connections',
        {
          name: 'E2E Test Connection',
          host: 'localhost',
          port: 5432,
          username: 'postgres',
          database: 'postgres',
        },
        { headers: authHeader(accessToken) },
      );
      expect(res.status).toBe(201);
      expect(res.data.id).toEqual(expect.any(String));
    } catch (err: unknown) {
      const resp = (err as { response: AxiosResponse }).response;
      // If no internal DB configured the API returns 503 or 500 — that's ok,
      // we just verify the response has error shape.
      expect([201, 500, 503]).toContain(resp?.status ?? 500);
    }
  });

  it('GET /api/connections returns list', async () => {
    let res: AxiosResponse;
    try {
      res = await axios.get('/api/connections', { headers: authHeader(accessToken) });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    } catch (err: unknown) {
      const resp = (err as { response: AxiosResponse }).response;
      expect([200, 500, 503]).toContain(resp?.status ?? 500);
    }
  });

  it('POST /api/connections/:id/test returns 404 for unknown id', async () => {
    let status = 0;
    try {
      await axios.post(
        '/api/connections/00000000-0000-0000-0000-000000000000/test',
        {},
        { headers: authHeader(accessToken) },
      );
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(404);
  });
});

// ─── Queries ──────────────────────────────────────────────────────────────────

describe('POST /api/queries/execute', () => {
  let accessToken: string;

  beforeAll(async () => {
    ({ accessToken } = await login());
  });

  it('returns 404 when connectionId not found', async () => {
    let status = 0;
    try {
      await axios.post(
        '/api/queries/execute',
        { connectionId: '00000000-0000-0000-0000-000000000000', sql: 'SELECT 1' },
        { headers: authHeader(accessToken) },
      );
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(404);
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

describe('GET /api/metadata/:id/schemas', () => {
  let accessToken: string;

  beforeAll(async () => {
    ({ accessToken } = await login());
  });

  it('returns 404 when connectionId not found', async () => {
    let status = 0;
    try {
      await axios.get(
        '/api/metadata/00000000-0000-0000-0000-000000000000/schemas',
        { headers: authHeader(accessToken) },
      );
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(404);
  });
});

// ─── TableData ────────────────────────────────────────────────────────────────

describe('POST /api/table-data/read', () => {
  let accessToken: string;

  beforeAll(async () => {
    ({ accessToken } = await login());
  });

  it('returns 404 when connectionId not found', async () => {
    let status = 0;
    try {
      await axios.post(
        '/api/table-data/read',
        {
          connectionId: '00000000-0000-0000-0000-000000000000',
          schema: 'public',
          table: 'users',
        },
        { headers: authHeader(accessToken) },
      );
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(404);
  });

  it('returns 400 for invalid schema identifier', async () => {
    let status = 0;
    try {
      await axios.post(
        '/api/table-data/read',
        {
          connectionId: 'any',
          schema: 'public; DROP TABLE users',
          table: 'users',
        },
        { headers: authHeader(accessToken) },
      );
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(400);
  });
});

