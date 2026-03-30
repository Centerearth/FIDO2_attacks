const bcrypt = require('bcrypt');
const DB = require('./database.js');
const logger = require('./logger.js');

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const rpName = 'Simply Shopping';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.ORIGIN || `http://${rpID}:5173`;

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

async function createUser(name, email, password) {
  logger.info({ email }, 'Creating user');
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

async function generateAuthOptions(email) {
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

async function verifyAuth(email, response, challenge) {
  const user = await DB.getUser(email);
  if (!user) {
    throw new ServiceError('User not found.', 404);
  }

  const userPasskeys = await DB.getUserPasskeys(email);
  const passkey = userPasskeys.find((pk) => toBase64Url(pk.credentialID) === response.id);
  if (!passkey) {
    throw new ServiceError('Could not find a matching passkey for this user.', 400);
  }

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
  const token = await DB.refreshUserToken(user.email);
  return { verified: true, email: user.email, name: user.name, token };
}

async function generateSignupRegOptions(email, name) {
  if (await DB.getUser(email)) {
    throw new ServiceError('User already exists.', 409);
  }

  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: new Uint8Array(Buffer.from(email)),
    userName: email,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
}

async function verifySignupReg(body, pendingData) {
  if (await DB.getUser(pendingData.email)) {
    throw new ServiceError('User already exists.', 409);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: pendingData.challenge,
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

  const user = await DB.createUser(pendingData.name, pendingData.email, null);
  await DB.createPasskey(user.email, {
    publicKey: Buffer.from(credentialPublicKey),
    credentialID: typeof credentialID === 'string' ? Buffer.from(credentialID, 'base64url') : Buffer.from(credentialID),
    counter,
    transports: body.response?.transports,
  });

  return { verified: true, email: user.email, name: user.name, token: user.token };
}

async function generateRegOptions(email) {
  const userPasskeys = await DB.getUserPasskeys(email);
  return generateRegistrationOptions({
    rpName,
    rpID,
    userID: new Uint8Array(Buffer.from(email)),
    userName: email,
    excludeCredentials: userPasskeys.filter((pk) => pk.credentialID).map((pk) => ({
      id: toBase64Url(pk.credentialID),
      transports: pk.transports,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
}

async function verifyReg(body, challenge, email) {
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

  await DB.createPasskey(email, {
    publicKey: Buffer.from(credentialPublicKey),
    credentialID: typeof credentialID === 'string' ? Buffer.from(credentialID, 'base64url') : Buffer.from(credentialID),
    counter,
    transports: body.response?.transports,
  });

  return { verified: true };
}

async function getPasskeys(email) {
  const userPasskeys = await DB.getUserPasskeys(email);
  return userPasskeys.map((key) => ({
    credentialID: toBase64Url(key.credentialID),
    transports: key.transports,
    created_at: key.created_at,
  }));
}

async function deletePasskeyById(email, id) {
  const credentialIDBuffer = Buffer.from(id, 'base64url');
  await DB.deletePasskey(email, credentialIDBuffer);
}

async function changePassword(email, password) {
  await DB.updateUserPassword(email, password);
}

async function deleteAccount(email) {
  await DB.deleteUser(email);
}

module.exports = {
  ServiceError,
  createUser,
  loginUser,
  generateAuthOptions,
  verifyAuth,
  generateSignupRegOptions,
  verifySignupReg,
  generateRegOptions,
  verifyReg,
  getPasskeys,
  deletePasskeyById,
  changePassword,
  deleteAccount,
};
