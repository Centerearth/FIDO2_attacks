import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import Layout from '../components/Layout';
import ReauthModal from '../components/ReauthModal';
import { useAuth } from '../context/AuthContext';
import {
  deleteAccount as deleteAccountApi,
  postAuthRequest,
  getPasskeys,
  deletePasskey,
  renamePasskey,
  updatePassword,
} from '../services/api';

const CONFIRM_CLOSED = { show: false, title: '', body: '', onConfirm: null };
const INFO_CLOSED    = { show: false, title: '', body: '', variant: 'success' };
const REAUTH_CLOSED  = { show: false, actionLabel: '', retry: null };

/** Formats a passkey's registration date, tolerating a missing value. */
function formatCreated(created_at) {
  if (!created_at) return 'an unknown date';
  const date = new Date(created_at);
  return Number.isNaN(date.getTime()) ? 'an unknown date' : date.toLocaleDateString();
}

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, clearUser } = useAuth();
  const [passkeys, setPasskeys] = useState([]);
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState(null);
  const [confirmModal, setConfirmModal] = useState(CONFIRM_CLOSED);
  const [infoModal, setInfoModal] = useState(INFO_CLOSED);
  const [reauth, setReauth] = useState(REAUTH_CLOSED);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);
  // credentialID of the passkey being renamed, plus the in-progress name.
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');

  function showInfo(title, body, variant = 'success') {
    setInfoModal({ show: true, title, body, variant });
  }

  function showConfirm(title, body, onConfirm) {
    setConfirmModal({ show: true, title, body, onConfirm });
  }

  async function loadPasskeys() {
    try {
      const passkeyData = await getPasskeys();
      setPasskeys(passkeyData);
    } catch (e) {
      console.error('Failed to load passkeys', e);
      showInfo('Error', `Could not load your passkeys: ${e.message}`, 'danger');
    }
  }

  useEffect(() => {
    if (user) {
      loadPasskeys();
    }
  }, [user]);

  /**
   * Runs a sensitive operation, and if the server asks for reauthentication
   * first, opens the prompt and replays the operation once it succeeds. The
   * server decides when a prompt is needed, so turning the study's
   * reauthentication treatment off needs no change here.
   *
   * @param {string} actionLabel - completes "before you ..." in the prompt.
   * @param {() => Promise<void>} operation
   */
  async function runWithReauth(actionLabel, operation) {
    try {
      await operation();
    } catch (e) {
      if (e && e.reauthRequired) {
        setReauth({ show: true, actionLabel, retry: operation });
        return;
      }
      throw e;
    }
  }

  function onReauthSuccess() {
    const retry = reauth.retry;
    setReauth(REAUTH_CLOSED);
    if (retry) {
      // The prompt already reported its own failures; anything thrown here is
      // from the replayed operation itself.
      retry().catch((e) => showInfo('Error', e.message, 'danger'));
    }
  }

  function deleteAccount() {
    showConfirm(
      'Delete Account',
      'Are you sure you want to delete your account? This cannot be undone.',
      async () => {
        setAccountLoading(true);
        try {
          await runWithReauth('delete your account', async () => {
            await deleteAccountApi();
            clearUser();
            navigate('/');
          });
        } catch (e) {
          showInfo('Error', e.message, 'danger');
        } finally {
          setAccountLoading(false);
        }
      }
    );
  }

  function handleDeletePasskey(key) {
    const label = key.name || 'This passkey';
    showConfirm(
      'Delete Passkey',
      `Are you sure you want to delete ${key.name ? `"${key.name}"` : 'this passkey'}? `
        + 'This removes it from your account here. A copy stays on your device or '
        + 'password manager until you delete it there as well.',
      async () => {
        setPasskeyLoading(true);
        try {
          await runWithReauth('delete this passkey', async () => {
            await deletePasskey(key.credentialID);
            await loadPasskeys();
            // A website cannot remove a credential from an authenticator, so the
            // only way the leftover copy disappears is if the user deletes it
            // where it actually lives.
            showInfo(
              'Passkey Deleted',
              `${label} can no longer be used to sign in here. It is still saved in `
                + 'your password manager or device settings, where it may keep being '
                + 'offered at sign-in. Delete it there too: on iPhone or Mac in '
                + 'Settings > Passwords, on Android in Google Password Manager, on '
                + 'Windows in Settings > Accounts > Passkeys, or in whichever password '
                + 'manager you used.'
            );
          });
        } catch (e) {
          showInfo('Error', e.message, 'danger');
        } finally {
          setPasskeyLoading(false);
        }
      }
    );
  }

  function startRename(key) {
    setEditingId(key.credentialID);
    setEditingName(key.name || '');
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName('');
  }

  async function submitRename(e, id) {
    e.preventDefault();
    const name = editingName.trim();
    if (!name) {
      showInfo('Error', 'Passkey name cannot be empty.', 'danger');
      return;
    }
    setPasskeyLoading(true);
    try {
      await runWithReauth('rename this passkey', async () => {
        await renamePasskey(id, name);
        cancelRename();
        await loadPasskeys();
      });
    } catch (err) {
      showInfo('Error', err.message, 'danger');
    } finally {
      setPasskeyLoading(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordLoading(true);
    try {
      if (!newPassword || newPassword.length < 8) {
        setPasswordMsg({ type: 'danger', text: 'Password must be at least 8 characters long.' });
        return;
      }
      await runWithReauth('change your password', async () => {
        await updatePassword(newPassword);
        setNewPassword('');
        setPasswordMsg({ type: 'success', text: 'Password updated successfully.' });
      });
    } catch (err) {
      setPasswordMsg({ type: 'danger', text: err.message });
    } finally {
      setPasswordLoading(false);
    }
  }

  async function addPasskey() {
    setPasskeyLoading(true);
    try {
      await runWithReauth('add a passkey', async () => {
        const options = await postAuthRequest('/api/auth/register-options', {});
        const attResp = await startRegistration(options);
        const result = await postAuthRequest('/api/auth/register-verify', attResp);
        showInfo(
          'Passkey Added',
          result.name
            ? `Registered "${result.name}" successfully. You can rename it below.`
            : 'Passkey registered successfully!'
        );
        await loadPasskeys();
      });
    } catch (e) {
      showInfo('Error', `Error registering passkey: ${e.message}`, 'danger');
    } finally {
      setPasskeyLoading(false);
    }
  }

  return (
    <Layout>
      <div id="account-main" className="pt-4">
        <h1>Account</h1>
        <div className="mt-4 text-start">
          <p className="fs-5"><strong>Name:</strong> {user.name}</p>
          <p className="fs-5"><strong>Email:</strong> {user.email}</p>

          <h4 className="mt-5">Your Passkeys</h4>
          {passkeys.length > 0 ? (
            <ul className="list-group mt-3">
              {passkeys.map((key) => (
                <li key={key.credentialID} className="list-group-item">
                  {editingId === key.credentialID ? (
                    <form className="d-flex gap-2 align-items-center" onSubmit={(e) => submitRename(e, key.credentialID)}>
                      <label htmlFor={`rename-${key.credentialID}`} className="visually-hidden">
                        Passkey name
                      </label>
                      <input
                        id={`rename-${key.credentialID}`}
                        className="form-control form-control-sm"
                        value={editingName}
                        maxLength={64}
                        autoFocus
                        onChange={(e) => setEditingName(e.target.value)}
                      />
                      <button type="submit" className="btn btn-sm btn-primary" disabled={passkeyLoading}>
                        Save
                      </button>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={cancelRename}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="d-flex justify-content-between align-items-center gap-3">
                      <div>
                        <div className="fw-semibold">{key.name || 'Passkey'}</div>
                        <div className="text-muted small">
                          Registered on {formatCreated(key.created_at)}
                          {key.transports && key.transports.length > 0 && ` (via ${key.transports.join(', ')})`}
                        </div>
                        {/* Kept visible so passkeys can still be matched against proxy logs. */}
                        <div className="text-muted small font-monospace text-break">{key.credentialID}</div>
                      </div>
                      <div className="d-flex gap-2 flex-shrink-0">
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          disabled={passkeyLoading}
                          onClick={() => startRename(key)}
                          aria-label={`Rename ${key.name || 'passkey'}`}
                        >
                          Rename
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          disabled={passkeyLoading}
                          onClick={() => handleDeletePasskey(key)}
                          aria-label={`Delete ${key.name || 'passkey'}`}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>You have no passkeys registered.</p>
          )}

          <div className="mt-4">
            <button className="btn btn-primary mt-3" disabled={passkeyLoading} onClick={addPasskey}>
              {passkeyLoading ? <><span className="spinner-border spinner-border-sm me-2" />Adding...</> : 'Add passkey'}
            </button>
          </div>

          <h4 className="mt-5">Update Password</h4>
          <form className="mt-3" onSubmit={handleChangePassword}>
            <div className="mb-3" style={{ maxWidth: '400px' }}>
              <label htmlFor="new-password" className="form-label">New Password</label>
              <input
                id="new-password"
                type="password"
                className="form-control"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordMsg(null); }}
                placeholder="Enter new password"
              />
            </div>
            {passwordMsg && (
              <div role="alert" className={`alert alert-${passwordMsg.type} py-2`} style={{ maxWidth: '400px' }}>
                {passwordMsg.text}
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={passwordLoading}>
              {passwordLoading ? <><span className="spinner-border spinner-border-sm me-2" />Updating...</> : 'Update Password'}
            </button>
          </form>

          <button className="btn btn-danger mt-5" disabled={accountLoading} onClick={deleteAccount}>
            Delete Account
          </button>
        </div>
      </div>

      {/* Reauthentication prompt */}
      <ReauthModal
        show={reauth.show}
        actionLabel={reauth.actionLabel}
        onCancel={() => setReauth(REAUTH_CLOSED)}
        onSuccess={onReauthSuccess}
      />

      {/* Confirmation modal */}
      {confirmModal.show && (
        <>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{confirmModal.title}</h5>
                  <button type="button" className="btn-close" onClick={() => setConfirmModal(CONFIRM_CLOSED)} />
                </div>
                <div className="modal-body">
                  <p>{confirmModal.body}</p>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setConfirmModal(CONFIRM_CLOSED)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => { setConfirmModal(CONFIRM_CLOSED); confirmModal.onConfirm(); }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}

      {/* Info / error modal */}
      {infoModal.show && (
        <>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className={`modal-header text-bg-${infoModal.variant}`}>
                  <h5 className="modal-title">{infoModal.title}</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setInfoModal(INFO_CLOSED)} />
                </div>
                <div className="modal-body">
                  <p>{infoModal.body}</p>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setInfoModal(INFO_CLOSED)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}
    </Layout>
  );
}
