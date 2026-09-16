const bcrypt = require('bcrypt');
const DB = require('./database.js');
const logger = require('./logger.js');
const { nameForAuthenticator, sanitizePasskeyName } = require('./authenticatorName.js');

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const rpName = 'Simply Shopping';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || `http://${rpID}:5173`;

/**
 * Attestation conveyance for registration ceremonies.
 *
 * 'direct' asks the authenticator to identify its model, which is what lets us
 * name a passkey "Apple Passwords" or "YubiKey 5 Series". 'none' makes the
 * browser zero the AAGUID, so passkeys fall back to generic transport-based
 * names — that is the privacy-preserving setting the proxy experiments in this
 * repo assume, so it stays one environment variable away.
 */
const ATTESTATION_TYPE = process.env.ATTESTATION === 'none' ? 'none' : 'direct';

/**
 * How long a successful reauthentication stays valid, in milliseconds. The
 * window only needs to cover a single sensitive operation, because the window
 * is closed again as soon as one completes.
 */
const REAUTH_WINDOW_MS = Number(process.env.REAUTH_WINDOW_MS) || 300000; // 5 minutes

/**
 * Whether registration demands a discoverable credential (a "resident key").
 *
 * 'required' is what lets someone sign in with nothing but their passkey. A few
 * older security keys cannot store discoverable credentials, so
 * RESIDENT_KEY=preferred falls back to letting them register a
 * non-discoverable credential, which then needs an email at sign-in.
 */
const RESIDENT_KEY = process.env.RESIDENT_KEY === 'preferred' ? 'preferred' : 'required';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Every operation that can be placed behind a reauthentication prompt.
 * Kept as a list so the user study can vary which ones are gated.
 */
const REAUTH_OPERATIONS = [
  'add-passkey',
  'delete-passkey',
  'rename-passkey',
  'delete-account',
  'change-password',
];

/**
 * Study switch: set REAUTH_REQUIRED=false to run the control condition, where
 * signed-in users manage passkeys without proving who they are again.
 */
const REAUTH_ENABLED = process.env.REAUTH_REQUIRED !== 'false';

/**
 * Study switch: a comma-separated subset of REAUTH_OPERATIONS. Unset means
 * every operation is gated. Unknown names are ignored rather than silently
 * disabling the gate, so a typo cannot quietly weaken the treatment.
 */
const GATED_OPERATIONS = (() => {
  const raw = process.env.REAUTH_OPERATIONS;
  if (!raw) return new Set(REAUTH_OPERATIONS);
  const requested = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = requested.filter((op) => !REAUTH_OPERATIONS.includes(op));
  if (unknown.length) {
    logger.warn({ unknown }, 'Ignoring unknown REAUTH_OPERATIONS entries');
  }
  return new Set(requested.filter((op) => REAUTH_OPERATIONS.includes(op)));
})();

/** Whether the named operation needs a fresh reauthentication. */
function isReauthRequired(operation) {
  return REAUTH_ENABLED && GATED_OPERATIONS.has(operation);
}

/** The operations currently gated, for the client to render prompts honestly. */
function gatedOperations() {
  return REAUTH_ENABLED ? [...GATED_OPERATIONS] : [];
}

class ServiceError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Converts a MongoDB Binary / Buffer credentialID to base64url string
function toBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Decodes the user handle an authenticator returns during a discoverable
 * sign-in. Registration sets `userID` to the account's email bytes, so this
 * reads back as the email.
 *
 * @param {string} userHandle - base64url as sent by the browser.
 * @returns {string|null} the decoded handle, or null if it is not readable.
 */
function decodeUserHandle(userHandle) {
  try {
    return Buffer.from(userHandle, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Parses a base64url credential ID coming from the client.
 * @throws {ServiceError} 400 when the ID is missing or not base64url.
 */
function parseCredentialId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new ServiceError('Invalid passkey identifier.', 400);
  }
  return Buffer.from(id, 'base64url');
}

// ---------------------------------------------------------------------------
// Password authentication
// ---------------------------------------------------------------------------

async function createUser(name, email, password) {
  logger.info({ email }, 'Creating user');
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new ServiceError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`, 400);
  }
  if (await DB.getUser(email)) {
    logger.warn({ email }, 'User creation failed: already exists');
    throw new ServiceError('Existing user', 409);
  }
  const user = await DB.createUser(name, email, password);
  logger.info({ email }, 'User created');
  return user;
}

async function loginUser(email, password) {
  logger.info({ email }, 'Login attempt');
  const user = await DB.getUser(email);

  if (!user) {
    logger.warn({ email }, 'Login failed: user not found');
    throw new ServiceError('Unauthorized', 401);
  }
  if (!user.password) {
    logger.warn({ email }, 'Login failed: passkey-only account');
    throw new ServiceError('Unauthorized: Please use a passkey to sign in', 401);
  }
  if (!password || !(await bcrypt.compare(password, user.password))) {
    logger.warn({ email }, 'Login failed: incorrect password');
    throw new ServiceError('Unauthorized', 401);
  }

  logger.info({ email }, 'Login successful');
  const token = await DB.refreshUserToken(email);
  return { email: user.email, name: user.name, token };
}

async function changePassword(email, password) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new ServiceError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`, 400);
  }
  await DB.updateUserPassword(email, password);
}

// ---------------------------------------------------------------------------
// Passkey sign-in
// ---------------------------------------------------------------------------

/**
 * Builds sign-in options.
 *
 * With no email this is a discoverable-credential ceremony: `allowCredentials`
 * is left off entirely, so the authenticator offers whichever passkeys it holds
 * for this site and the user picks one. The account is then identified from the
 * credential itself, so the user never types a username.
 *
 * An email may still be passed, which narrows the ceremony to that account's
 * credentials and keeps older, non-discoverable passkeys working.
 *
 * @param {string} [email]
 */
async function generateAuthOptions(email) {
  if (!email) {
    return generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
    });
  }

  const user = await DB.getUser(email);
  if (!user) {
    throw new ServiceError('User not found.', 404);
  }

  const userPasskeys = await DB.getUserPasskeys(email);
  return generateAuthenticationOptions({
    rpID,
    allowCredentials: userPasskeys.filter((pk) => pk.credentialID).map((pk) => ({
      id: toBase64Url(pk.credentialID),
      transports: pk.transports,
    })),
    userVerification: 'preferred',
  });
}

/**
 * Shared core of passkey sign-in and passkey reauthentication: checks an
 * assertion against the user's stored credentials and bumps the signature
 * counter. Returns the passkey that signed.
 */
/**
 * Finds the passkey an assertion was signed with, and the account it belongs to.
 *
 * With an email, the passkey must be one of that account's. Without one this is
 * a discoverable-credential sign-in, so the credential ID identifies the
 * account by itself.
 */
async function resolveAssertionCredential(email, response) {
  if (email) {
    const user = await DB.getUser(email);
    if (!user) {
      throw new ServiceError('User not found.', 404);
    }
    const userPasskeys = await DB.getUserPasskeys(email);
    const passkey = userPasskeys.find((pk) => toBase64Url(pk.credentialID) === response.id);
    if (!passkey) {
      throw new ServiceError('Could not find a matching passkey for this user.', 400);
    }
    return { user, passkey };
  }

  if (!response || typeof response.id !== 'string') {
    throw new ServiceError('Authentication response is missing a credential ID.', 400);
  }

  const passkey = await DB.getPasskeyByCredentialID(parseCredentialId(response.id));
  if (!passkey) {
    throw new ServiceError('That passkey is not registered here.', 400);
  }

  const user = await DB.getUser(passkey.email);
  if (!user) {
    // A passkey whose account is gone; treat it as unusable rather than 500.
    throw new ServiceError('That passkey is not registered here.', 400);
  }

  // When the authenticator reports a user handle it must agree with the account
  // the credential is filed under, so a mismatched pair cannot sign anyone in.
  const userHandle = response.response?.userHandle;
  if (userHandle && decodeUserHandle(userHandle) !== user.email) {
    logger.warn({ email: user.email }, 'Assertion user handle did not match the credential owner');
    throw new ServiceError('That passkey does not match the account it belongs to.', 400);
  }

  return { user, passkey };
}

async function verifyAssertion(email, response, challenge) {
  const { user, passkey } = await resolveAssertionCredential(email, response);

  const publicKeyBuffer = passkey.publicKey.buffer || passkey.publicKey;
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: response.id,
        publicKey: new Uint8Array(publicKeyBuffer),
        counter: passkey.counter,
      },
      requireUserVerification: false,
    });
  } catch (e) {
    throw new ServiceError(e.message, 400);
  }

  const { verified, authenticationInfo } = verification;
  if (!verified) {
    throw new ServiceError('Verification failed.', 400);
  }

  await DB.updatePasskeyCounter(passkey.credentialID, authenticationInfo.newCounter);
  return { user, passkey };
}

async function verifyAuth(email, response, challenge) {
  const { user } = await verifyAssertion(email, response, challenge);
  const token = await DB.refreshUserToken(user.email);
  return { verified: true, email: user.email, name: user.name, token };
}

// ---------------------------------------------------------------------------
// Passkey registration
// ---------------------------------------------------------------------------

async function generateSignupRegOptions(email, name) {
  if (await DB.getUser(email)) {
    throw new ServiceError('User already exists.', 409);
  }

  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: new Uint8Array(Buffer.from(email)),
    userName: email,
    // Shown in the authenticator's account chooser at sign-in time.
    userDisplayName: name || email,
    attestationType: ATTESTATION_TYPE,
    authenticatorSelection: {
      // Discoverable, so the passkey alone identifies the account and the user
      // never has to type a username to sign in.
      residentKey: RESIDENT_KEY,
      requireResidentKey: RESIDENT_KEY === 'required',
      userVerification: 'preferred',
    },
  });
}

/**
 * Runs verifyRegistrationResponse and pulls out the fields we persist,
 * including the AAGUID used to name the passkey after its authenticator.
 */
async function extractRegistration(body, challenge) {
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (e) {
    throw new ServiceError(e.message, 400);
  }

  const { verified, registrationInfo } = verification;
  if (!verified || !registrationInfo) {
    throw new ServiceError('Verification failed.', 400);
  }

  const credentialPublicKey = registrationInfo.credential?.publicKey || registrationInfo.credentialPublicKey;
  const credentialID = registrationInfo.credential?.id;
  const counter = registrationInfo.credential?.counter ?? registrationInfo.counter;

  if (!credentialPublicKey || !credentialID) {
    logger.error('Registration failed: missing key details');
    throw new ServiceError('Registration failed: authenticator response missing key details.', 400);
  }

  return {
    publicKey: Buffer.from(credentialPublicKey),
    credentialID: typeof credentialID === 'string' ? Buffer.from(credentialID, 'base64url') : Buffer.from(credentialID),
    counter,
    transports: body.response?.transports,
    aaguid: registrationInfo.aaguid,
    deviceType: registrationInfo.credentialDeviceType,
    backedUp: registrationInfo.credentialBackedUp,
  };
}

async function verifySignupReg(body, pendingData) {
  if (await DB.getUser(pendingData.email)) {
    throw new ServiceError('User already exists.', 409);
  }

  const registration = await extractRegistration(body, pendingData.challenge);

  const user = await DB.createUser(pendingData.name, pendingData.email, pendingData.password || null);
  await DB.createPasskey(user.email, {
    ...registration,
    name: nameForAuthenticator({
      aaguid: registration.aaguid,
      transports: registration.transports,
      deviceType: registration.deviceType,
      existingNames: [],
    }),
  });

  return { verified: true, email: user.email, name: user.name, token: user.token };
}

async function generateRegOptions(email) {
  const [user, userPasskeys] = await Promise.all([
    DB.getUser(email),
    DB.getUserPasskeys(email),
  ]);
  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: new Uint8Array(Buffer.from(email)),
    userName: email,
    userDisplayName: user?.name || email,
    attestationType: ATTESTATION_TYPE,
    excludeCredentials: userPasskeys.filter((pk) => pk.credentialID).map((pk) => ({
      id: toBase64Url(pk.credentialID),
      transports: pk.transports,
    })),
    authenticatorSelection: {
      residentKey: RESIDENT_KEY,
      requireResidentKey: RESIDENT_KEY === 'required',
      userVerification: 'preferred',
    },
  });
}

async function verifyReg(body, challenge, email) {
  const registration = await extractRegistration(body, challenge);

  const existing = await DB.getUserPasskeys(email);
  const name = nameForAuthenticator({
    aaguid: registration.aaguid,
    transports: registration.transports,
    deviceType: registration.deviceType,
    existingNames: existing.map((pk) => pk.name),
  });

  await DB.createPasskey(email, { ...registration, name });

  return { verified: true, name };
}

// ---------------------------------------------------------------------------
// Passkey management
// ---------------------------------------------------------------------------

async function getPasskeys(email) {
  const userPasskeys = await DB.getUserPasskeys(email);
  return userPasskeys.map((key) => ({
    credentialID: toBase64Url(key.credentialID),
    // Passkeys registered before authenticator naming existed have no name;
    // fall back to something readable rather than showing "undefined".
    name: key.name || nameForAuthenticator({
      aaguid: key.aaguid,
      transports: key.transports,
      deviceType: key.deviceType,
    }),
    aaguid: key.aaguid,
    deviceType: key.deviceType,
    backedUp: key.backedUp,
    transports: key.transports,
    created_at: key.created_at,
  }));
}

async function renamePasskey(email, id, rawName) {
  const credentialIDBuffer = parseCredentialId(id);
  let name;
  try {
    name = sanitizePasskeyName(rawName);
  } catch (e) {
    throw new ServiceError(e.message, 400);
  }

  const matched = await DB.renamePasskey(email, credentialIDBuffer, name);
  if (!matched) {
    throw new ServiceError('Passkey not found.', 404);
  }
  logger.info({ email }, 'Passkey renamed');
  return { credentialID: id, name };
}

/**
 * Deletes one of the user's passkeys.
 *
 * Refuses to remove the account's last remaining way to sign in. Without this
 * a passkey-only user who deletes their only passkey cannot sign in again, and
 * cannot even reauthenticate to add a replacement, so the account is stranded.
 */
async function deletePasskeyById(email, id) {
  const credentialIDBuffer = parseCredentialId(id);

  const user = await DB.getUser(email);
  if (!user) {
    throw new ServiceError('User not found.', 404);
  }
  const passkeys = await DB.getUserPasskeys(email);
  const isLastPasskey = passkeys.length <= 1;
  if (isLastPasskey && !user.password) {
    throw new ServiceError(
      'This is the only way to sign in to your account. Add another passkey or set a password before deleting it.',
      400
    );
  }

  const deleted = await DB.deletePasskey(email, credentialIDBuffer);
  if (!deleted) {
    throw new ServiceError('Passkey not found.', 404);
  }
  logger.info({ email }, 'Passkey deleted');
}

async function deleteAccount(email) {
  await DB.deleteUser(email);
}

// ---------------------------------------------------------------------------
// Reauthentication
//
// Sensitive operations (adding, renaming or deleting a passkey, deleting the
// account) require the user to prove who they are again, even though they are
// already signed in. A successful proof opens a short window, and completing
// one sensitive operation closes it again, so every operation costs one
// reauthentication.
// ---------------------------------------------------------------------------

/** True when the user reauthenticated recently enough. */
function hasFreshReauth(user) {
  if (!user || !user.reauth_until) return false;
  return new Date(user.reauth_until).getTime() > Date.now();
}

/** Which reauthentication methods this account can actually use. */
async function getReauthMethods(user) {
  const passkeys = await DB.getUserPasskeys(user.email);
  return {
    password: Boolean(user.password),
    passkey: passkeys.length > 0,
  };
}

async function getReauthStatus(user) {
  return {
    reauthenticated: hasFreshReauth(user),
    expiresAt: hasFreshReauth(user) ? new Date(user.reauth_until).toISOString() : null,
    methods: await getReauthMethods(user),
    gatedOperations: gatedOperations(),
  };
}

/** Opens the reauthentication window for the user. */
async function grantReauth(email) {
  const until = new Date(Date.now() + REAUTH_WINDOW_MS);
  await DB.setReauthUntil(email, until);
  logger.info({ email }, 'Reauthentication granted');
  return { reauthenticated: true, expiresAt: until.toISOString() };
}

/** Closes the window once a sensitive operation has been carried out. */
async function consumeReauth(email) {
  await DB.clearReauth(email);
  logger.debug({ email }, 'Reauthentication consumed');
}

async function generateReauthOptions(email) {
  const userPasskeys = await DB.getUserPasskeys(email);
  if (userPasskeys.length === 0) {
    throw new ServiceError('This account has no passkey to reauthenticate with.', 400);
  }
  return generateAuthenticationOptions({
    rpID,
    allowCredentials: userPasskeys.filter((pk) => pk.credentialID).map((pk) => ({
      id: toBase64Url(pk.credentialID),
      transports: pk.transports,
    })),
    // Reauthentication is the one place we want the authenticator to actually
    // check the user, not just their presence.
    userVerification: 'preferred',
  });
}

/**
 * Reauthenticates with a passkey. Unlike sign-in this does not rotate the
 * session token — the user is already signed in.
 */
async function verifyReauth(email, response, challenge) {
  await verifyAssertion(email, response, challenge);
  return grantReauth(email);
}

async function verifyReauthPassword(email, password) {
  const user = await DB.getUser(email);
  if (!user) {
    throw new ServiceError('User not found.', 404);
  }
  if (!user.password) {
    throw new ServiceError('This account has no password. Reauthenticate with a passkey.', 400);
  }
  if (!password || !(await bcrypt.compare(password, user.password))) {
    logger.warn({ email }, 'Reauthentication failed: incorrect password');
    throw new ServiceError('Incorrect password.', 401);
  }
  return grantReauth(email);
}

module.exports = {
  ServiceError,
  REAUTH_WINDOW_MS,
  REAUTH_OPERATIONS,
  ATTESTATION_TYPE,
  RESIDENT_KEY,
  decodeUserHandle,
  MIN_PASSWORD_LENGTH,
  createUser,
  loginUser,
  changePassword,
  generateAuthOptions,
  verifyAuth,
  generateSignupRegOptions,
  verifySignupReg,
  generateRegOptions,
  verifyReg,
  getPasskeys,
  renamePasskey,
  deletePasskeyById,
  deleteAccount,
  isReauthRequired,
  gatedOperations,
  hasFreshReauth,
  getReauthStatus,
  getReauthMethods,
  grantReauth,
  consumeReauth,
  generateReauthOptions,
  verifyReauth,
  verifyReauthPassword,
};
