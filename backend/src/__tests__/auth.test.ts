import request from 'supertest';
import { app } from '../index';
import { db } from '../utils/db';

beforeAll(async () => {
  // Clean test DB
  await db.refreshToken.deleteMany();
  await db.user.deleteMany();
});

afterAll(async () => {
  await db.refreshToken.deleteMany();
  await db.user.deleteMany();
  await db.$disconnect();
});

describe('POST /api/auth/register', () => {
  it('creates a new user', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@dotpe.in',
      password: 'Password1',
      firstName: 'Test',
      lastName: 'User',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test@dotpe.in');
    expect(res.body.user.role).toBe('EMPLOYEE');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@dotpe.in',
      password: 'Password1',
      firstName: 'Dup',
      lastName: 'User',
    });
    expect(res.status).toBe(409);
  });

  it('rejects weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'weak@dotpe.in',
      password: 'weakpass',
      firstName: 'Weak',
      lastName: 'Pass',
    });
    expect(res.status).toBe(400);
  });

  it('rejects short password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'short@dotpe.in',
      password: 'Ab1',
      firstName: 'Short',
      lastName: 'Pass',
    });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'not-an-email',
      password: 'Password1',
      firstName: 'Bad',
      lastName: 'Email',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('returns cookies on valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'test@dotpe.in',
      password: 'Password1',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@dotpe.in');
    const cookies = res.headers['set-cookie'] as string[];
    expect(cookies.some((c: string) => c.startsWith('access_token='))).toBe(true);
    expect(cookies.some((c: string) => c.startsWith('refresh_token='))).toBe(true);
    expect(cookies.every((c: string) => c.includes('HttpOnly'))).toBe(true);
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'test@dotpe.in',
      password: 'WrongPass1',
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-existent user', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'ghost@dotpe.in',
      password: 'Password1',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  let cookies: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'test@dotpe.in',
      password: 'Password1',
    });
    cookies = (res.headers['set-cookie'] as string[]).join('; ');
  });

  it('returns user info when authenticated', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('test@dotpe.in');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 without cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears cookies', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'test@dotpe.in',
      password: 'Password1',
    });
    const cookies = (loginRes.headers['set-cookie'] as string[]).join('; ');

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('always returns 200 (enumeration protection)', async () => {
    const realRes = await request(app).post('/api/auth/forgot-password').send({ email: 'test@dotpe.in' });
    expect(realRes.status).toBe(200);

    const fakeRes = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@dotpe.in' });
    expect(fakeRes.status).toBe(200);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('rejects invalid token', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({
      token: 'invalid-token',
      password: 'NewPass1',
    });
    expect(res.status).toBe(400);
  });

  it('resets password with valid token', async () => {
    // Generate a real reset token
    const user = await db.user.findUnique({ where: { email: 'test@dotpe.in' } });
    const token = 'valid-reset-token-abc123';
    await db.user.update({
      where: { id: user!.id },
      data: { resetToken: token, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
    });

    const res = await request(app).post('/api/auth/reset-password').send({
      token,
      password: 'NewPassword1',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Verify can login with new password
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'test@dotpe.in',
      password: 'NewPassword1',
    });
    expect(loginRes.status).toBe(200);
  });
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
