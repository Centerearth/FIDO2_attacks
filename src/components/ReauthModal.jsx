import { useEffect, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { getReauthStatus, getReauthOptions, verifyReauth, reauthWithPassword } from '../services/api';

/**
 * Asks a signed-in user to prove who they are again before a sensitive
 * operation such as adding or deleting a passkey.
 *
 * Offers whichever methods the account actually has. A passkey-only account
 * sees only the passkey button; an account that signed up with a password and
 * has no passkey yet sees only the password field.
 *
 * @param {object} props
 * @param {boolean} props.show
 * @param {string} [props.actionLabel] - What the user is about to do, e.g.
 *   "delete this passkey", used to explain why they are being asked.
 * @param {() => void} props.onCancel
 * @param {() => void} props.onSuccess - Called once reauthentication succeeds.
 */
export default function ReauthModal({ show, actionLabel, onCancel, onSuccess }) {
  const [methods, setMethods] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Ask the server which methods this account can use each time the prompt
  // opens, so adding a first passkey immediately enables passkey reauth.
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    setPassword('');
    setError(null);
    setMethods(null);
    getReauthStatus()
      .then((status) => { if (!cancelled) setMethods(status.methods); })
      .catch((e) => {
        if (!cancelled) {
          setMethods({ password: false, passkey: false });
          setError(e.message);
        }
      });
    return () => { cancelled = true; };
  }, [show]);

  if (!show) return null;

  async function reauthPasskey() {
    setError(null);
    setBusy(true);
    try {
      const options = await getReauthOptions();
      const assertion = await startAuthentication({ optionsJSON: options });
      await verifyReauth(assertion);
      onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reauthPassword(e) {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError('Please enter your password.');
      return;
    }
    setBusy(true);
    try {
      await reauthWithPassword(password);
      setPassword('');
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const loading = methods === null;
  const noMethods = methods && !methods.password && !methods.passkey;

  return (
    <>
      <div className="modal d-block" tabIndex="-1" role="dialog" aria-modal="true">
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Confirm it's you</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onCancel} />
            </div>
            <div className="modal-body">
              <p>
                For your security, please sign in again
                {actionLabel ? ` before you ${actionLabel}` : ''}.
              </p>

              {loading && <p className="text-muted mb-0">Checking available sign-in methods...</p>}

              {noMethods && (
                <p className="text-danger mb-0">
                  This account has no password or passkey available to confirm with.
                </p>
              )}

              {methods?.passkey && (
                <button
                  type="button"
                  className="btn btn-primary w-100 py-2"
                  disabled={busy}
                  onClick={reauthPasskey}
                >
                  {busy ? <><span className="spinner-border spinner-border-sm me-2" />Confirming...</> : 'Confirm with passkey'}
                </button>
              )}

              {methods?.passkey && methods?.password && (
                <div className="text-center text-muted my-3">or</div>
              )}

              {methods?.password && (
                <form onSubmit={reauthPassword}>
                  <div className="form-floating mb-3">
                    <input
                      type="password"
                      id="reauthPassword"
                      className="form-control"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      placeholder="Password"
                    />
                    <label htmlFor="reauthPassword">Password</label>
                  </div>
                  <button type="submit" className="btn btn-primary w-100 py-2" disabled={busy}>
                    {busy ? <><span className="spinner-border spinner-border-sm me-2" />Confirming...</> : 'Confirm with password'}
                  </button>
                </form>
              )}

              {error && (
                <div role="alert" className="alert alert-danger py-2 mt-3 mb-0">
                  {error}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" />
    </>
  );
}
