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

async function deleteUser(email) {
  logger.debug({ email }, 'DB deleteUser');
  await deletePasskeys(email);
  return userCollection.deleteOne({ email: String(email) });
}

async function deletePasskeys(email) {
  logger.debug({ email }, 'DB deletePasskeys');
  return passkeyCollection.deleteMany({ email: String(email) });
}

async function deletePasskey(email, credentialIDBuffer) {
  logger.debug({ email }, 'DB deletePasskey');
  return passkeyCollection.deleteOne({
    email: String(email),
    credentialID: credentialIDBuffer
  });
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

module.exports = {
  init,
  getUser,
  getUserByToken,
  createUser,
  deleteUser,
  createPasskey,
  getPasskey,
  getUserPasskeys,
  updatePasskeyCounter,
  updateUserPassword,
  refreshUserToken,
  deletePasskeys,
  deletePasskey
};
