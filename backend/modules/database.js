const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

let userCollection;
let passkeyCollection;

function init(uri, dbName) {
  const client = new MongoClient(uri);
  userCollection = client.db(dbName).collection('user');
  passkeyCollection = client.db(dbName).collection('passkeys');
}

function getUser(email) {
  return userCollection.findOne({ email: String(email) });
}

function getUserByToken(token) {
  return userCollection.findOne({ token: String(token) });
}

async function createUser(name, email, password) {
  console.log(`[DB] Creating user record for ${email}`);
  // Hash the password only if it is provided
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
  console.log(`[DB] Creating passkey record for ${email}`);
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
  return passkeyCollection.findOne({ credentialID: String(credentialID) });
}

function getUserPasskeys(email) {
  return passkeyCollection.find({ email: String(email) }).toArray();
}

async function updatePasskeyCounter(credentialID, newCounter) {
  await passkeyCollection.updateOne(
    { credentialID: String(credentialID) },
    { $set: { counter: newCounter } }
  );
}

function deleteUser(email) {
  deletePasskeys(email);
  return userCollection.deleteOne({ email: String(email) });
}

function deletePasskeys(email) {
  return passkeyCollection.deleteMany({ email: String(email) });
}

function deletePasskey(email, credentialIDBuffer) {
  return passkeyCollection.deleteOne({
    email: String(email),
    credentialID: credentialIDBuffer
  });
}

async function updateUserPassword(email, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await userCollection.updateOne(
    { email: String(email) },
    { $set: { password: passwordHash } }
  );
}

async function refreshUserToken(email) {
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
