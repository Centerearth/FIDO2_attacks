import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { postAuthRequest } from '../services/api.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function loginUser() {
    try {
      await postAuthRequest('/api/auth/login', { email, password });
      navigate('/');
    } catch (error) {
      alert(`⚠ Error: ${error.message}`);
    }
  }

  return (
    <Layout>
      <div id="login-main" className="pt-5">
        <div className="card shadow-sm" style={{ width: '25rem' }}>
          <div className="card-body p-4">
            <h1 className="card-title text-center mb-4">Login</h1>
            <form id="myForm" onSubmit={(e) => {
              e.preventDefault();
              loginUser();
            }}>
              <div className="form-floating mb-3">
                <input
                  type="email"
                  id="loginEmail"
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                />
                <label htmlFor="loginPassword">Password</label>
              </div>
              <button type="submit" className="btn btn-primary w-100 py-2">
                Sign in
              </button>
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
