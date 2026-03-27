import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { deleteAccount as deleteAccountApi, postAuthRequest, getPasskeys, deletePasskey, updatePassword } from '../services/api';

const CONFIRM_CLOSED = { show: false, title: '', body: '', onConfirm: null };
const INFO_CLOSED    = { show: false, title: '', body: '', variant: 'success' };

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, clearUser } = useAuth();
  const [passkeys, setPasskeys] = useState([]);
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState(null);
  const [confirmModal, setConfirmModal] = useState(CONFIRM_CLOSED);
  const [infoModal, setInfoModal] = useState(INFO_CLOSED);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [accountLoading, setAccountLoading] = useState(false);

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
    }
  }

  useEffect(() => {
    if (user) {
      loadPasskeys();
    }
  }, [user]);

  function deleteAccount() {
    showConfirm(
      'Delete Account',
      'Are you sure you want to delete your account? This cannot be undone.',
      async () => {
        setAccountLoading(true);
        try {
          await deleteAccountApi();
          clearUser();
          navigate('/');
        } catch (e) {
          showInfo('Error', e.message, 'danger');
        } finally {
          setAccountLoading(false);
        }
      }
    );
  }

  function handleDeletePasskey(id) {
    showConfirm(
      'Delete Passkey',
      'Are you sure you want to delete this passkey?',
      async () => {
        setPasskeyLoading(true);
        try {
          await deletePasskey(id);
          loadPasskeys();
        } catch (e) {
          showInfo('Error', e.message, 'danger');
        } finally {
          setPasskeyLoading(false);
        }
      }
    );
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setPasswordLoading(true);
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setPasswordMsg({ type: 'success', text: 'Password updated successfully.' });
    } catch (err) {
      setPasswordMsg({ type: 'danger', text: err.message });
    } finally {
      setPasswordLoading(false);
    }
  }

  async function addPasskey() {
    setPasskeyLoading(true);
    try {
      const options = await postAuthRequest('/api/auth/register-options', {});
      const attResp = await startRegistration(options);
      await postAuthRequest('/api/auth/register-verify', attResp);
      showInfo('Passkey Added', 'Passkey registered successfully!');
      loadPasskeys();
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
                <li key={key.credentialID} className="list-group-item d-flex justify-content-between align-items-center">
                  <div>
                    {key.credentialID} was registered on {new Date(key.created_at).toLocaleDateString()}
                    {key.transports && ` (via ${key.transports.join(', ')})`}
                  </div>
                  <button
                    className="btn btn-sm btn-outline-danger"
                    disabled={passkeyLoading}
                    onClick={() => handleDeletePasskey(key.credentialID)}
                  >
                    Delete
                  </button>
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
