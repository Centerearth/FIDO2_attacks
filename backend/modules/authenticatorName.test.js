const {
  NULL_AAGUID,
  isNullAaguid,
  lookupAaguid,
  describeByCapabilities,
  nameForAuthenticator,
  sanitizePasskeyName,
} = require('./authenticatorName.js');

describe('isNullAaguid', () => {
  it('treats the all-zero AAGUID as carrying no information', () => {
    expect(isNullAaguid(NULL_AAGUID)).toBe(true);
  });

  it('treats a missing AAGUID as carrying no information', () => {
    expect(isNullAaguid(undefined)).toBe(true);
    expect(isNullAaguid('')).toBe(true);
  });

  it('accepts a real AAGUID', () => {
    expect(isNullAaguid('fbfc3007-154e-4ecc-8c0b-6e020557d7bd')).toBe(false);
  });
});

describe('lookupAaguid', () => {
  it('resolves well-known authenticators', () => {
    expect(lookupAaguid('fbfc3007-154e-4ecc-8c0b-6e020557d7bd')).toBe('Apple Passwords');
    expect(lookupAaguid('ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4')).toBe('Google Password Manager');
    expect(lookupAaguid('08987058-cadc-4b81-b6e1-30de50dcbe96')).toBe('Windows Hello');
  });

  it('is case insensitive', () => {
    expect(lookupAaguid('FBFC3007-154E-4ECC-8C0B-6E020557D7BD')).toBe('Apple Passwords');
  });

  it('returns null for an unregistered AAGUID', () => {
    expect(lookupAaguid('11111111-2222-3333-4444-555555555555')).toBeNull();
  });

  it('returns null for the zeroed AAGUID', () => {
    expect(lookupAaguid(NULL_AAGUID)).toBeNull();
  });
});

describe('describeByCapabilities', () => {
  it('prefers the most specific transport', () => {
    expect(describeByCapabilities(['internal', 'hybrid'])).toBe('This Device');
    expect(describeByCapabilities(['hybrid'])).toBe('Phone or Tablet');
    expect(describeByCapabilities(['nfc', 'usb'])).toBe('NFC Security Key');
    expect(describeByCapabilities(['usb'])).toBe('USB Security Key');
    expect(describeByCapabilities(['ble'])).toBe('Bluetooth Security Key');
  });

  it('falls back to the device type when no transport is reported', () => {
    expect(describeByCapabilities([], 'multiDevice')).toBe('Synced Passkey');
    expect(describeByCapabilities([], 'singleDevice')).toBe('Security Key');
  });

  it('always produces something readable', () => {
    expect(describeByCapabilities(undefined, undefined)).toBe('Passkey');
    expect(describeByCapabilities(null)).toBe('Passkey');
  });
});

describe('nameForAuthenticator', () => {
  it('prefers the AAGUID over the transport', () => {
    expect(nameForAuthenticator({
      aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      transports: ['internal'],
    })).toBe('Apple Passwords');
  });

  // The case that matters when ATTESTATION=none zeroes the AAGUID.
  it('falls back to the transport when the AAGUID is zeroed', () => {
    expect(nameForAuthenticator({
      aaguid: NULL_AAGUID,
      transports: ['usb'],
    })).toBe('USB Security Key');
  });

  it('numbers repeats of the same model', () => {
    const existing = ['Apple Passwords'];
    expect(nameForAuthenticator({
      aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      existingNames: existing,
    })).toBe('Apple Passwords (2)');

    expect(nameForAuthenticator({
      aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      existingNames: [...existing, 'Apple Passwords (2)'],
    })).toBe('Apple Passwords (3)');
  });

  it('compares existing names case insensitively', () => {
    expect(nameForAuthenticator({
      aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      existingNames: ['apple passwords'],
    })).toBe('Apple Passwords (2)');
  });

  it('ignores blank existing names', () => {
    expect(nameForAuthenticator({
      aaguid: 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd',
      existingNames: [null, undefined, ''],
    })).toBe('Apple Passwords');
  });

  it('never returns an empty name', () => {
    expect(nameForAuthenticator()).toBe('Passkey');
    expect(nameForAuthenticator({})).toBe('Passkey');
  });
});

describe('sanitizePasskeyName', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizePasskeyName('  Work   Key  ')).toBe('Work Key');
  });

  it('flattens newlines so names stay on one line', () => {
    expect(sanitizePasskeyName('Work\nKey')).toBe('Work Key');
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(() => sanitizePasskeyName('')).toThrow(/empty/i);
    expect(() => sanitizePasskeyName('   ')).toThrow(/empty/i);
  });

  it('rejects a name longer than 64 characters', () => {
    expect(() => sanitizePasskeyName('x'.repeat(65))).toThrow(/64/);
    expect(sanitizePasskeyName('x'.repeat(64))).toHaveLength(64);
  });

  it('rejects values that are not text', () => {
    expect(() => sanitizePasskeyName(null)).toThrow(/text/i);
    expect(() => sanitizePasskeyName({ toString: () => 'evil' })).toThrow(/text/i);
    expect(() => sanitizePasskeyName(42)).toThrow(/text/i);
  });
});
