Notes

..

webauth_signup cookie stores the email and name in plaintext - could be swapped out en route.
Auth token cookie has no maxAge
Right now, passwords and tokens are being redacted by the logger


Cloning is hard but not impossible

Not having attestation means that proxies running on the same origin as the client can successfuly modify attacks, the origin and everything else is the same 
Having attestation forces the passkey to be of a specific verified type, which is much more difficult to spoof. Makes fingerprinting possible though so for privacy attestation is often set to none
Some softwares install a root certificate and proxy, like parental controls. There are document cases of spyware in parental controls.

Reauthentication and passkey naming (added for the user study)

Attestation is now 'direct' by default, because with attestation 'none' the browser
replaces the AAGUID with sixteen zero bytes and there is nothing left to name a passkey
after. That is exactly the privacy property discussed above, so it is a real tradeoff and
not a free win: ATTESTATION=none restores the old behaviour for the proxy experiments.

Reauthentication is a per-operation sudo window stored server-side as reauth_until on the
user document. A successful sensitive operation clears it; a failed one does not, so a
rejected delete does not cost the user two prompts.

Reauthenticating with a passkey deliberately does not call refreshUserToken. Sign-in does,
which is why signing in a second time silently invalidates any other session for the same
account - worth remembering when testing with two tabs.

Deleting the last passkey of an account with no password is now refused. Before, a
passkey-only user could delete their only passkey and end up unable to sign in, and with
reauthentication in place they could not even reauthenticate to add a replacement.

The reauth ceremony uses its own challenge cookie (webauthn_reauth_challenge) so that
starting a reauthentication mid-registration cannot clobber the registration challenge.


Discoverable credentials

Registration now asks for residentKey 'required', so the credential is stored on the
authenticator and sign-in needs no username. Sign-in options are issued with no
allowCredentials at all, and the account is found from the credential ID via
getPasskeyByCredentialID. RESIDENT_KEY=preferred backs this out for old security keys.

The user handle is still the account email in plaintext bytes (userID = Buffer.from(email)).
With discoverable credentials that handle now travels back to us on every sign-in, and it is
also sitting on the authenticator. Anyone who can read the assertion sees the email. Worth
swapping for an opaque per-user identifier at some point - it would not break existing
credentials because lookup is by credential ID, only the handle cross-check would need a
migration.

Deleting a passkey only removes our record of it. The credential stays on the device, so a
user can still pick it in a discoverable ceremony and gets "That passkey is not registered
here." Surfaced this while testing with Chrome virtual authenticators, where the deleted
credential kept being offered.

Conditional UI (autofill) starts a second ceremony on page load. simplewebauthn's
WebAuthnAbortService cancels it when the button starts its own, so the two do not collide;
the aborted one is swallowed rather than shown as an error.
