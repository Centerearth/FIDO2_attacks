const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const logger = require('./logger.js');

let userCollection;
let passkeyCollection;

function init(uri, dbName) {
  const client = new MongoClient(uri);
  userCollection = client.db(dbName).collection('user');
  passkeyCollection = client.db(dbName).collection('passkeys');
}

function getUser(email) {
  logger.debug({ email }, 'DB getUser');
  return userCollection.findOne({ email: String(email) });
}

function getUserByToken(token) {
  logger.debug('DB getUserByToken');
  return userCollection.findOne({ token: String(token) });
}

async function createUser(name, email, password) {
  logger.debug({ email }, 'DB createUser');
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const user = {
    name: name,
    email: email,
    password: passwordHash,
    token: crypto.randomUUID(),
  };
  await userCollection.insertOne(user);

  return user;
}

async function createPasskey(email, passkeyInfo) {
  logger.debug({ email }, 'DB createPasskey');
  const passkey = {
    email: email,
    name: passkeyInfo.name,
    aaguid: passkeyInfo.aaguid,
    deviceType: passkeyInfo.deviceType,
    backedUp: passkeyInfo.backedUp,
    credentialID: passkeyInfo.credentialID,
    publicKey: passkeyInfo.publicKey,
    counter: passkeyInfo.counter,
    transports: passkeyInfo.transports,
    created_at: new Date(),
  };
  await passkeyCollection.insertOne(passkey);
  return passkey;
}

function getPasskey(credentialID) {
  logger.debug({ credentialID }, 'DB getPasskey');
  return passkeyCollection.findOne({ credentialID: String(credentialID) });
}

/**
 * Finds a passkey by its raw credential ID, across every account.
 *
 * This is what makes discoverable credentials work: at sign-in the browser
 * hands us a credential ID and no username, so the account has to be found
 * from the credential rather than the other way round.
 *
 * @param {Buffer} credentialIDBuffer
 * @returns {Promise<object|null>}
 */
function getPasskeyByCredentialID(credentialIDBuffer) {
  logger.debug('DB getPasskeyByCredentialID');
  return passkeyCollection.findOne({ credentialID: credentialIDBuffer });
}

function getUserPasskeys(email) {
  logger.debug({ email }, 'DB getUserPasskeys');
  return passkeyCollection.find({ email: String(email) }).toArray();
}

async function updatePasskeyCounter(credentialID, newCounter) {
  logger.debug({ credentialID, newCounter }, 'DB updatePasskeyCounter');
  await passkeyCollection.updateOne(
    { credentialID: String(credentialID) },
    { $set: { counter: newCounter } }
  );
}

/**
 * Renames one of a user's passkeys.
 * @returns {Promise<number>} how many records matched — 0 means the passkey
 *   does not exist or belongs to somebody else.
 */
async function renamePasskey(email, credentialIDBuffer, name) {
  logger.debug({ email }, 'DB renamePasskey');
  const result = await passkeyCollection.updateOne(
    { email: String(email), credentialID: credentialIDBuffer },
    { $set: { name: name } }
  );
  return result.matchedCount;
}

async function deleteUser(email) {
  logger.debug({ email }, 'DB deleteUser');
  await deletePasskeys(email);
  return userCollection.deleteOne({ email: String(email) });
}

async function deletePasskeys(email) {
  logger.debug({ email }, 'DB deletePasskeys');
  return passkeyCollection.deleteMany({ email: String(email) });
}

/**
 * Deletes one of a user's passkeys.
 * @returns {Promise<number>} how many records were removed — 0 means the
 *   passkey does not exist or belongs to somebody else.
 */
async function deletePasskey(email, credentialIDBuffer) {
  logger.debug({ email }, 'DB deletePasskey');
  const result = await passkeyCollection.deleteOne({
    email: String(email),
    credentialID: credentialIDBuffer
  });
  return result.deletedCount;
}

async function updateUserPassword(email, newPassword) {
  logger.debug({ email }, 'DB updateUserPassword');
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await userCollection.updateOne(
    { email: String(email) },
    { $set: { password: passwordHash } }
  );
}

async function refreshUserToken(email) {
  logger.debug({ email }, 'DB refreshUserToken');
  const newToken = crypto.randomUUID();
  await userCollection.updateOne(
    { email: String(email) },
    { $set: { token: newToken } }
  );
  return newToken;
}

/**
 * Records that the user just proved who they are, opening the reauthentication
 * window that sensitive operations require.
 * @param {string} email
 * @param {Date} until - when the window closes.
 */
async function setReauthUntil(email, until) {
  logger.debug({ email, until }, 'DB setReauthUntil');
  await userCollection.updateOne(
    { email: String(email) },
    { $set: { reauth_until: until } }
  );
}

/** Closes the reauthentication window, e.g. after a sensitive operation. */
async function clearReauth(email) {
  logger.debug({ email }, 'DB clearReauth');
  await userCollection.updateOne(
    { email: String(email) },
    { $unset: { reauth_until: '' } }
  );
}

module.exports = {
  init,
  getUser,
  getUserByToken,
  createUser,
  deleteUser,
  createPasskey,
  getPasskey,
  getPasskeyByCredentialID,
  getUserPasskeys,
  updatePasskeyCounter,
  renamePasskey,
  updateUserPassword,
  refreshUserToken,
  deletePasskeys,
  deletePasskey,
  setReauthUntil,
  clearReauth
};
