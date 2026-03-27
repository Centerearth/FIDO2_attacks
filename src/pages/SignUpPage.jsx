import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { postAuthRequest } from '../services/api.js';
import { useAuth } from '../context/AuthContext';
import { startRegistration } from '@simplewebauthn/browser';

export default function SignUpPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  async function createUser() {
    setErrorMsg(null);
    if (!password || password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }

    try {
      const userData = await postAuthRequest('/api/auth/create', { name: userName, email, password });
      login(userData);
      navigate('/');
    } catch (error) {
      setErrorMsg(error.message);
    }
  }

  async function createUserAndPasskey() {
    setErrorMsg(null);
    if (!email || !userName) {
      setErrorMsg('Please enter your email address and name first to use a passkey.');
      return;
    }

    try {
      const options = await postAuthRequest('/api/auth/signup-register-options', { email, name: userName });
      const attResp = await startRegistration(options);
      const verifyResp = await postAuthRequest('/api/auth/signup-register-verify', attResp);
      if (verifyResp.verified) {
        login({ email: verifyResp.email, name: verifyResp.name });
        navigate('/');
      }
    } catch (e) {
      setErrorMsg(`Error registering passkey: ${e.message}`);
    }
  }

  return (
    <Layout>
      <div id="signup-main" className="pt-5">
        <div className="card shadow-sm" style={{ width: '25rem' }}>
          <div className="card-body p-4">
            <h1 className="card-title text-center mb-4">Sign Up</h1>
            <form onSubmit={(e) => { e.preventDefault(); createUser(); }}>
              <div className="form-floating mb-3">
                <input
                  type="text"
                  id="signUpName"
                  className="form-control"
                  value={userName}
                  onChange={(e) => { setUserName(e.target.value); setErrorMsg(null); }}
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
                  onChange={(e) => { setEmail(e.target.value); setErrorMsg(null); }}
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
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
                  placeholder="Password"
                />
                <label htmlFor="signUpPassword">Password</label>
              </div>
              {errorMsg && (
                <div className="alert alert-danger py-2 mb-3">
                  {errorMsg}
                </div>
              )}
              <button type="submit" className="btn btn-primary w-100 py-2">
                Register
              </button>
              <button type="button" className="btn btn-primary w-100 py-2 mt-3" onClick={() => createUserAndPasskey()}>
                Sign up with passkey
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
