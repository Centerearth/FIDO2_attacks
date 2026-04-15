const express = require('express');
const cookieParser = require('cookie-parser');
const DB = require('./database.js');
const AuthService = require('./authService.js');
const logger = require('./logger.js');

const authCookieName = 'token';
const secureCookies = process.env.NODE_ENV === 'production';
const router = express.Router();

router.use(cookieParser());

const CHALLENGE_COOKIE_OPTS = {
  httpOnly: true,
  secure: secureCookies,
  sameSite: 'strict',
  maxAge: 300000, // 5 minutes
};

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

router.post('/auth/authentication-options', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).send({ error: 'Email is required to log in.' });
  }
  try {
    const options = await AuthService.generateAuthOptions(email);
    res.cookie('webauthn_challenge', options.challenge, CHALLENGE_COOKIE_OPTS);
    res.send(options);
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

router.post('/auth/authentication-verify', async (req, res) => {
  const { email, response } = req.body;
  if (!email || !response) {
    return res.status(400).send({ error: 'Email and authentication response are required.' });
  }
  const challenge = req.cookies.webauthn_challenge;
  if (!challenge) {
    return res.status(400).send({ error: 'Challenge expired or not found.' });
  }
  try {
    const result = await AuthService.verifyAuth(email, response, challenge);
    res.clearCookie('webauthn_challenge');
    setAuthCookie(res, result.token);
    res.send({ verified: result.verified, email: result.email, name: result.name });
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

router.post('/auth/signup-register-options', async (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) {
    return res.status(400).send({ error: 'Email and name are required.' });
  }
  try {
    const options = await AuthService.generateSignupRegOptions(email, name);
    res.cookie('webauthn_signup', JSON.stringify({ challenge: options.challenge, email, name }), CHALLENGE_COOKIE_OPTS);
    res.send(options);
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

router.post('/auth/signup-register-verify', async (req, res) => {
  const pendingDataStr = req.cookies.webauthn_signup;
  if (!pendingDataStr) {
    return res.status(400).send({ error: 'Registration session expired or not found.' });
  }
  try {
    const pendingData = JSON.parse(pendingDataStr);
    const result = await AuthService.verifySignupReg(req.body, pendingData);
    res.clearCookie('webauthn_signup');
    setAuthCookie(res, result.token);
    res.send({ verified: result.verified, email: result.email, name: result.name });
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

router.delete('/auth/logout', (_req, res) => {
  logger.info('Logout');
  res.clearCookie(authCookieName);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Secure routes — require a valid auth token cookie
// ---------------------------------------------------------------------------

const secureApiRouter = express.Router();

secureApiRouter.use(async (req, res, next) => {
  const authToken = req.cookies[authCookieName];
  const user = await DB.getUserByToken(authToken);
  if (user) {
    req.user = user;
    next();
  } else {
    logger.warn({ url: req.originalUrl }, 'Unauthorized access attempt');
    res.status(401).send({ error: 'Unauthorized' });
  }
});

secureApiRouter.get('/auth/me', (req, res) => {
  res.send({ email: req.user.email, name: req.user.name });
});

secureApiRouter.delete('/auth/account', async (req, res) => {
  try {
    await AuthService.deleteAccount(req.user.email);
    res.clearCookie(authCookieName);
    res.status(204).end();
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

secureApiRouter.get('/auth/passkeys', async (req, res) => {
  try {
    const passkeys = await AuthService.getPasskeys(req.user.email);
    res.send(passkeys);
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

secureApiRouter.delete('/auth/passkeys/:id', async (req, res) => {
  try {
    await AuthService.deletePasskeyById(req.user.email, req.params.id);
    res.status(204).end();
  } catch (e) {
    res.status(400).send({ error: 'Failed to delete passkey' });
  }
});

secureApiRouter.post('/auth/register-options', async (req, res) => {
  if (!req.user || !req.user.email) {
    return res.status(400).send({ error: 'User session is invalid or missing email.' });
  }
  try {
    const options = await AuthService.generateRegOptions(req.user.email);
    res.cookie('webauthn_challenge', options.challenge, CHALLENGE_COOKIE_OPTS);
    res.send(options);
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

secureApiRouter.post('/auth/register-verify', async (req, res) => {
  const challenge = req.cookies.webauthn_challenge;
  if (!challenge) {
    return res.status(400).send({ error: 'Challenge expired or not found.' });
  }
  try {
    const result = await AuthService.verifyReg(req.body, challenge, req.user.email);
    res.clearCookie('webauthn_challenge');
    res.send(result);
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

// ---------------------------------------------------------------------------

function setAuthCookie(res, authToken) {
  res.cookie(authCookieName, authToken, {
    secure: secureCookies,
    httpOnly: true,
    sameSite: 'strict',
  });
}

module.exports = {
  router,
  secureApiRouter,
};
