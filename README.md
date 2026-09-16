# FIDO2 Attacks / Simply Shopping

A demo e-commerce app (doesn't work at all) built to explore FIDO2/WebAuthn passkey authentication. Will be used in 
our continued research effort to recreate and find new vulnerabalities with the standards. 
Check out the docs folder for Mermaid diagrams of the authentication flows.
The branch repo-with-passwords includes the same website but with support for passwords.
An AI generated summary of the rest of the project is below.


## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router v7, Bootstrap 5, Vite |
| Backend | Node.js, Express 5 |
| Database | MongoDB Atlas |
| Auth | @simplewebauthn/server + browser, bcrypt, httpOnly cookies |

## Features

- Register and sign in with a password
- Register and sign in with a FIDO2 passkey
- View passkeys, named after the authenticator that created them
- Add, rename and delete passkeys
- Reauthentication before any credential-management operation
- Update password
- Delete individual passkeys or the entire account
- Cart backed by `localStorage`

Passkeys are listed by authenticator name ("Apple Passwords", "YubiKey 5
Series") rather than credential ID, and can be renamed. See
[docs/passkey-naming.md](docs/passkey-naming.md).

Adding, renaming or deleting a passkey, changing the password and deleting the
account all require the user to prove who they are again, even while signed in.
See [docs/reauthentication.md](docs/reauthentication.md).

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `MONGOUSER` | MongoDB Atlas username |
| `MONGOPASSWORD` | MongoDB Atlas password |
| `MONGOHOSTNAME` | Atlas cluster hostname (e.g. `cluster0.xxxxx.mongodb.net`) |
| `DB_NAME` | Database name |
| `NODE_ENV` | `development` or `production` |
| `PORT` | Express server port (default `3000`) |
| `FRONTEND_PORT` | Vite dev server port (default `5173`) |
| `RP_ID` | WebAuthn relying party ID — must match the hostname used in the browser (e.g. `localhost`) |
| `ORIGIN` | Full origin used to verify WebAuthn responses (e.g. `http://localhost:5173`) |
| `ATTESTATION` | `direct` (default) or `none`. `direct` is what lets passkeys be named after their authenticator; `none` makes the browser zero the AAGUID |
| `REAUTH_REQUIRED` | `false` runs the study's control condition with no reauthentication. Default `true` |
| `REAUTH_OPERATIONS` | Comma-separated subset of operations to gate. Unset means all of them |
| `REAUTH_WINDOW_MS` | How long a successful reauthentication stays valid. Default `300000` (5 minutes) |

### Attestation and the proxy experiments

`ATTESTATION` defaults to `direct` so that authenticator names work. The proxy
experiments in `scripts/` assume the privacy-preserving `none` setting that this
project used previously; set `ATTESTATION=none` to restore it, at the cost of
passkeys falling back to generic names such as "This Device".

### 3. Run in development

Start the Vite dev server and the Express backend in separate terminals:

```bash
# Terminal 1 — frontend
npm run dev

# Terminal 2 — backend
npm start
```

The frontend runs on `http://localhost:5173` and proxies `/api` requests to the Express server.

### 4. Run in production

```bash
npm run build   # builds frontend to dist/
npm start       # serves dist/ and the API from one Express process
```

## Testing

```bash
npm test
```

Tests cover:

- `backend/modules/database.test.js` — database helper functions
- `backend/modules/authService.test.js` — authentication business logic
- `backend/modules/authenticatorName.test.js` — AAGUID lookup and passkey naming
- `backend/modules/auth.test.js` — Express route handlers, including the reauthentication gate
- `src/pages/LoginPage.test.jsx` — login page UI
- `src/pages/SignUpPage.test.jsx` — sign-up page UI
- `src/pages/AccountPage.test.jsx` — account management UI, renaming and the reauthentication prompt

## Project structure

```
├── backend/
│   ├── index.js              # Express app entry point
│   └── modules/
│       ├── auth.js               # Route handlers and the reauthentication gate
│       ├── authService.js        # Authentication business logic
│       ├── authenticatorName.js  # AAGUID -> passkey name
│       ├── aaguid-names.json     # Authenticator model registry
│       └── database.js           # MongoDB helpers
├── src/
│   ├── components/           # Layout, Header, ProtectedRoute, ReauthModal
│   ├── context/              # AuthContext (user session state)
│   ├── pages/                # Page components
│   ├── services/
│   │   └── api.js            # Fetch wrappers for all API calls
│   └── router.jsx            # Client-side routes
├── .env.example
└── vite.config.js
```
