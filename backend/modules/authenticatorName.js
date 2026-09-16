/**
 * Turns the information an authenticator reveals at registration time into a
 * human-readable passkey name, so the account page can show "Apple Passwords"
 * or "YubiKey 5 Series" instead of a raw base64url credential ID.
 *
 * The primary signal is the AAGUID, a 16-byte identifier for the authenticator
 * *model* that lives in the authenticator data. Names come from the community
 * registry in `aaguid-names.json`.
 *
 * Caveat that matters for this project: when the relying party asks for
 * `attestation: 'none'`, browsers deliberately zero out the AAGUID to stop RPs
 * fingerprinting the user's hardware. In that configuration every passkey
 * reports 00000000-0000-0000-0000-000000000000 and we fall back to naming the
 * key after its transports and device type. Set ATTESTATION=direct (the
 * default) to get real authenticator names.
 */

const AAGUID_NAMES = require('./aaguid-names.json');

const NULL_AAGUID = '00000000-0000-0000-0000-000000000000';

// Ordered: the first transport that matches wins, so a key that reports both
// "internal" and "hybrid" is described by the more specific one.
const TRANSPORT_LABELS = [
  ['internal', 'This Device'],
  ['hybrid', 'Phone or Tablet'],
  ['nfc', 'NFC Security Key'],
  ['usb', 'USB Security Key'],
  ['ble', 'Bluetooth Security Key'],
  ['smart-card', 'Smart Card'],
  ['cable', 'Phone or Tablet'],
];

/** True when the AAGUID carries no model information. */
function isNullAaguid(aaguid) {
  return !aaguid || String(aaguid).toLowerCase() === NULL_AAGUID;
}

/** Looks up an AAGUID in the registry. Returns null when it is unknown. */
function lookupAaguid(aaguid) {
  if (isNullAaguid(aaguid)) return null;
  return AAGUID_NAMES[String(aaguid).toLowerCase()] || null;
}

/**
 * Best-effort name when the AAGUID tells us nothing. Uses the transports the
 * browser reported and whether the credential is synced across devices.
 */
function describeByCapabilities(transports, deviceType) {
  const list = Array.isArray(transports) ? transports : [];
  for (const [transport, label] of TRANSPORT_LABELS) {
    if (list.includes(transport)) return label;
  }
  if (deviceType === 'multiDevice') return 'Synced Passkey';
  if (deviceType === 'singleDevice') return 'Security Key';
  return 'Passkey';
}

/**
 * Picks a display name for a newly registered passkey.
 *
 * @param {object} info
 * @param {string} [info.aaguid] - Dashed AAGUID from verifyRegistrationResponse.
 * @param {string[]} [info.transports] - Transports reported by the browser.
 * @param {string} [info.deviceType] - 'singleDevice' or 'multiDevice'.
 * @param {string[]} [info.existingNames] - Names already used by this account,
 *   so a second key of the same model becomes "YubiKey 5 Series (2)".
 * @returns {string}
 */
function nameForAuthenticator({ aaguid, transports, deviceType, existingNames = [] } = {}) {
  const base = lookupAaguid(aaguid) || describeByCapabilities(transports, deviceType);
  return deduplicate(base, existingNames);
}

/** Appends " (2)", " (3)", ... until the name is unique for the account. */
function deduplicate(base, existingNames) {
  const taken = new Set((existingNames || []).filter(Boolean).map((n) => String(n).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base} (${suffix})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

const MAX_NAME_LENGTH = 64;

/**
 * Validates and normalises a user-supplied passkey name.
 * @throws {Error} when the name is empty or too long.
 */
function sanitizePasskeyName(rawName) {
  if (typeof rawName !== 'string') {
    throw new Error('Passkey name must be text.');
  }
  // Collapse whitespace so names stay on one line in the account list.
  const name = rawName.replace(/\s+/g, ' ').trim();
  if (!name) {
    throw new Error('Passkey name cannot be empty.');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Passkey name cannot be longer than ${MAX_NAME_LENGTH} characters.`);
  }
  return name;
}

module.exports = {
  NULL_AAGUID,
  MAX_NAME_LENGTH,
  isNullAaguid,
  lookupAaguid,
  describeByCapabilities,
  nameForAuthenticator,
  sanitizePasskeyName,
};
