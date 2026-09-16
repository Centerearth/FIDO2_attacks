## Reauthentication

Being signed in is not enough to manage credentials. Adding, renaming or
deleting a passkey, changing the password and deleting the account each require
the user to prove who they are again. This is the treatment under study.

The server decides when a prompt is needed, so the browser never has to know the
policy: it simply retries the operation once reauthentication succeeds.

```mermaid
sequenceDiagram
    actor User
    participant Frontend as Browser/Frontend
    participant Backend as Express Backend
    participant DB as MongoDB

    User->>Frontend: Clicks "Delete" on a passkey and confirms
    Frontend->>Backend: DELETE /api/auth/passkeys/:id
    Backend->>Backend: requireReauth('delete-passkey')
    Backend-->>Frontend: 403 { reauthRequired: true, operation }

    Frontend->>Backend: GET /api/auth/reauth-status
    Backend->>DB: getUserPasskeys(email)
    Backend-->>Frontend: Which methods this account can use
    Frontend-->>User: Shows "Confirm it's you"

    alt Confirm with passkey
        Frontend->>Backend: POST /api/auth/reauth-options
        Backend-->>Frontend: Request options (challenge in its own cookie)
        User->>Frontend: Approves with device (biometric/PIN)
        Frontend->>Backend: POST /api/auth/reauth-verify
        Backend->>Backend: verifyAuthenticationResponse()
    else Confirm with password
        User->>Frontend: Enters password
        Frontend->>Backend: POST /api/auth/reauth-password
        Backend->>Backend: bcrypt.compare()
    end

    Backend->>DB: setReauthUntil(email, now + REAUTH_WINDOW_MS)
    Backend-->>Frontend: { reauthenticated: true, expiresAt }

    Note right of Frontend: The original operation is replayed automatically
    Frontend->>Backend: DELETE /api/auth/passkeys/:id
    Backend->>DB: deletePasskey(email, credentialID)
    Backend->>DB: clearReauth(email)
    Backend-->>Frontend: 204 No Content
    Frontend-->>User: Passkey list refreshes
```

### Window semantics

- A successful reauthentication opens a window of `REAUTH_WINDOW_MS`
  (default five minutes).
- Completing one sensitive operation closes the window again, so each operation
  costs one reauthentication.
- An operation that **fails** does not close the window. A user whose delete was
  rejected should not have to prove who they are twice.
- Reauthenticating with a passkey does **not** rotate the session token, unlike
  signing in. Rotating it would invalidate the cookie of the session the user is
  currently using.

### Study switches

| Variable | Effect |
|---|---|
| `REAUTH_REQUIRED=false` | Control condition: no reauthentication at all. |
| `REAUTH_OPERATIONS` | Comma-separated subset to gate. Unset means all of them. |
| `REAUTH_WINDOW_MS` | How long a successful reauthentication stays valid. |

Operation names: `add-passkey`, `delete-passkey`, `rename-passkey`,
`delete-account`, `change-password`.
