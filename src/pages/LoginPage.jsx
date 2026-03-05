import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { postAuthRequest, logout } from '../services/api.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function loginUser() {
    try {
      await postAuthRequest('/api/auth/login', { email, password });
      localStorage.setItem('userEmail', email);
      navigate('/review-maker');
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
              id="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label className="form-label" htmlFor="email">Email address</label>
          </div>
          <div className="form-outline mb-4">
            <input
              type="password"
              id="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="form-label" htmlFor="password">Password</label>
          </div>
          <button type="button" className="btn btn-primary" onClick={loginUser}>
            Sign in
          </button>
          <button type="button" className="btn btn-primary" onClick={logout}>
            Logout
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
