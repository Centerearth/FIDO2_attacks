process.env.RP_ID = 'localhost';
process.env.ORIGIN = 'http://localhost:5173';

// The secureApiRouter middleware calls DB.getUserByToken directly, so DB is still mocked.
// Everything else goes through AuthService.
jest.mock('./database.js', () => ({
  init: jest.fn(),
  getUser: jest.fn(),
  getUserByToken: jest.fn(),
  createUser: jest.fn(),
  deleteUser: jest.fn(),
  createPasskey: jest.fn(),
  getPasskey: jest.fn(),
  getUserPasskeys: jest.fn(),
  updatePasskeyCounter: jest.fn(),
  updateUserPassword: jest.fn(),
  refreshUserToken: jest.fn(),
  deletePasskeys: jest.fn(),
  deletePasskey: jest.fn(),
}));

jest.mock('./authService.js', () => ({
  ServiceError: class ServiceError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  },
  createUser: jest.fn(),
  loginUser: jest.fn(),
  generateAuthOptions: jest.fn(),
  verifyAuth: jest.fn(),
  generateSignupRegOptions: jest.fn(),
  verifySignupReg: jest.fn(),
  generateRegOptions: jest.fn(),
  verifyReg: jest.fn(),
  getPasskeys: jest.fn(),
  deletePasskeyById: jest.fn(),
  changePassword: jest.fn(),
  deleteAccount: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const { router, secureApiRouter } = require('./auth');
const DB = require('./database.js');
const AuthService = require('./authService.js');
const { ServiceError } = AuthService;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPublicApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

function buildSecureApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', secureApiRouter);
  return app;
}

const TEST_TOKEN = 'valid-token';
const TEST_USER  = { email: 'a@b.com', name: 'Alice', token: TEST_TOKEN };

function authed(req) {
  return req.set('Cookie', `token=${TEST_TOKEN}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  DB.getUserByToken.mockResolvedValue(TEST_USER);
});

// ---------------------------------------------------------------------------
// POST /api/auth/create
// ---------------------------------------------------------------------------

describe('POST /auth/create', () => {
  it('returns 409 when the service throws a 409 ServiceError', async () => {
    AuthService.createUser.mockRejectedValue(new ServiceError('Existing user', 409));

    const res = await request(buildPublicApp())
      .post('/api/auth/create')
      .send({ email: 'a@b.com', name: 'Alice', password: 'pw' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Existing user');
  });

  it('sets an auth cookie and returns email + name on success', async () => {
    AuthService.createUser.mockResolvedValue(TEST_USER);

    const res = await request(buildPublicApp())
      .post('/api/auth/create')
      .send({ email: 'a@b.com', name: 'Alice', password: 'pw' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'a@b.com', name: 'Alice' });
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe('POST /auth/login', () => {
  it('returns 401 when the service throws a 401 ServiceError', async () => {
    AuthService.loginUser.mockRejectedValue(new ServiceError('Unauthorized', 401));

    const res = await request(buildPublicApp())
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('returns 401 with a passkey message for passkey-only accounts', async () => {
    AuthService.loginUser.mockRejectedValue(
      new ServiceError('Unauthorized: Please use a passkey to sign in', 401)
    );

    const res = await request(buildPublicApp())
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: '' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/passkey/i);
  });

  it('sets an auth cookie and returns user on success', async () => {
    AuthService.loginUser.mockResolvedValue(TEST_USER);

    const res = await request(buildPublicApp())
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'correct' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'a@b.com', name: 'Alice' });
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/authentication-options
// ---------------------------------------------------------------------------

describe('POST /auth/authentication-options', () => {
  it('returns 400 when email is missing', async () => {
    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-options')
      .send({});

    expect(res.status).toBe(400);
    expect(AuthService.generateAuthOptions).not.toHaveBeenCalled();
  });

  it('returns 404 when the service throws a 404 ServiceError', async () => {
    AuthService.generateAuthOptions.mockRejectedValue(new ServiceError('User not found.', 404));

    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-options')
      .send({ email: 'missing@b.com' });

    expect(res.status).toBe(404);
  });

  it('returns options and sets a challenge cookie', async () => {
    AuthService.generateAuthOptions.mockResolvedValue({ challenge: 'chall-abc', rpId: 'localhost' });

    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-options')
      .send({ email: 'a@b.com' });

    expect(res.status).toBe(200);
    expect(res.body.challenge).toBe('chall-abc');
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/authentication-verify
// ---------------------------------------------------------------------------

describe('POST /auth/authentication-verify', () => {
  it('returns 400 when email or response is missing', async () => {
    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-verify')
      .send({ email: 'a@b.com' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when no challenge cookie is present', async () => {
    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-verify')
      .send({ email: 'a@b.com', response: { id: 'cred-id' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/challenge/i);
    expect(AuthService.verifyAuth).not.toHaveBeenCalled();
  });

  it('returns 400 when the service throws a 400 ServiceError', async () => {
    AuthService.verifyAuth.mockRejectedValue(new ServiceError('Could not find a matching passkey for this user.', 400));

    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-verify')
      .set('Cookie', 'webauthn_challenge=chall-abc')
      .send({ email: 'a@b.com', response: { id: 'no-match' } });

    expect(res.status).toBe(400);
  });

  it('sets an auth cookie and returns verified on success', async () => {
    AuthService.verifyAuth.mockResolvedValue({ verified: true, email: 'a@b.com', name: 'Alice', token: 'new-tok' });

    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-verify')
      .set('Cookie', 'webauthn_challenge=chall-abc')
      .send({ email: 'a@b.com', response: { id: 'cred-id' } });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup-register-options
// ---------------------------------------------------------------------------

describe('POST /auth/signup-register-options', () => {
  it('returns 400 when email or name is missing', async () => {
    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-options')
      .send({ email: 'a@b.com' });

    expect(res.status).toBe(400);
    expect(AuthService.generateSignupRegOptions).not.toHaveBeenCalled();
  });

  it('returns 409 when the service throws a 409 ServiceError', async () => {
    AuthService.generateSignupRegOptions.mockRejectedValue(new ServiceError('User already exists.', 409));

    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-options')
      .send({ email: 'a@b.com', name: 'Alice' });

    expect(res.status).toBe(409);
  });

  it('returns options and sets a signup cookie', async () => {
    AuthService.generateSignupRegOptions.mockResolvedValue({ challenge: 'signup-chall', rp: {} });

    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-options')
      .send({ email: 'new@b.com', name: 'Bob' });

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup-register-verify
// ---------------------------------------------------------------------------

describe('POST /auth/signup-register-verify', () => {
  it('returns 400 when there is no pending signup cookie', async () => {
    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-verify')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
    expect(AuthService.verifySignupReg).not.toHaveBeenCalled();
  });

  it('returns 409 when the service throws a 409 ServiceError', async () => {
    AuthService.verifySignupReg.mockRejectedValue(new ServiceError('User already exists.', 409));
    const pending = JSON.stringify({ challenge: 'c', email: 'a@b.com', name: 'Alice' });

    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-verify')
      .set('Cookie', `webauthn_signup=${pending}`)
      .send({});

    expect(res.status).toBe(409);
  });

  it('sets an auth cookie and returns verified on success', async () => {
    AuthService.verifySignupReg.mockResolvedValue({
      verified: true, email: 'new@b.com', name: 'Bob', token: 'tok-new',
    });
    const pending = JSON.stringify({ challenge: 'c', email: 'new@b.com', name: 'Bob' });

    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-verify')
      .set('Cookie', `webauthn_signup=${pending}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/auth/logout
// ---------------------------------------------------------------------------

describe('DELETE /auth/logout', () => {
  it('returns 204', async () => {
    const res = await request(buildPublicApp()).delete('/api/auth/logout');
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// secureApiRouter middleware
// ---------------------------------------------------------------------------

describe('secureApiRouter middleware', () => {
  it('returns 401 when the token is missing or invalid', async () => {
    DB.getUserByToken.mockResolvedValue(null);
    const res = await request(buildSecureApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

describe('GET /auth/me', () => {
  it('returns the current user', async () => {
    const res = await authed(request(buildSecureApp()).get('/api/auth/me'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'a@b.com', name: 'Alice' });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/auth/account
// ---------------------------------------------------------------------------

describe('DELETE /auth/account', () => {
  it('deletes the account and returns 204', async () => {
    AuthService.deleteAccount.mockResolvedValue();

    const res = await authed(request(buildSecureApp()).delete('/api/auth/account'));

    expect(res.status).toBe(204);
    expect(AuthService.deleteAccount).toHaveBeenCalledWith('a@b.com');
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/passkeys
// ---------------------------------------------------------------------------

describe('GET /auth/passkeys', () => {
  it('returns the sanitised passkey list', async () => {
    AuthService.getPasskeys.mockResolvedValue([
      { credentialID: 'abc123', transports: ['usb'], created_at: new Date('2024-01-01') },
    ]);

    const res = await authed(request(buildSecureApp()).get('/api/auth/passkeys'));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].credentialID).toBe('abc123');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/auth/passkeys/:id
// ---------------------------------------------------------------------------

describe('DELETE /auth/passkeys/:id', () => {
  it('deletes the passkey and returns 204', async () => {
    AuthService.deletePasskeyById.mockResolvedValue();

    const res = await authed(request(buildSecureApp()).delete('/api/auth/passkeys/some-id'));

    expect(res.status).toBe(204);
    expect(AuthService.deletePasskeyById).toHaveBeenCalledWith('a@b.com', 'some-id');
  });

  it('returns 400 when deletion fails', async () => {
    AuthService.deletePasskeyById.mockRejectedValue(new Error('db error'));

    const res = await authed(request(buildSecureApp()).delete('/api/auth/passkeys/bad-id'));

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register-options
// ---------------------------------------------------------------------------

describe('POST /auth/register-options', () => {
  it('returns registration options and sets a challenge cookie', async () => {
    AuthService.generateRegOptions.mockResolvedValue({ challenge: 'reg-chall', rp: {} });

    const res = await authed(request(buildSecureApp()).post('/api/auth/register-options').send({}));

    expect(res.status).toBe(200);
    expect(res.body.challenge).toBe('reg-chall');
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register-verify
// ---------------------------------------------------------------------------

describe('POST /auth/register-verify', () => {
  it('returns 400 when no challenge cookie is present', async () => {
    const res = await authed(
      request(buildSecureApp()).post('/api/auth/register-verify').send({})
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/challenge/i);
    expect(AuthService.verifyReg).not.toHaveBeenCalled();
  });

  it('returns verified on success', async () => {
    AuthService.verifyReg.mockResolvedValue({ verified: true });

    const res = await request(buildSecureApp())
      .post('/api/auth/register-verify')
      .set('Cookie', `token=${TEST_TOKEN}; webauthn_challenge=reg-chall`)
      .send({ response: { transports: ['internal'] } });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/auth/password
// ---------------------------------------------------------------------------

describe('PUT /auth/password', () => {
  it('returns 400 when no password is provided', async () => {
    const res = await authed(
      request(buildSecureApp()).put('/api/auth/password').send({})
    );

    expect(res.status).toBe(400);
    expect(AuthService.changePassword).not.toHaveBeenCalled();
  });

  it('updates the password and returns 204', async () => {
    AuthService.changePassword.mockResolvedValue();

    const res = await authed(
      request(buildSecureApp()).put('/api/auth/password').send({ password: 'newSecret' })
    );

    expect(res.status).toBe(204);
    expect(AuthService.changePassword).toHaveBeenCalledWith('a@b.com', 'newSecret');
  });
});
