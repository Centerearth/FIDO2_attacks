process.env.RP_ID = 'localhost';
process.env.ORIGIN = 'http://localhost:5173';

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

jest.mock('@simplewebauthn/server');
jest.mock('bcrypt');

const DB = require('./database.js');
const bcrypt = require('bcrypt');
const {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  generateRegistrationOptions,
  verifyRegistrationResponse,
} = require('@simplewebauthn/server');

const AuthService = require('./authService.js');
const { ServiceError } = AuthService;

const TEST_USER = { email: 'a@b.com', name: 'Alice', password: 'hashed', token: 'tok-123' };

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// ServiceError
// ---------------------------------------------------------------------------

describe('ServiceError', () => {
  it('carries a status code and message', () => {
    const err = new ServiceError('Not found', 404);
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// createUser
// ---------------------------------------------------------------------------

describe('createUser', () => {
  it('throws 409 when the user already exists', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);

    await expect(AuthService.createUser('Alice', 'a@b.com', 'pw'))
      .rejects.toMatchObject({ status: 409, message: 'Existing user' });
  });

  it('creates and returns the user when the email is free', async () => {
    DB.getUser.mockResolvedValue(null);
    DB.createUser.mockResolvedValue(TEST_USER);

    const user = await AuthService.createUser('Alice', 'a@b.com', 'pw');

    expect(DB.createUser).toHaveBeenCalledWith('Alice', 'a@b.com', 'pw');
    expect(user).toBe(TEST_USER);
  });
});

// ---------------------------------------------------------------------------
// loginUser
// ---------------------------------------------------------------------------

describe('loginUser', () => {
  it('throws 401 when the user does not exist', async () => {
    DB.getUser.mockResolvedValue(null);

    await expect(AuthService.loginUser('a@b.com', 'pw'))
      .rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 with a passkey message for passkey-only accounts', async () => {
    DB.getUser.mockResolvedValue({ ...TEST_USER, password: null });

    await expect(AuthService.loginUser('a@b.com', ''))
      .rejects.toMatchObject({ status: 401, message: expect.stringMatching(/passkey/i) });
  });

  it('throws 401 when the password does not match', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    bcrypt.compare.mockResolvedValue(false);

    await expect(AuthService.loginUser('a@b.com', 'wrong'))
      .rejects.toMatchObject({ status: 401 });
  });

  it('returns email, name, and a fresh token on success', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    bcrypt.compare.mockResolvedValue(true);
    DB.refreshUserToken.mockResolvedValue('new-token');

    const result = await AuthService.loginUser('a@b.com', 'correct');

    expect(DB.refreshUserToken).toHaveBeenCalledWith('a@b.com');
    expect(result).toEqual({ email: 'a@b.com', name: 'Alice', token: 'new-token' });
  });
});

// ---------------------------------------------------------------------------
// generateAuthOptions
// ---------------------------------------------------------------------------

describe('generateAuthOptions', () => {
  it('throws 404 when the user does not exist', async () => {
    DB.getUser.mockResolvedValue(null);

    await expect(AuthService.generateAuthOptions('missing@b.com'))
      .rejects.toMatchObject({ status: 404 });
  });

  it('calls generateAuthenticationOptions with the user\'s credential IDs', async () => {
    const credentialID = Buffer.from('cred');
    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([{ credentialID, transports: ['usb'] }]);
    generateAuthenticationOptions.mockResolvedValue({ challenge: 'ch', rpId: 'localhost' });

    const options = await AuthService.generateAuthOptions('a@b.com');

    expect(generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({ rpID: 'localhost' })
    );
    expect(options.challenge).toBe('ch');
  });
});

// ---------------------------------------------------------------------------
// verifyAuth
// ---------------------------------------------------------------------------

describe('verifyAuth', () => {
  it('throws 404 when the user does not exist', async () => {
    DB.getUser.mockResolvedValue(null);

    await expect(AuthService.verifyAuth('missing@b.com', {}, 'ch'))
      .rejects.toMatchObject({ status: 404 });
  });

  it('throws 400 when no passkey matches the response id', async () => {
    const credentialID = Buffer.from('known-cred');
    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([{ credentialID, publicKey: Buffer.from('pk'), counter: 0 }]);

    await expect(AuthService.verifyAuth('a@b.com', { id: 'no-match' }, 'ch'))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when verifyAuthenticationResponse throws', async () => {
    const credentialID = Buffer.from('cred');
    const credentialIDBase64url = credentialID.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([{ credentialID, publicKey: Buffer.from('pk'), counter: 0 }]);
    verifyAuthenticationResponse.mockRejectedValue(new Error('bad signature'));

    await expect(AuthService.verifyAuth('a@b.com', { id: credentialIDBase64url }, 'ch'))
      .rejects.toMatchObject({ status: 400, message: 'bad signature' });
  });

  it('updates the counter, refreshes the token, and returns verified result', async () => {
    const credentialID = Buffer.from('cred');
    const credentialIDBase64url = credentialID.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([{ credentialID, publicKey: Buffer.from('pk'), counter: 0 }]);
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });
    DB.updatePasskeyCounter.mockResolvedValue();
    DB.refreshUserToken.mockResolvedValue('fresh-token');

    const result = await AuthService.verifyAuth('a@b.com', { id: credentialIDBase64url }, 'ch');

    expect(DB.updatePasskeyCounter).toHaveBeenCalledWith(credentialID, 1);
    expect(DB.refreshUserToken).toHaveBeenCalledWith('a@b.com');
    expect(result).toEqual({ verified: true, email: 'a@b.com', name: 'Alice', token: 'fresh-token' });
  });
});

// ---------------------------------------------------------------------------
// generateSignupRegOptions
// ---------------------------------------------------------------------------

describe('generateSignupRegOptions', () => {
  it('throws 409 when the user already exists', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);

    await expect(AuthService.generateSignupRegOptions('a@b.com', 'Alice'))
      .rejects.toMatchObject({ status: 409 });
  });

  it('returns registration options for a new email', async () => {
    DB.getUser.mockResolvedValue(null);
    generateRegistrationOptions.mockResolvedValue({ challenge: 'signup-ch' });

    const options = await AuthService.generateSignupRegOptions('new@b.com', 'Bob');

    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({ rpID: 'localhost', userName: 'new@b.com' })
    );
    expect(options.challenge).toBe('signup-ch');
  });
});

// ---------------------------------------------------------------------------
// verifySignupReg
// ---------------------------------------------------------------------------

describe('verifySignupReg', () => {
  const pendingData = { challenge: 'ch', email: 'new@b.com', name: 'Bob' };

  it('throws 409 when the user already exists', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);

    await expect(AuthService.verifySignupReg({}, pendingData))
      .rejects.toMatchObject({ status: 409 });
  });

  it('throws 400 when verifyRegistrationResponse throws', async () => {
    DB.getUser.mockResolvedValue(null);
    verifyRegistrationResponse.mockRejectedValue(new Error('invalid attestation'));

    await expect(AuthService.verifySignupReg({}, pendingData))
      .rejects.toMatchObject({ status: 400, message: 'invalid attestation' });
  });

  it('throws 400 when credential info is missing from registrationInfo', async () => {
    DB.getUser.mockResolvedValue(null);
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: { credential: { publicKey: null, id: null, counter: 0 } },
    });

    await expect(AuthService.verifySignupReg({}, pendingData))
      .rejects.toMatchObject({ status: 400 });
  });

  it('creates the user and passkey and returns verified result', async () => {
    DB.getUser.mockResolvedValue(null);
    const credentialPublicKey = new Uint8Array([1, 2, 3]);
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { publicKey: credentialPublicKey, id: 'cred-id-b64url', counter: 0 },
      },
    });
    DB.createUser.mockResolvedValue({ email: 'new@b.com', name: 'Bob', token: 'new-tok' });
    DB.createPasskey.mockResolvedValue();

    const result = await AuthService.verifySignupReg(
      { response: { transports: ['usb'] } },
      pendingData
    );

    expect(DB.createUser).toHaveBeenCalledWith('Bob', 'new@b.com', null);
    expect(DB.createPasskey).toHaveBeenCalled();
    expect(result).toEqual({ verified: true, email: 'new@b.com', name: 'Bob', token: 'new-tok' });
  });
});

// ---------------------------------------------------------------------------
// generateRegOptions
// ---------------------------------------------------------------------------

describe('generateRegOptions', () => {
  it('excludes existing credential IDs from options', async () => {
    const credentialID = Buffer.from('existing');
    DB.getUserPasskeys.mockResolvedValue([{ credentialID, transports: ['usb'] }]);
    generateRegistrationOptions.mockResolvedValue({ challenge: 'reg-ch' });

    await AuthService.generateRegOptions('a@b.com');

    const call = generateRegistrationOptions.mock.calls[0][0];
    expect(call.excludeCredentials).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// verifyReg
// ---------------------------------------------------------------------------

describe('verifyReg', () => {
  it('throws 400 when verifyRegistrationResponse throws', async () => {
    verifyRegistrationResponse.mockRejectedValue(new Error('bad format'));

    await expect(AuthService.verifyReg({}, 'ch', 'a@b.com'))
      .rejects.toMatchObject({ status: 400, message: 'bad format' });
  });

  it('throws 400 when credential info is missing', async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: { credential: { publicKey: null, id: null, counter: 0 } },
    });

    await expect(AuthService.verifyReg({}, 'ch', 'a@b.com'))
      .rejects.toMatchObject({ status: 400 });
  });

  it('creates the passkey and returns verified', async () => {
    const credentialPublicKey = new Uint8Array([4, 5, 6]);
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { publicKey: credentialPublicKey, id: 'cred-id-b64url', counter: 1 },
      },
    });
    DB.createPasskey.mockResolvedValue();

    const result = await AuthService.verifyReg(
      { response: { transports: ['internal'] } },
      'ch',
      'a@b.com'
    );

    expect(DB.createPasskey).toHaveBeenCalledWith('a@b.com', expect.objectContaining({ counter: 1 }));
    expect(result).toEqual({ verified: true });
  });
});

// ---------------------------------------------------------------------------
// getPasskeys
// ---------------------------------------------------------------------------

describe('getPasskeys', () => {
  it('returns sanitised passkeys with base64url credential IDs', async () => {
    const credentialID = Buffer.from('raw-id');
    DB.getUserPasskeys.mockResolvedValue([
      { credentialID, transports: ['nfc'], created_at: new Date('2024-06-01') },
    ]);

    const result = await AuthService.getPasskeys('a@b.com');

    expect(result).toHaveLength(1);
    expect(result[0].credentialID).toBe(
      credentialID.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
    );
    expect(result[0].publicKey).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// deletePasskeyById
// ---------------------------------------------------------------------------

describe('deletePasskeyById', () => {
  it('decodes the id and calls DB.deletePasskey', async () => {
    DB.deletePasskey.mockResolvedValue();
    const id = Buffer.from('cred').toString('base64url');

    await AuthService.deletePasskeyById('a@b.com', id);

    expect(DB.deletePasskey).toHaveBeenCalledWith(
      'a@b.com',
      Buffer.from(id, 'base64url')
    );
  });
});

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------

describe('changePassword', () => {
  it('delegates to DB.updateUserPassword', async () => {
    DB.updateUserPassword.mockResolvedValue();

    await AuthService.changePassword('a@b.com', 'newPw');

    expect(DB.updateUserPassword).toHaveBeenCalledWith('a@b.com', 'newPw');
  });
});

// ---------------------------------------------------------------------------
// deleteAccount
// ---------------------------------------------------------------------------

describe('deleteAccount', () => {
  it('delegates to DB.deleteUser', async () => {
    DB.deleteUser.mockResolvedValue();

    await AuthService.deleteAccount('a@b.com');

    expect(DB.deleteUser).toHaveBeenCalledWith('a@b.com');
  });
});
