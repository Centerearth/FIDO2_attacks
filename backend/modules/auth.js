const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const DB = require('./database.js');

const { 
  generateRegistrationOptions, 
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const rpName = 'Simply Shopping';
const rpID = 'localhost';
const origin = `http://${rpID}:5173`;
const authCookieName = 'token';
const router = express.Router();

// Use the cookie parser middleware for tracking authentication tokens
router.use(cookieParser());

// CreateAuth token for a new user
router.post('/auth/create', async (req, res) => {
  console.log(`[AUTH] Creating user: ${req.body.email}`);
  if (await DB.getUser(req.body.email)) {
    console.log(`[AUTH] User creation failed: ${req.body.email} already exists`);
    res.status(409).send({ msg: 'Existing user' });
  } else {
    const user = await DB.createUser(req.body.name, req.body.email, req.body.password);
    console.log(`[AUTH] User created: ${req.body.email}`);

    // Set the cookie
    setAuthCookie(res, user.token);

    res.send({
      email: user.email,
      name: user.name,
    });
  }
});

// GetAuth token for the provided credentials
router.post('/auth/login', async (req, res) => {
  console.log(`[AUTH] Login attempt: ${req.body.email}`);
  const user = await DB.getUser(req.body.email);
  if (user) {
    if (await bcrypt.compare(req.body.password, user.password)) {
      console.log(`[AUTH] Login successful: ${req.body.email}`);
      const newToken = await DB.refreshUserToken(user.email);
      setAuthCookie(res, newToken);
      res.send({ email: user.email, name: user.name });
      return;
    }
  }
  console.log(`[AUTH] Login failed: ${req.body.email}`);
  res.status(401).send({ msg: 'Unauthorized' });
});

// Generate options for passkey authentication
router.post('/auth/authentication-options', async (req, res) => {
  const email = req.body.email;
  if (!email) {
    return res.status(400).send({ error: 'Email is required to log in.' });
  }

  const user = await DB.getUser(email);
  if (!user) {
    return res.status(404).send({ error: 'User not found.' });
  }

  const userPasskeys = await DB.getUserPasskeys(email);

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: userPasskeys.filter((pk) => pk.credentialID).map((passkey) => ({
      id: passkey.credentialID.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
      transports: passkey.transports,
    })),
    userVerification: 'preferred',
  });

  res.cookie('webauthn_challenge', options.challenge, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 300000, // 5 minutes
  });
  res.send(options);
});

// Verify passkey authentication response
router.post('/auth/authentication-verify', async (req, res) => {
  const { email, response } = req.body;
  if (!email || !response) {
    return res.status(400).send({ error: 'Email and authentication response are required.' });
  }

  const user = await DB.getUser(email);
  if (!user) {
    return res.status(404).send({ error: 'User not found.' });
  }

  const expectedChallenge = req.cookies.webauthn_challenge;
  if (!expectedChallenge) {
    return res.status(400).send({ error: 'Challenge expired or not found.' });
  }

  const userPasskeys = await DB.getUserPasskeys(email);

  // Find the passkey that matches the id in the response
  const passkey = userPasskeys.find(
    (pk) => pk.credentialID.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') === response.id
  );

  if (!passkey) {
    return res.status(400).send({ error: 'Could not find a matching passkey for this user.' });
  }

  let verification;
  try {
    // Ensure keys are safely extracted into Uint8Arrays for the verification engine
    const publicKeyBuffer = passkey.publicKey.buffer || passkey.publicKey;
    const credentialIDBuffer = passkey.credentialID.buffer || passkey.credentialID;

    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: response.id,
        publicKey: new Uint8Array(publicKeyBuffer),
        counter: passkey.counter,
      },
      requireUserVerification: false,
    });
  } catch (error) {
    console.error(error);
    return res.status(400).send({ error: error.message });
  }

  const { verified, authenticationInfo } = verification;

  if (verified) {
    // Update the counter to prevent replay attacks
    await DB.updatePasskeyCounter(passkey.credentialID, authenticationInfo.newCounter);
    res.clearCookie('webauthn_challenge');
    
    // Set the authentication cookie to log the user in
    const newToken = await DB.refreshUserToken(user.email);
    setAuthCookie(res, newToken);
    
    res.send({ verified, email: user.email, name: user.name });
  } else {
    res.status(400).send({ verified: false });
  }
});

// DeleteAuth token if stored in cookie
router.delete('/auth/logout', (_req, res) => {
  console.log('[AUTH] Logout request');
  res.clearCookie(authCookieName);
  res.status(204).end();
});

// secureApiRouter verifies credentials for endpoints
const secureApiRouter = express.Router();

secureApiRouter.use(async (req, res, next) => {
  const authToken = req.cookies[authCookieName];
  const user = await DB.getUserByToken(authToken);
  if (user) {
    req.user = user;
    next();
  } else {
    console.log(`[AUTH] Unauthorized access attempt to ${req.originalUrl}`);
    res.status(401).send({ msg: 'Unauthorized' });
  }
});

secureApiRouter.get('/auth/me', (req, res) => {
  res.send({ email: req.user.email, name: req.user.name });
});

secureApiRouter.delete('/auth/account', async (req, res) => {
  await DB.deleteUser(req.user.email);
  res.clearCookie(authCookieName);
  res.status(204).end();
});

secureApiRouter.get('/auth/passkeys', async (req, res) => {
  const userPasskeys = await DB.getUserPasskeys(req.user.email);

  // We don't want to send the full passkey object to the client
  const safePasskeys = userPasskeys.map((key) => ({
    // MongoDB returns BSON Binary objects which don't natively support 'base64url' in toString().
    // We use standard 'base64' and manually convert it to the base64url format.
    credentialID: key.credentialID.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
    transports: key.transports,
    created_at: key.created_at,
  }));

  res.send(safePasskeys);
});

secureApiRouter.delete('/auth/passkeys/:id', async (req, res) => {
  try {
    const credentialIDBuffer = Buffer.from(req.params.id, 'base64url');
    await DB.deletePasskey(req.user.email, credentialIDBuffer);
    res.status(204).end();
  } catch (e) {
    res.status(400).send({ error: 'Failed to delete passkey' });
  }
});

secureApiRouter.post('/auth/register-options', async (req, res) => {
  if (!req.user || !req.user.email) {
    console.error('[AUTH] Registration options request missing user email in session');
    return res.status(400).send({ error: 'User session is invalid or missing email.' });
  }

  const userPasskeys = await DB.getUserPasskeys(req.user.email);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new Uint8Array(Buffer.from(req.user.email)),
    userName: req.user.email,
    // Don't prompt to register the same authenticator twice
    excludeCredentials: userPasskeys.filter((pk) => pk.credentialID).map((passkey) => ({
      id: passkey.credentialID.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
      transports: passkey.transports,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  res.cookie('webauthn_challenge', options.challenge, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 300000, // 5 minutes
  });

  res.send(options);
});

secureApiRouter.post('/auth/register-verify', async (req, res) => {
  const { body } = req;
  const user = await DB.getUser(req.user.email);
  const expectedChallenge = req.cookies.webauthn_challenge;

  if (!expectedChallenge) {
    return res.status(400).send({ error: 'Challenge expired or not found.' });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (error) {
    console.error(error);
    return res.status(400).send({ error: error.message });
  }

  const { verified, registrationInfo } = verification;

  if (verified && registrationInfo) {
    // SimpleWebAuthn v10+ nests these under `credential`
    const credentialPublicKey = registrationInfo.credential?.publicKey || registrationInfo.credentialPublicKey;
    const credentialID = registrationInfo.credential?.id || registrationInfo.credentialID;
    const counter = registrationInfo.credential?.counter ?? registrationInfo.counter;

    if (!credentialPublicKey || !credentialID) {
      console.error('[AUTH] Registration failed: missing key details.');
      return res.status(400).send({ error: 'Registration failed: authenticator response missing key details.' });
    }

    await DB.createPasskey(user.email, {
      publicKey: Buffer.from(credentialPublicKey),
      // Convert credentialID to Buffer if it is a base64url string (v10+)
      credentialID: typeof credentialID === 'string' ? Buffer.from(credentialID, 'base64url') : Buffer.from(credentialID),
      counter,
      transports: body.response.transports,
    });

    res.clearCookie('webauthn_challenge');

    res.send({ verified });
  } else {
    res.status(400).send({ verified: false });
  }
});



// setAuthCookie in the HTTP response
function setAuthCookie(res, authToken) {
  res.cookie(authCookieName, authToken, {
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
  });
}

module.exports = {
    router: router,
    secureApiRouter: secureApiRouter,
};
