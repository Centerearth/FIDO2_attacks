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
  renamePasskey: jest.fn(),
  setReauthUntil: jest.fn(),
  clearReauth: jest.fn(),
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

    await expect(AuthService.createUser('Alice', 'a@b.com', 'longenough'))
      .rejects.toMatchObject({ status: 409, message: 'Existing user' });
  });

  it('creates and returns the user when the email is free', async () => {
    DB.getUser.mockResolvedValue(null);
    DB.createUser.mockResolvedValue(TEST_USER);

    const user = await AuthService.createUser('Alice', 'a@b.com', 'longenough');

    expect(DB.createUser).toHaveBeenCalledWith('Alice', 'a@b.com', 'longenough');
    expect(user).toBe(TEST_USER);
  });

  // The browser used to be the only thing enforcing this, so a direct API call
  // could create an account with a one-character password.
  it('throws 400 for a password shorter than 8 characters', async () => {
    await expect(AuthService.createUser('Alice', 'a@b.com', 'short'))
      .rejects.toMatchObject({ status: 400 });
    expect(DB.createUser).not.toHaveBeenCalled();
  });

  it('throws 400 when no password is given', async () => {
    await expect(AuthService.createUser('Alice', 'a@b.com', ''))
      .rejects.toMatchObject({ status: 400 });
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
    // With no AAGUID the name falls back to the transport the browser reported.
    expect(result).toEqual({ verified: true, name: 'This Device' });
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
  const id = Buffer.from('cred').toString('base64url');

  /** An account that still has another way in, so deleting is allowed. */
  function accountWithSpareCredential() {
    DB.getUser.mockResolvedValue(TEST_USER); // has a password
    DB.getUserPasskeys.mockResolvedValue([{ credentialID: Buffer.from('cred') }]);
  }

  it('decodes the id and calls DB.deletePasskey', async () => {
    accountWithSpareCredential();
    DB.deletePasskey.mockResolvedValue(1);

    await AuthService.deletePasskeyById('a@b.com', id);

    expect(DB.deletePasskey).toHaveBeenCalledWith(
      'a@b.com',
      Buffer.from(id, 'base64url')
    );
  });

  it('throws 404 when the passkey is not the user\'s', async () => {
    accountWithSpareCredential();
    DB.deletePasskey.mockResolvedValue(0);

    await expect(AuthService.deletePasskeyById('a@b.com', 'Y3JlZA'))
      .rejects.toMatchObject({ status: 404 });
  });

  // Without this guard a passkey-only user can delete their only passkey and
  // then neither sign in nor reauthenticate to add a replacement.
  it('refuses to delete the last passkey of a passkey-only account', async () => {
    DB.getUser.mockResolvedValue({ ...TEST_USER, password: null });
    DB.getUserPasskeys.mockResolvedValue([{ credentialID: Buffer.from('cred') }]);

    await expect(AuthService.deletePasskeyById('a@b.com', id))
      .rejects.toMatchObject({ status: 400, message: expect.stringMatching(/only way to sign in/i) });
    expect(DB.deletePasskey).not.toHaveBeenCalled();
  });

  it('allows deleting the last passkey when the account has a password', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([{ credentialID: Buffer.from('cred') }]);
    DB.deletePasskey.mockResolvedValue(1);

    await expect(AuthService.deletePasskeyById('a@b.com', id)).resolves.toBeUndefined();
  });

  it('allows a passkey-only account to delete one of several passkeys', async () => {
    DB.getUser.mockResolvedValue({ ...TEST_USER, password: null });
    DB.getUserPasskeys.mockResolvedValue([
      { credentialID: Buffer.from('cred') },
      { credentialID: Buffer.from('cred2') },
    ]);
    DB.deletePasskey.mockResolvedValue(1);

    await expect(AuthService.deletePasskeyById('a@b.com', id)).resolves.toBeUndefined();
  });

  it('throws 400 for an id that is not base64url', async () => {
    await expect(AuthService.deletePasskeyById('a@b.com', 'not valid!'))
      .rejects.toMatchObject({ status: 400 });
    expect(DB.deletePasskey).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------

describe('changePassword', () => {
  it('delegates to DB.updateUserPassword', async () => {
    DB.updateUserPassword.mockResolvedValue();

    await AuthService.changePassword('a@b.com', 'newPassword1');

    expect(DB.updateUserPassword).toHaveBeenCalledWith('a@b.com', 'newPassword1');
  });

  it('throws 400 for a password shorter than 8 characters', async () => {
    await expect(AuthService.changePassword('a@b.com', 'newPw'))
      .rejects.toMatchObject({ status: 400 });
    expect(DB.updateUserPassword).not.toHaveBeenCalled();
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

// ---------------------------------------------------------------------------
// renamePasskey
// ---------------------------------------------------------------------------

describe('renamePasskey', () => {
  const id = Buffer.from('cred').toString('base64url');

  it('trims the name and stores it', async () => {
    DB.renamePasskey.mockResolvedValue(1);

    const result = await AuthService.renamePasskey('a@b.com', id, '  Work   Key  ');

    expect(DB.renamePasskey).toHaveBeenCalledWith('a@b.com', Buffer.from(id, 'base64url'), 'Work Key');
    expect(result).toEqual({ credentialID: id, name: 'Work Key' });
  });

  it('throws 400 for an empty name', async () => {
    await expect(AuthService.renamePasskey('a@b.com', id, '   '))
      .rejects.toMatchObject({ status: 400 });
    expect(DB.renamePasskey).not.toHaveBeenCalled();
  });

  it('throws 400 for a name longer than 64 characters', async () => {
    await expect(AuthService.renamePasskey('a@b.com', id, 'x'.repeat(65)))
      .rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when the name is not a string', async () => {
    await expect(AuthService.renamePasskey('a@b.com', id, { evil: true }))
      .rejects.toMatchObject({ status: 400 });
  });

  // A user must not be able to rename somebody else's passkey by guessing an id.
  it('throws 404 when no passkey of the user matches', async () => {
    DB.renamePasskey.mockResolvedValue(0);

    await expect(AuthService.renamePasskey('a@b.com', id, 'Mine'))
      .rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// Authenticator naming
// ---------------------------------------------------------------------------

describe('passkey naming', () => {
  it('names a new passkey after its authenticator model', async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        // Apple's AAGUID, present when attestation is requested.
        aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
        credential: { publicKey: new Uint8Array([1]), id: 'Y3JlZA', counter: 0 },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    });
    DB.getUserPasskeys.mockResolvedValue([]);
    DB.createPasskey.mockResolvedValue();

    const result = await AuthService.verifyReg({ response: { transports: ['internal'] } }, 'ch', 'a@b.com');

    expect(result.name).toBe('Apple Passwords');
    expect(DB.createPasskey).toHaveBeenCalledWith(
      'a@b.com',
      expect.objectContaining({ name: 'Apple Passwords', aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd' })
    );
  });

  it('numbers a second passkey of the same model', async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
        credential: { publicKey: new Uint8Array([1]), id: 'Y3JlZA', counter: 0 },
        credentialDeviceType: 'multiDevice',
      },
    });
    DB.getUserPasskeys.mockResolvedValue([{ name: 'Apple Passwords' }]);
    DB.createPasskey.mockResolvedValue();

    const result = await AuthService.verifyReg({ response: {} }, 'ch', 'a@b.com');

    expect(result.name).toBe('Apple Passwords (2)');
  });

  // With ATTESTATION=none the browser zeroes the AAGUID, so naming has to
  // degrade to something readable rather than showing an empty label.
  it('falls back to the transport when the AAGUID is zeroed', async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        aaguid: '00000000-0000-0000-0000-000000000000',
        credential: { publicKey: new Uint8Array([1]), id: 'Y3JlZA', counter: 0 },
        credentialDeviceType: 'singleDevice',
      },
    });
    DB.getUserPasskeys.mockResolvedValue([]);
    DB.createPasskey.mockResolvedValue();

    const result = await AuthService.verifyReg({ response: { transports: ['usb'] } }, 'ch', 'a@b.com');

    expect(result.name).toBe('USB Security Key');
  });

  it('gives passkeys registered before naming existed a readable name', async () => {
    DB.getUserPasskeys.mockResolvedValue([
      { credentialID: Buffer.from('cred'), transports: ['nfc'], created_at: new Date() },
    ]);

    const [passkey] = await AuthService.getPasskeys('a@b.com');

    expect(passkey.name).toBe('NFC Security Key');
  });
});

// ---------------------------------------------------------------------------
// Reauthentication
// ---------------------------------------------------------------------------

describe('hasFreshReauth', () => {
  it('is false for a user who has never reauthenticated', () => {
    expect(AuthService.hasFreshReauth({ email: 'a@b.com' })).toBe(false);
  });

  it('is false once the window has passed', () => {
    expect(AuthService.hasFreshReauth({ reauth_until: new Date(Date.now() - 1000) })).toBe(false);
  });

  it('is true inside the window', () => {
    expect(AuthService.hasFreshReauth({ reauth_until: new Date(Date.now() + 60000) })).toBe(true);
  });

  it('is false for a null user', () => {
    expect(AuthService.hasFreshReauth(null)).toBe(false);
  });
});

describe('getReauthStatus', () => {
  it('reports the methods the account can actually use', async () => {
    DB.getUserPasskeys.mockResolvedValue([{ credentialID: Buffer.from('cred') }]);

    const status = await AuthService.getReauthStatus({ email: 'a@b.com', password: 'hashed' });

    expect(status.methods).toEqual({ password: true, passkey: true });
    expect(status.reauthenticated).toBe(false);
  });

  it('offers only passkey for an account with no password', async () => {
    DB.getUserPasskeys.mockResolvedValue([{ credentialID: Buffer.from('cred') }]);

    const status = await AuthService.getReauthStatus({ email: 'a@b.com', password: null });

    expect(status.methods).toEqual({ password: false, passkey: true });
  });

  it('offers only password for an account with no passkey yet', async () => {
    DB.getUserPasskeys.mockResolvedValue([]);

    const status = await AuthService.getReauthStatus({ email: 'a@b.com', password: 'hashed' });

    expect(status.methods).toEqual({ password: true, passkey: false });
  });
});

describe('verifyReauthPassword', () => {
  it('opens the window for the correct password', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    bcrypt.compare.mockResolvedValue(true);
    DB.setReauthUntil.mockResolvedValue();

    const result = await AuthService.verifyReauthPassword('a@b.com', 'correct');

    expect(result.reauthenticated).toBe(true);
    expect(DB.setReauthUntil).toHaveBeenCalledWith('a@b.com', expect.any(Date));
  });

  it('throws 401 for the wrong password and opens no window', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    bcrypt.compare.mockResolvedValue(false);

    await expect(AuthService.verifyReauthPassword('a@b.com', 'wrong'))
      .rejects.toMatchObject({ status: 401 });
    expect(DB.setReauthUntil).not.toHaveBeenCalled();
  });

  it('throws 400 for an account with no password', async () => {
    DB.getUser.mockResolvedValue({ ...TEST_USER, password: null });

    await expect(AuthService.verifyReauthPassword('a@b.com', 'anything'))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('verifyReauth', () => {
  const credentialID = Buffer.from('cred');
  const credentialIDBase64url = credentialID.toString('base64url');

  it('opens the window without rotating the session token', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([{ credentialID, publicKey: Buffer.from('pk'), counter: 0 }]);
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 1 },
    });
    DB.updatePasskeyCounter.mockResolvedValue();
    DB.setReauthUntil.mockResolvedValue();

    const result = await AuthService.verifyReauth('a@b.com', { id: credentialIDBase64url }, 'ch');

    expect(result.reauthenticated).toBe(true);
    // Rotating the token here would invalidate the signed-in session's cookie.
    expect(DB.refreshUserToken).not.toHaveBeenCalled();
  });

  it('opens no window when the assertion does not verify', async () => {
    DB.getUser.mockResolvedValue(TEST_USER);
    DB.getUserPasskeys.mockResolvedValue([{ credentialID, publicKey: Buffer.from('pk'), counter: 0 }]);
    verifyAuthenticationResponse.mockRejectedValue(new Error('bad signature'));

    await expect(AuthService.verifyReauth('a@b.com', { id: credentialIDBase64url }, 'ch'))
      .rejects.toMatchObject({ status: 400 });
    expect(DB.setReauthUntil).not.toHaveBeenCalled();
  });
});

describe('generateReauthOptions', () => {
  it('throws 400 when the account has no passkey', async () => {
    DB.getUserPasskeys.mockResolvedValue([]);

    await expect(AuthService.generateReauthOptions('a@b.com'))
      .rejects.toMatchObject({ status: 400 });
  });
});

describe('isReauthRequired', () => {
  it('gates every sensitive operation by default', () => {
    for (const operation of AuthService.REAUTH_OPERATIONS) {
      expect(AuthService.isReauthRequired(operation)).toBe(true);
    }
  });

  it('does not gate an unknown operation', () => {
    expect(AuthService.isReauthRequired('browse-catalogue')).toBe(false);
  });
});
