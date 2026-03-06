import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function AccountPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        setUser(data);
      })
      .catch(() => setUser(null));
  }, []);

  async function deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;

    try {
      const res = await fetch('/api/auth/account', { method: 'DELETE' });
      if (res.ok) {
        window.location.href = '/';
      } else {
        alert('Failed to delete account');
      }
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <Layout>
      <div id="account-main" className="pt-4">
        <h1>Account</h1>
        {user && (
          <div className="mt-4 text-start">
            <p className="fs-5"><strong>Name:</strong> {user.name}</p>
            <p className="fs-5"><strong>Email:</strong> {user.email}</p>
            <button className="btn btn-danger mt-3" onClick={deleteAccount}>
              Delete Account
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}