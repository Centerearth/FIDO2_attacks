process.env.RP_ID = 'localhost';
process.env.ORIGIN = 'http://localhost:5173';

//since mocking database.js normally requires the enviornment variables, we instead mock all of the functions
jest.mock('./database.js', () => ({
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
jest.mock('@simplewebauthn/server');
jest.mock('bcrypt');

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const { router, secureApiRouter } = require('./auth');
const DB = require('./database.js');
const bcrypt = require('bcrypt');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPublicApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

// The secure router relies on cookie-parser to read the auth token.
function buildSecureApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', secureApiRouter);
  return app;
}

const TEST_TOKEN = 'valid-token';
const TEST_USER = { email: 'a@b.com', name: 'Alice', token: TEST_TOKEN };

// Authenticate every secure-app request with a valid token cookie.
function authed(req) {
  return req.set('Cookie', `token=${TEST_TOKEN}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: the secure router's auth middleware resolves successfully.
  DB.getUserByToken.mockResolvedValue(TEST_USER);
});

// ---------------------------------------------------------------------------
// POST /api/auth/create
// ---------------------------------------------------------------------------

describe('POST /auth/create', () => {
  it('returns 409 when the user already exists', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);

    const res = await request(buildPublicApp())
      .post('/api/auth/create')
      .send({ email: 'a@b.com', name: 'Alice', password: 'pw' });

    expect(res.status).toBe(409);
    expect(res.body.msg).toBe('Existing user');
  });

  it('creates a new user and returns email + name', async () => {
    DB.getUser.mockResolvedValue(null);
    DB.createUser.mockResolvedValue(TEST_USER);

    const res = await request(buildPublicApp())
      .post('/api/auth/create')
      .send({ email: 'a@b.com', name: 'Alice', password: 'pw' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'a@b.com', name: 'Alice' });
    expect(DB.createUser).toHaveBeenCalledWith('Alice', 'a@b.com', 'pw');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe('POST /auth/login', () => {
  it('returns 401 when the user does not exist', async () => {
    DB.getUser.mockResolvedValue(null);

    const res = await request(buildPublicApp())
      .post('/api/auth/login')
      .send({ email: 'missing@b.com', password: 'pw' });

    expect(res.status).toBe(401);
  });

  it('returns 401 with a passkey-only message when the account has no password', async () => {
    DB.getUser.mockResolvedValue({ ...TEST_USER, password: undefined });

    const res = await request(buildPublicApp())
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: '' });

    expect(res.status).toBe(401);
    expect(res.body.msg).toMatch(/passkey/i);
  });

  it('returns 401 when the password does not match', async () => {
    DB.getUser.mockResolvedValue({ ...TEST_USER, password: 'hashed' });
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(buildPublicApp())
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('returns 200 and sets a cookie on successful login', async () => {
    DB.getUser.mockResolvedValue({ ...TEST_USER, password: 'hashed' });
    bcrypt.compare.mockResolvedValue(true);
    DB.refreshUserToken.mockResolvedValue('new-token');

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
  });

  it('returns 404 when the user does not exist', async () => {
    DB.getUser.mockResolvedValue(null);

    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-options')
      .send({ email: 'missing@b.com' });

    expect(res.status).toBe(404);
  });

  it('returns options and sets a challenge cookie', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([]);
    generateAuthenticationOptions.mockResolvedValue({ challenge: 'chall-abc', rpId: 'localhost' });

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
      .send({ email: 'a@b.com' }); // missing response

    expect(res.status).toBe(400);
  });

  it('returns 404 when the user does not exist', async () => {
    DB.getUser.mockResolvedValue(null);

    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-verify')
      .send({ email: 'a@b.com', response: { id: 'cred-id' } });

    expect(res.status).toBe(404);
  });

  it('returns 400 when no challenge cookie is present', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([]);

    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-verify')
      .send({ email: 'a@b.com', response: { id: 'cred-id' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/challenge/i);
  });

  it('returns 400 when no matching passkey is found', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([
      { credentialID: Buffer.from('other-cred'), counter: 0, transports: [] },
    ]);

    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-verify')
      .set('Cookie', 'webauthn_challenge=chall-abc')
      .send({ email: 'a@b.com', response: { id: 'no-match' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/passkey/i);
  });

  it('returns 200 and logs in the user on successful verification', async () => {
    const credentialID = Buffer.from('valid-cred');
    // base64 encode to get the id the route will look for
    const credentialIDBase64url = credentialID
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([
      { credentialID, publicKey: Buffer.from('pubkey'), counter: 0, transports: [] },
    ]);
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });
    DB.updatePasskeyCounter.mockResolvedValue();
    DB.refreshUserToken.mockResolvedValue('fresh-token');

    const res = await request(buildPublicApp())
      .post('/api/auth/authentication-verify')
      .set('Cookie', 'webauthn_challenge=chall-abc')
      .send({ email: 'a@b.com', response: { id: credentialIDBase64url } });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.email).toBe('a@b.com');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/signup-register-options
// ---------------------------------------------------------------------------

describe('POST /auth/signup-register-options', () => {
  it('returns 400 when email or name is missing', async () => {
    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-options')
      .send({ email: 'a@b.com' }); // missing name

    expect(res.status).toBe(400);
  });

  it('returns 409 when the user already exists', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);

    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-options')
      .send({ email: 'a@b.com', name: 'Alice' });

    expect(res.status).toBe(409);
  });

  it('returns options and sets a signup cookie', async () => {
    DB.getUser.mockResolvedValue(null);
    generateRegistrationOptions.mockResolvedValue({ challenge: 'signup-chall', rp: {} });

    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-options')
      .send({ email: 'new@b.com', name: 'Bob' });

    expect(res.status).toBe(200);
    expect(res.body.challenge).toBe('signup-chall');
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
  });

  it('returns 409 when the user already exists', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    const pending = JSON.stringify({ challenge: 'c', email: 'a@b.com', name: 'Alice' });

    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-verify')
      .set('Cookie', `webauthn_signup=${pending}`)
      .send({});

    expect(res.status).toBe(409);
  });

  it('creates the user and passkey on successful verification', async () => {
    DB.getUser.mockResolvedValue(null);
    const credentialPublicKey = new Uint8Array([1, 2, 3]);
    const credentialID = 'base64url-credential-id';
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { publicKey: credentialPublicKey, id: credentialID, counter: 0 },
      },
    });
    DB.createUser.mockResolvedValue(TEST_USER);
    DB.createPasskey.mockResolvedValue();

    const pending = JSON.stringify({ challenge: 'c', email: 'new@b.com', name: 'Bob' });

    const res = await request(buildPublicApp())
      .post('/api/auth/signup-register-verify')
      .set('Cookie', `webauthn_signup=${pending}`)
      .send({ response: { transports: ['usb'] } });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(DB.createUser).toHaveBeenCalledWith('Bob', 'new@b.com', null);
    expect(DB.createPasskey).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/auth/logout
// ---------------------------------------------------------------------------

describe('DELETE /auth/logout', () => {
  it('returns 204 and clears the auth cookie', async () => {
    const res = await request(buildPublicApp())
      .delete('/api/auth/logout');

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Secure router middleware
// ---------------------------------------------------------------------------

describe('secureApiRouter auth middleware', () => {
  it('returns 401 when no token cookie is provided', async () => {
    DB.getUserByToken.mockResolvedValue(null);

    const res = await request(buildSecureApp())
      .get('/api/auth/me');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------

describe('GET /auth/me', () => {
  it('returns the current user email and name', async () => {
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
    DB.deleteUser.mockResolvedValue();

    const res = await authed(request(buildSecureApp()).delete('/api/auth/account'));

    expect(res.status).toBe(204);
    expect(DB.deleteUser).toHaveBeenCalledWith('a@b.com');
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/passkeys
// ---------------------------------------------------------------------------

describe('GET /auth/passkeys', () => {
  it('returns a sanitised list of passkeys', async () => {
    const credentialID = Buffer.from('cred-id');
    DB.getUserPasskeys.mockResolvedValue([
      { credentialID, transports: ['usb'], created_at: new Date('2024-01-01') },
    ]);

    const res = await authed(request(buildSecureApp()).get('/api/auth/passkeys'));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    // Raw public key must not be present
    expect(res.body[0].publicKey).toBeUndefined();
    expect(res.body[0].credentialID).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/auth/passkeys/:id
// ---------------------------------------------------------------------------

describe('DELETE /auth/passkeys/:id', () => {
  it('deletes the passkey and returns 204', async () => {
    DB.deletePasskey.mockResolvedValue();

    const id = Buffer.from('cred').toString('base64url');
    const res = await authed(
      request(buildSecureApp()).delete(`/api/auth/passkeys/${id}`)
    );

    expect(res.status).toBe(204);
    expect(DB.deletePasskey).toHaveBeenCalled();
  });

  it('returns 400 when deletion fails', async () => {
    DB.deletePasskey.mockRejectedValue(new Error('db error'));

    const res = await authed(
      request(buildSecureApp()).delete('/api/auth/passkeys/bad-id')
    );

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register-options  (add passkey to existing account)
// ---------------------------------------------------------------------------

describe('POST /auth/register-options', () => {
  it('returns registration options and sets a challenge cookie', async () => {
    DB.getUserPasskeys.mockResolvedValue([]);
    generateRegistrationOptions.mockResolvedValue({ challenge: 'reg-chall', rp: {} });

    const res = await authed(
      request(buildSecureApp()).post('/api/auth/register-options').send({})
    );

    expect(res.status).toBe(200);
    expect(res.body.challenge).toBe('reg-chall');
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register-verify  (add passkey to existing account)
// ---------------------------------------------------------------------------

describe('POST /auth/register-verify', () => {
  it('returns 400 when no challenge cookie is present', async () => {
    const res = await authed(
      request(buildSecureApp()).post('/api/auth/register-verify').send({})
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/challenge/i);
  });

  it('adds a passkey on successful verification', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    const credentialPublicKey = new Uint8Array([4, 5, 6]);
    const credentialID = 'new-cred-id';
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { publicKey: credentialPublicKey, id: credentialID, counter: 0 },
      },
    });
    DB.createPasskey.mockResolvedValue();

    const res = await request(buildSecureApp())
      .post('/api/auth/register-verify')
      .set('Cookie', `token=${TEST_TOKEN}; webauthn_challenge=reg-chall`)
      .send({ response: { transports: ['internal'] } });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(DB.createPasskey).toHaveBeenCalled();
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
    expect(res.body.error).toMatch(/password/i);
  });

  it('updates the password and returns 204', async () => {
    DB.updateUserPassword.mockResolvedValue();

    const res = await authed(
      request(buildSecureApp()).put('/api/auth/password').send({ password: 'newSecret' })
    );

    expect(res.status).toBe(204);
    expect(DB.updateUserPassword).toHaveBeenCalledWith('a@b.com', 'newSecret');
  });
});
