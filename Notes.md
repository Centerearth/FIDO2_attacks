Notes

Claude's notes on changes to make
Consistency & Architecture

Inconsistent error response shape. Some routes return { msg: ... }, others { error: ... }. The frontend api.js handles body.error || body.message || body.msg to compensate. Pick one shape and use it everywhere.
auth.js is doing too much. Route definitions, business logic, and WebAuthn flows are all in one 400-line file. The WebAuthn flows especially (challenge generation, verification) would benefit from being extracted into a service layer.
No input validation library. Validation is a series of inline if (!field) checks scattered across routes. A schema validator like zod or joi applied as middleware would centralize this and produce consistent error messages.
Frontend

alert() and confirm() for user-facing feedback. These are blocking, unstyled browser dialogs. The rest of the UI uses Bootstrap — replacing them with Bootstrap modals or toast notifications would keep the UX consistent.
No loading state on async actions. Buttons for adding a passkey, updating a password, or deleting an account have no disabled/spinner state while the request is in flight. A user can click multiple times and fire duplicate requests.
passwordMsg is never cleared. Once set (success or error), the message persists until the next submit. It should clear when the user starts typing a new password.
Testing

Frontend components are untested. @testing-library/react is installed but unused. The auth flow components (LoginPage, SignUpPage, AccountPage) have meaningful conditional logic worth covering.
No mongodb-memory-server for database integration tests. The current database tests mock MongoDB entirely. An in-memory MongoDB instance would let you test the actual query logic (filters, $set projections, etc.) without a live connection.
No coverage thresholds. There's no coverageThreshold in the Jest config, so coverage can silently drop over time.
Project Hygiene

No .env.example. Anyone cloning the repo has no documented list of required environment variables. A committed .env.example with placeholder values fixes this.
DB_NAME is duplicated. It appears in both .env and as a hardcoded fallback string 'FIDO2' in two places in database.js. The fallback should be removed so misconfiguration is caught early.