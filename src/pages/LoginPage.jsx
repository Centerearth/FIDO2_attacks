import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAuthentication, browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser';
import Layout from '../components/Layout';
import { postAuthRequest } from '../services/api.js';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  async function loginUser() {
    setErrorMsg(null);
    try {
      const userData = await postAuthRequest('/api/auth/login', { email, password });
      login(userData);
      navigate('/');
    } catch (error) {
      setErrorMsg(error.message);
    }
  }

  /**
   * Signs in with a passkey.
   *
   * An email is sent only if the user happened to type one. Without it the
   * server issues a discoverable-credential challenge, the authenticator offers
   * whichever passkeys it holds for this site, and the chosen credential
   * identifies the account — so nothing has to be typed.
   *
   * @param {boolean} useAutofill - run as a background conditional-UI ceremony
   *   that resolves only when the user picks a passkey from the browser's own
   *   autofill menu.
   */
  async function loginUserPasskey({ useAutofill = false } = {}) {
    if (!useAutofill) setErrorMsg(null);

    const identifier = useAutofill ? {} : (email ? { email } : {});
    const options = await postAuthRequest('/api/auth/authentication-options', identifier);
    const attResp = await startAuthentication({ optionsJSON: options, useBrowserAutofill: useAutofill });
    const verifyResp = await postAuthRequest('/api/auth/authentication-verify', {
      ...identifier,
      response: attResp,
    });
    if (verifyResp.verified) {
      login({ email: verifyResp.email, name: verifyResp.name });
      navigate('/');
    }
  }

  async function handlePasskeyClick() {
    try {
      await loginUserPasskey();
    } catch (e) {
      setErrorMsg(`Error logging in with passkey: ${e.message}`);
    }
  }

  // Offer passkeys in the browser's autofill menu as soon as the page loads.
  // This is an invitation, not a request: if the browser cannot do it, or the
  // user ignores it and clicks the button instead, the ceremony is simply
  // superseded and nothing is reported.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!(await browserSupportsWebAuthnAutofill())) return;
        if (cancelled) return;
        await loginUserPasskey({ useAutofill: true });
      } catch {
        /* cancelled, unsupported, or superseded by the button — not an error */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout>
      <div id="login-main" className="pt-5">
        <div className="card shadow-sm" style={{ width: '25rem' }}>
          <div className="card-body p-4">
            <h1 className="card-title text-center mb-4">Login</h1>
            <form id="myForm" onSubmit={(e) => { e.preventDefault(); loginUser(); }}>
              <div className="form-floating mb-3">
                <input
                  type="email"
                  id="loginEmail"
                  className="form-control"
                  value={email}
                  /* "webauthn" lets the browser list passkeys in this field's
                     autofill menu alongside saved usernames. */
                  autoComplete="username webauthn"
                  onChange={(e) => { setEmail(e.target.value); setErrorMsg(null); }}
                  placeholder="name@example.com"
                />
                <label htmlFor="loginEmail">Email address</label>
              </div>
              <div className="form-floating mb-4">
                <input
                  type="password"
                  id="loginPassword"
                  className="form-control"
                  value={password}
                  autoComplete="current-password"
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
                  placeholder="Password"
                />
                <label htmlFor="loginPassword">Password</label>
              </div>
              {errorMsg && (
                <div role="alert" className="alert alert-danger py-2 mb-3">
                  {errorMsg}
                </div>
              )}
              <button type="submit" className="btn btn-primary w-100 py-2">
                Sign in
              </button>
              <button type="button" className="btn btn-primary w-100 py-2 mt-3" onClick={handlePasskeyClick}>
                Sign in with passkey
              </button>
              <p className="text-muted small text-center mt-2 mb-0">
                No email needed — your passkey identifies you.
              </p>
              <div className="text-center mt-3 d-flex justify-content-center align-items-center">
                <p className="mb-0 me-2">
                  Don't have an account?
                </p>
                <button type="button" className="btn btn-primary" onClick={() => navigate('/sign-up')}>
                  Sign up
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
