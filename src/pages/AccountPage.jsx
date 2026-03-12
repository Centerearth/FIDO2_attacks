import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { getUser, deleteAccount as deleteAccountApi } from '../services/api';

export default function AccountPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const data = await getUser();
        if (data) setUser(data);
      } catch { /* ignore error, user remains null */ }
    }
    loadUser();
  }, []);

  async function deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;

    try {
      await deleteAccountApi();
      navigate('/');
    } catch (e) {
      alert(e.message);
    }
  }

  async function addPasskey() {
    alert('Passkey functionality is not implemented yet.');
  }

  return (
    <Layout>
      <div id="account-main" className="pt-4">
        <h1>Account</h1>
        {user ? (
          <div className="mt-4 text-start">
            <p className="fs-5"><strong>Name:</strong> {user.name}</p>
            <p className="fs-5"><strong>Email:</strong> {user.email}</p>
            <div className="mt-4">
              <button className="btn btn-primary mt-3" onClick={addPasskey}>
                Add passkey
              </button>
            </div>
            <button className="btn btn-danger mt-3" onClick={deleteAccount}>
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