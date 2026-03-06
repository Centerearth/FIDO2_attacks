import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { postAuthRequest } from '../services/api.js';

export default function SignUpPage() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function createUser() {
    if (!password || password.length < 8) {
      alert('⚠ Error: Password must be at least 8 characters long');
      return;
    }

    try {
      await postAuthRequest('/api/auth/create', { name: userName, email, password });
      navigate('/');
    } catch (error) {
      alert(`⚠ Error: ${error.message}`);
    }
  }

  return (
    <Layout>
      <div id="signup-main" className="pt-5">
        <div className="card shadow-sm" style={{ width: '25rem' }}>
          <div className="card-body p-4">
            <h1 className="card-title text-center mb-4">Sign Up</h1>
            <form onSubmit={(e) => {
              e.preventDefault();
              createUser();
            }}>
              <div className="form-floating mb-3">
                <input
                  type="text"
                  id="signUpName"
                  className="form-control"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="John Doe"
                />
                <label htmlFor="signUpName">Your Name</label>
              </div>
              <div className="form-floating mb-3">
                <input
                  type="email"
                  id="signUpEmail"
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
                <label htmlFor="signUpEmail">Email address</label>
              </div>
              <div className="form-floating mb-4">
                <input
                  type="password"
                  id="signUpPassword"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />
                <label htmlFor="signUpPassword">Password</label>
              </div>
              <button type="submit" className="btn btn-primary w-100 py-2">
                Register
              </button>
              <div className="text-center mt-3 d-flex justify-content-center align-items-center">
                <p className="mb-0 me-2">
                  Already have an account?
                </p>
                <button type="button" className="btn btn-primary" onClick={() => navigate('/login')}>
                  Login
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
