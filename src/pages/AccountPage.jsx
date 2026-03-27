import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startRegistration } from '@simplewebauthn/browser';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { deleteAccount as deleteAccountApi, postAuthRequest, getPasskeys, deletePasskey, updatePassword } from '../services/api';

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, clearUser } = useAuth();
  const [passkeys, setPasskeys] = useState([]);
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState(null);

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

  async function deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;

    try {
      await deleteAccountApi();
      clearUser();
      navigate('/');
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleDeletePasskey(id) {
    if (!confirm('Are you sure you want to delete this passkey?')) return;
    try {
      await deletePasskey(id);
      loadPasskeys();
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    try {
      await updatePassword(newPassword);
      setNewPassword('');
      setPasswordMsg({ type: 'success', text: 'Password updated successfully.' });
    } catch (err) {
      setPasswordMsg({ type: 'danger', text: err.message });
    }
  }

  async function addPasskey() {
    try {
      // 1. Get options from server
      const options = await postAuthRequest('/api/auth/register-options', {});

      // 2. Pass options to browser authenticator
      const attResp = await startRegistration(options);

      // 3. Send response to server for verification
      await postAuthRequest('/api/auth/register-verify', attResp);
      alert('Passkey registered successfully!');
      loadPasskeys();
    } catch (e) {
      alert(`Error registering passkey: ${e.message}`);
    }
  }

  return (
    <Layout>
      <div id="account-main" className="pt-4">
        <h1>Account</h1>
        {user ? (
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
              <button className="btn btn-primary mt-3" onClick={addPasskey}>
                Add passkey
              </button>
            </div>
            
            <h4 className="mt-5">Update Password</h4>
            <form
              className="mt-3"
              onSubmit={handleChangePassword}
            >
              <div className="mb-3" style={{ maxWidth: '400px' }}>
                <label htmlFor="new-password" className="form-label">New Password</label>
                <input
                  id="new-password"
                  type="password"
                  className="form-control"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>
              {passwordMsg && (
                <div className={`alert alert-${passwordMsg.type} py-2`} style={{ maxWidth: '400px' }}>
                  {passwordMsg.text}
                </div>
              )}
              <button type="submit" className="btn btn-primary">Update Password</button>
            </form>

            <button className="btn btn-danger mt-5" onClick={deleteAccount}>
              Delete Account
            </button>
          </div>
        ) : (
          <p className="mt-4">Please log in to view your account details.</p>
        )}
      </div>
    </Layout>
  );
}