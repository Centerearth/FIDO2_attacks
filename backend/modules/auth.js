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

// Reauthentication uses its own challenge cookie so that starting a
// reauthentication never clobbers an in-flight registration challenge.
const REAUTH_CHALLENGE_COOKIE = 'webauthn_reauth_challenge';

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

router.post('/auth/create', async (req, res) => {
  try {
    const user = await AuthService.createUser(req.body.name, req.body.email, req.body.password);
    setAuthCookie(res, user.token);
    res.send({ email: user.email, name: user.name });
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const result = await AuthService.loginUser(req.body.email, req.body.password || '');
    setAuthCookie(res, result.token);
    res.send({ email: result.email, name: result.name });
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

// Email is optional. Without it this is a discoverable-credential ceremony:
// the authenticator offers the passkeys it holds and the user picks one, so
// nothing has to be typed to sign in.
router.post('/auth/authentication-options', async (req, res) => {
  const { email } = req.body || {};
  try {
    const options = await AuthService.generateAuthOptions(email);
    res.cookie('webauthn_challenge', options.challenge, CHALLENGE_COOKIE_OPTS);
    res.send(options);
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

router.post('/auth/authentication-verify', async (req, res) => {
  const { email, response } = req.body || {};
  if (!response) {
    return res.status(400).send({ error: 'An authentication response is required.' });
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

/**
 * Builds a gate for one sensitive operation. Signing in is not enough for
 * these: the user has to have proved who they are again recently.
 *
 * Responds 403 with `reauthRequired: true` so the client can tell this apart
 * from a genuine permission failure and open the reauthentication prompt.
 */
function requireReauth(operation) {
  return (req, res, next) => {
    if (!AuthService.isReauthRequired(operation)) return next();
    if (AuthService.hasFreshReauth(req.user)) return next();

    logger.info({ operation, url: req.originalUrl }, 'Reauthentication required');
    return res.status(403).send({
      error: 'Please confirm it is you before continuing.',
      reauthRequired: true,
      operation,
    });
  };
}

/**
 * Closes the reauthentication window after a sensitive operation succeeds, so
 * the next one prompts again. Failures to clear it are logged but never fail
 * the request — the operation itself already happened.
 */
async function consumeReauth(email, operation) {
  if (!AuthService.isReauthRequired(operation)) return;
  try {
    await AuthService.consumeReauth(email);
  } catch (e) {
    logger.warn({ err: e, operation }, 'Failed to clear reauthentication window');
  }
}

secureApiRouter.get('/auth/me', (req, res) => {
  res.send({ email: req.user.email, name: req.user.name });
});

// --- Reauthentication ------------------------------------------------------

secureApiRouter.get('/auth/reauth-status', async (req, res) => {
  try {
    res.send(await AuthService.getReauthStatus(req.user));
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

secureApiRouter.post('/auth/reauth-options', async (req, res) => {
  try {
    const options = await AuthService.generateReauthOptions(req.user.email);
    res.cookie(REAUTH_CHALLENGE_COOKIE, options.challenge, CHALLENGE_COOKIE_OPTS);
    res.send(options);
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

secureApiRouter.post('/auth/reauth-verify', async (req, res) => {
  const challenge = req.cookies[REAUTH_CHALLENGE_COOKIE];
  if (!challenge) {
    return res.status(400).send({ error: 'Challenge expired or not found.' });
  }
  try {
    const result = await AuthService.verifyReauth(req.user.email, req.body, challenge);
    res.clearCookie(REAUTH_CHALLENGE_COOKIE);
    res.send(result);
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

secureApiRouter.post('/auth/reauth-password', async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).send({ error: 'Password is required.' });
  }
  try {
    res.send(await AuthService.verifyReauthPassword(req.user.email, password));
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

// --- Account ---------------------------------------------------------------

secureApiRouter.put('/auth/password', requireReauth('change-password'), async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).send({ error: 'Password is required.' });
  }
  try {
    await AuthService.changePassword(req.user.email, password);
    await consumeReauth(req.user.email, 'change-password');
    res.status(204).end();
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

secureApiRouter.delete('/auth/account', requireReauth('delete-account'), async (req, res) => {
  try {
    await AuthService.deleteAccount(req.user.email);
    res.clearCookie(authCookieName);
    res.status(204).end();
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

// --- Passkeys --------------------------------------------------------------

secureApiRouter.get('/auth/passkeys', async (req, res) => {
  try {
    const passkeys = await AuthService.getPasskeys(req.user.email);
    res.send(passkeys);
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

secureApiRouter.patch('/auth/passkeys/:id', requireReauth('rename-passkey'), async (req, res) => {
  try {
    const result = await AuthService.renamePasskey(req.user.email, req.params.id, req.body.name);
    await consumeReauth(req.user.email, 'rename-passkey');
    res.send(result);
  } catch (e) {
    res.status(e.status || 500).send({ error: e.message });
  }
});

secureApiRouter.delete('/auth/passkeys/:id', requireReauth('delete-passkey'), async (req, res) => {
  try {
    await AuthService.deletePasskeyById(req.user.email, req.params.id);
    await consumeReauth(req.user.email, 'delete-passkey');
    res.status(204).end();
  } catch (e) {
    // Surface the real reason rather than a blanket "Failed to delete passkey",
    // which made genuine failures hard to tell apart during testing.
    res.status(e.status || 500).send({ error: e.message });
  }
});

secureApiRouter.post('/auth/register-options', requireReauth('add-passkey'), async (req, res) => {
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

secureApiRouter.post('/auth/register-verify', requireReauth('add-passkey'), async (req, res) => {
  const challenge = req.cookies.webauthn_challenge;
  if (!challenge) {
    return res.status(400).send({ error: 'Challenge expired or not found.' });
  }
  try {
    const result = await AuthService.verifyReg(req.body, challenge, req.user.email);
    res.clearCookie('webauthn_challenge');
    await consumeReauth(req.user.email, 'add-passkey');
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
