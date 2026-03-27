# FIDO2 Attacks / Simply Shopping

A demo e-commerce app (doesn't work at all) built to explore FIDO2/WebAuthn passkey authentication. Will be used in 
our continued research effort to recreate and find new vulnerabalities with the standards. 
Check out the docs folder for Mermaid diagrams of the authentication flows.
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
- Add passkeys to an existing password account
- Update password
- Delete individual passkeys or the entire account
- Cart backed by `localStorage`

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
- `backend/modules/auth.test.js` — Express route handlers
- `src/pages/LoginPage.test.jsx` — login page UI
- `src/pages/SignUpPage.test.jsx` — sign-up page UI
- `src/pages/AccountPage.test.jsx` — account management UI

## Project structure

```
├── backend/
│   ├── index.js              # Express app entry point
│   └── modules/
│       ├── auth.js           # Route handlers
│       ├── authService.js    # Authentication business logic
│       └── database.js       # MongoDB helpers
├── src/
│   ├── components/           # Layout, Header, ProtectedRoute
│   ├── context/              # AuthContext (user session state)
│   ├── pages/                # Page components
│   ├── services/
│   │   └── api.js            # Fetch wrappers for all API calls
│   └── router.jsx            # Client-side routes
├── .env.example
└── vite.config.js
```
