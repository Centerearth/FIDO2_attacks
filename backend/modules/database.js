const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const uuid = require('uuid');

const userName = process.env.MONGOUSER;
const password = process.env.MONGOPASSWORD;
const hostname = process.env.MONGOHOSTNAME;

if (!userName) {
  throw Error('Database not configured. Set environment variables');
}

const url = `mongodb+srv://${encodeURIComponent(userName)}:${encodeURIComponent(password)}@${hostname}`;

const client = new MongoClient(url);
const userCollection = client.db(process.env.DB_NAME || 'FIDO2').collection('user');
const passkeyCollection = client.db(process.env.DB_NAME || 'FIDO2').collection('passkeys');

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
    token: uuid.v4(),
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

async function refreshUserToken(email) {
  const newToken = uuid.v4();
  await userCollection.updateOne(
    { email: String(email) },
    { $set: { token: newToken } }
  );
  return newToken;
}


module.exports = {
  getUser,
  getUserByToken,
  createUser,
  deleteUser,
  createPasskey,
  getPasskey,
  getUserPasskeys,
  updatePasskeyCounter,
  refreshUserToken,
  deletePasskeys,
  deletePasskey
};
