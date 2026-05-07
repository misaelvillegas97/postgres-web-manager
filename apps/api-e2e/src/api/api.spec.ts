import axios, { AxiosResponse } from 'axios';

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function login(email = 'admin@pgstudio.local', password = 'dev-password') {
  const res = await axios.post('/api/auth/login', { email, password });
  return (res.data as { tokens: { accessToken: string; refreshToken: string } }).tokens;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createConnection(accessToken: string, name: string): Promise<string> {
  const res = await axios.post(
    '/api/connections',
    {
      name,
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      database: 'postgres',
    },
    { headers: authHeader(accessToken) },
  );
  return res.data.id as string;
}

async function deleteConnection(accessToken: string, connectionId: string | undefined): Promise<void> {
  if (!connectionId) return;
  await axios
    .delete(`/api/connections/${connectionId}`, { headers: authHeader(accessToken) })
    .catch(() => undefined);
}

// ─── Authentication ─────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns tokens for valid credentials', async () => {
    const res = await axios.post('/api/auth/login', {
      email: 'admin@pgstudio.local',
      password: 'dev-password',
    });
    expect(res.status).toBe(201);
    expect(res.data.user.email).toBe('admin@pgstudio.local');
    expect(res.data.tokens.accessToken).toEqual(expect.any(String));
    expect(res.data.tokens.refreshToken).toEqual(expect.any(String));
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
      status: 404,
      code: expect.any(String),
      message: expect.any(String),
      path: expect.any(String),
      timestamp: expect.any(String),
    });
  });
});

// ─── Connections ─────────────────────────────────────────────────────────────

describe('Connections CRUD', () => {
  let accessToken: string;
  let createdConnectionId: string | undefined;

  beforeAll(async () => {
    ({ accessToken } = await login());
  });

  afterAll(async () => {
    await deleteConnection(accessToken, createdConnectionId);
  });

  it('POST /api/connections creates a connection profile', async () => {
    const res = await axios.post(
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
    createdConnectionId = res.data.id as string;
  });

  it('GET /api/connections returns list', async () => {
    const res = await axios.get('/api/connections', { headers: authHeader(accessToken) });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
    expect(
      (res.data as Array<{ id: string }>).some((connection) => connection.id === createdConnectionId),
    ).toBe(true);
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
  let connectionId: string | undefined;

  beforeAll(async () => {
    ({ accessToken } = await login());
    connectionId = await createConnection(accessToken, 'E2E Query Locked Connection');
  });

  afterAll(async () => {
    await deleteConnection(accessToken, connectionId);
  });

  it('returns 422 when no active pool exists for connectionId', async () => {
    let status = 0;
    try {
      await axios.post(
        '/api/queries/execute',
        { connectionId, sql: 'SELECT 1' },
        { headers: authHeader(accessToken) },
      );
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(422);
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

describe('GET /api/metadata/:id/schemas', () => {
  let accessToken: string;
  let connectionId: string | undefined;

  beforeAll(async () => {
    ({ accessToken } = await login());
    connectionId = await createConnection(accessToken, 'E2E Metadata Locked Connection');
  });

  afterAll(async () => {
    await deleteConnection(accessToken, connectionId);
  });

  it('returns 422 when no active pool exists for connectionId', async () => {
    let status = 0;
    try {
      await axios.get(
        `/api/metadata/${connectionId}/schemas`,
        { headers: authHeader(accessToken) },
      );
    } catch (err: unknown) {
      status = (err as { response: AxiosResponse }).response?.status;
    }
    expect(status).toBe(422);
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

