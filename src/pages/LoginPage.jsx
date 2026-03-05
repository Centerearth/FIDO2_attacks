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
      localStorage.setItem('userEmail', email);
      navigate('/');
    } catch (error) {
      alert(`⚠ Error: ${error.message}`);
    }
  }

  return (
    <Layout>
      <div id="login-main" className="pt-4">
        <h1>Login</h1>
        <form id="myForm">
          <div className="form-outline mb-4">
            <input
              type="email"
              id="loginEmail"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="form-label" htmlFor="loginEmail">Email address</label>
          </div>
          <div className="form-outline mb-4">
            <input
              type="password"
              id="loginPassword"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="form-label" htmlFor="loginPassword">Password</label>
          </div>
          <button type="button" className="btn btn-primary" onClick={loginUser}>
            Sign in
          </button>
          <div className="text-center">
            <p>
              Don't have an account? Set one up <Link to="/sign-up">here!</Link>
            </p>
          </div>
        </form>
      </div>
    </Layout>
  );
}
