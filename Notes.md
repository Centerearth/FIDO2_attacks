Notes

..

webauth_signup cookie stores the email and name in plaintext - could be swapped out en route.
Auth token cookie has no maxAge
Right now, passwords and tokens are being redacted by the logger


Cloning is hard but not impossible

Not having attestation means that proxies running on the same origin as the client can successfuly modify attacks, the origin and everything else is the same 
Having attestation forces the passkey to be of a specific verified type, which is much more difficult to spoof. Makes fingerprinting possible though so for privacy attestation is often set to none
Some softwares install a root certificate and proxy, like parental controls. There are document cases of spyware in parental controls.