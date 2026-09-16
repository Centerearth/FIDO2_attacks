## Naming a Passkey After Its Authenticator

The account page shows "Apple Passwords" or "YubiKey 5 Series" rather than a raw
base64url credential ID. The name comes from the AAGUID, a 16-byte identifier
for the authenticator model carried in the authenticator data.

```mermaid
flowchart TD
    A[Registration verified] --> B{AAGUID present and non-zero?}
    B -->|Yes| C[Look up backend/modules/aaguid-names.json]
    C --> D{Known model?}
    D -->|Yes| E["Apple Passwords, YubiKey 5 Series, ..."]
    D -->|No| F[Fall back to capabilities]
    B -->|No| F
    F --> G{Transport reported?}
    G -->|internal| H[This Device]
    G -->|hybrid| I[Phone or Tablet]
    G -->|usb / nfc / ble| J[USB / NFC / Bluetooth Security Key]
    G -->|none| K{Device type?}
    K -->|multiDevice| L[Synced Passkey]
    K -->|singleDevice| M[Security Key]
    E --> N{Name already used by this account?}
    H --> N
    I --> N
    J --> N
    L --> N
    M --> N
    N -->|Yes| O["Append (2), (3), ..."]
    N -->|No| P[Store as the passkey name]
    O --> P
```

### Attestation is what makes this work

When the relying party asks for `attestation: 'none'`, browsers deliberately
replace the AAGUID with sixteen zero bytes so that relying parties cannot
fingerprint the user's hardware. Every passkey then reports the same null
AAGUID and only the capability-based fallback names remain.

`ATTESTATION` therefore controls how specific these names can be:

| Setting | Naming | Notes |
|---|---|---|
| `direct` (default) | Real model names | The authenticator identifies its model. |
| `none` | Capability-based only | The privacy-preserving setting assumed by the proxy experiments in this repo. |

The name is only a label. Users can rename any passkey, and renaming is itself
a reauthentication-gated operation.
