Notes

Claude's notes on changes to make
Consistency & Architecture

auth.js is doing too much. Route definitions, business logic, and WebAuthn flows are all in one 400-line file. The WebAuthn flows especially (challenge generation, verification) would benefit from being extracted into a service layer.
Frontend

No loading state on async actions. Buttons for adding a passkey, updating a password, or deleting an account have no disabled/spinner state while the request is in flight. A user can click multiple times and fire duplicate requests.

Testing

Frontend components are untested. @testing-library/react is installed but unused. The auth flow components (LoginPage, SignUpPage, AccountPage) have meaningful conditional logic worth covering.