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
