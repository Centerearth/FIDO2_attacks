const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const DB = require('./database.js');

const authCookieName = 'token';
const router = express.Router();

// JSON body parsing using built-in middleware
router.use(express.json());

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
      id: user._id,
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
      setAuthCookie(res, user.token);
      res.send({ id: user._id });
      return;
    }
  }
  console.log(`[AUTH] Login failed: ${req.body.email}`);
  res.status(401).send({ msg: 'Unauthorized' });
});

// DeleteAuth token if stored in cookie
router.delete('/auth/logout', (_req, res) => {
  console.log('[AUTH] Logout request');
  res.clearCookie(authCookieName);
  res.status(204).end();
});

// secureApiRouter verifies credentials for endpoints
var secureApiRouter = express.Router();
router.use(secureApiRouter);

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
