// --- Mocks ---

const mockInsertOne = jest.fn();
const mockFindOne = jest.fn();
const mockFind = jest.fn();
const mockUpdateOne = jest.fn();
const mockDeleteOne = jest.fn();
const mockDeleteMany = jest.fn();

const mockToArray = jest.fn();
mockFind.mockReturnValue({ toArray: mockToArray });

const mockCollection = jest.fn().mockReturnValue({
  insertOne: mockInsertOne,
  findOne: mockFindOne,
  find: mockFind,
  updateOne: mockUpdateOne,
  deleteOne: mockDeleteOne,
  deleteMany: mockDeleteMany,
});

const mockDb = jest.fn().mockReturnValue({ collection: mockCollection });

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => ({ db: mockDb })),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(),
}));

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const DB = require('./database');

// Wire up the mock MongoClient by calling init before any tests run
beforeAll(() => {
  DB.init('mongodb://test', 'testdb');
});

// Reset all mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
  mockFind.mockReturnValue({ toArray: mockToArray });
});

// ---------------------------------------------------------------------------

describe('getUser', () => {
  it('returns the user info for the given email', async () => {
    const fakeUser = { email: 'a@b.com', name: 'Alice' };
    mockFindOne.mockResolvedValue(fakeUser);

    const result = await DB.getUser('a@b.com');

    expect(mockFindOne).toHaveBeenCalledWith({ email: 'a@b.com' });
    expect(result).toBe(fakeUser);
  });

  it('returns null when no user is found', async () => {
    mockFindOne.mockResolvedValue(null);
    const result = await DB.getUser('missing@b.com');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('getUserByToken', () => {
  it('returns the user matching the token', async () => {
    const fakeUser = { email: 'a@b.com', token: 'tok-123' };
    mockFindOne.mockResolvedValue(fakeUser);

    const result = await DB.getUserByToken('tok-123');

    expect(mockFindOne).toHaveBeenCalledWith({ token: 'tok-123' });
    expect(result).toBe(fakeUser);
  });
});

// ---------------------------------------------------------------------------

describe('createUser', () => {
  it('hashes the password and inserts the user', async () => {
    bcrypt.hash.mockResolvedValue('hashed-pw');
    crypto.randomUUID.mockReturnValue('uuid-1');
    mockInsertOne.mockResolvedValue({});

    const user = await DB.createUser('Alice', 'a@b.com', 'secret');

    expect(bcrypt.hash).toHaveBeenCalledWith('secret', 10);
    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Alice', email: 'a@b.com', password: 'hashed-pw', token: 'uuid-1' })
    );
    expect(user.password).toBe('hashed-pw');
  });

  it('sets password to null when no password is provided', async () => {
    crypto.randomUUID.mockReturnValue('uuid-2');
    mockInsertOne.mockResolvedValue({});

    const user = await DB.createUser('Bob', 'b@b.com', null);

    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(user.password).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('createPasskey', () => {
  it('inserts a passkey record with a created_at timestamp', async () => {
    mockInsertOne.mockResolvedValue({});

    const info = {
      credentialID: Buffer.from('cred-id'),
      publicKey: Buffer.from('pub-key'),
      counter: 0,
      transports: ['usb'],
    };

    await DB.createPasskey('a@b.com', info);

    expect(mockInsertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'a@b.com',
        credentialID: info.credentialID,
        publicKey: info.publicKey,
        counter: 0,
        transports: ['usb'],
      })
    );
    const inserted = mockInsertOne.mock.calls[0][0];
    expect(inserted.created_at).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------

describe('getPasskey', () => {
  it('queries passkeys by credentialID string', async () => {
    const fakeKey = { credentialID: 'abc' };
    mockFindOne.mockResolvedValue(fakeKey);

    const result = await DB.getPasskey('abc');

    expect(mockFindOne).toHaveBeenCalledWith({ credentialID: 'abc' });
    expect(result).toBe(fakeKey);
  });
});

// ---------------------------------------------------------------------------

describe('getUserPasskeys', () => {
  it('returns all passkeys for the given email', async () => {
    const fakeKeys = [{ credentialID: 'k1' }, { credentialID: 'k2' }];
    mockToArray.mockResolvedValue(fakeKeys);

    const result = await DB.getUserPasskeys('a@b.com');

    expect(mockFind).toHaveBeenCalledWith({ email: 'a@b.com' });
    expect(result).toEqual(fakeKeys);
  });
});

// ---------------------------------------------------------------------------

describe('updatePasskeyCounter', () => {
  it('updates the counter for the matching credentialID', async () => {
    mockUpdateOne.mockResolvedValue({});

    await DB.updatePasskeyCounter('cred-123', 42);

    expect(mockUpdateOne).toHaveBeenCalledWith(
      { credentialID: 'cred-123' },
      { $set: { counter: 42 } }
    );
  });
});

// ---------------------------------------------------------------------------

describe('updateUserPassword', () => {
  it('hashes the new password and updates the user record', async () => {
    bcrypt.hash.mockResolvedValue('new-hash');
    mockUpdateOne.mockResolvedValue({});

    await DB.updateUserPassword('a@b.com', 'newSecret');

    expect(bcrypt.hash).toHaveBeenCalledWith('newSecret', 10);
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { email: 'a@b.com' },
      { $set: { password: 'new-hash' } }
    );
  });
});

// ---------------------------------------------------------------------------

describe('refreshUserToken', () => {
  it('generates a new UUID, persists it, and returns it', async () => {
    crypto.randomUUID.mockReturnValue('fresh-uuid');
    mockUpdateOne.mockResolvedValue({});

    const token = await DB.refreshUserToken('a@b.com');

    expect(crypto.randomUUID).toHaveBeenCalled();
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { email: 'a@b.com' },
      { $set: { token: 'fresh-uuid' } }
    );
    expect(token).toBe('fresh-uuid');
  });
});

// ---------------------------------------------------------------------------

describe('deleteUser', () => {
  it('deletes all passkeys and then the user record', async () => {
    mockDeleteMany.mockResolvedValue({});
    mockDeleteOne.mockResolvedValue({});

    await DB.deleteUser('a@b.com');

    expect(mockDeleteMany).toHaveBeenCalledWith({ email: 'a@b.com' });
    expect(mockDeleteOne).toHaveBeenCalledWith({ email: 'a@b.com' });
  });
});

// ---------------------------------------------------------------------------

describe('deletePasskeys', () => {
  it('removes all passkeys for the given email', async () => {
    mockDeleteMany.mockResolvedValue({});

    await DB.deletePasskeys('a@b.com');

    expect(mockDeleteMany).toHaveBeenCalledWith({ email: 'a@b.com' });
  });
});

// ---------------------------------------------------------------------------

describe('deletePasskey', () => {
  it('removes a single passkey by email and credentialID buffer', async () => {
    mockDeleteOne.mockResolvedValue({});
    const credBuf = Buffer.from('cred-id');

    await DB.deletePasskey('a@b.com', credBuf);

    expect(mockDeleteOne).toHaveBeenCalledWith({
      email: 'a@b.com',
      credentialID: credBuf,
    });
  });
});
