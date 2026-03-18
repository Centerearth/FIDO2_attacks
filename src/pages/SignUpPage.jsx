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

  async function createUser() {
    if (!password || password.length < 8) {
      alert('⚠ Error: Password must be at least 8 characters long');
      return;
    }

    try {
      const userData = await postAuthRequest('/api/auth/create', { name: userName, email, password });
      login(userData);
      navigate('/');
    } catch (error) {
      alert(`⚠ Error: ${error.message}`);
    }
  }

  async function createUserAndPasskey() {
    if (!email || !userName) {
      alert('Please enter your email address and name first to use a passkey.');
    }
    const userData = await postAuthRequest('/api/auth/create', { name: userName, email, "password": "" });
    
    try {
      // 1. Get options from server
      const options = await postAuthRequest('/api/auth/register-options', {});

      // 2. Pass options to browser authenticator
      const attResp = await startRegistration(options);

      // 3. Send response to server for verification
      await postAuthRequest('/api/auth/register-verify', attResp);
      alert('Passkey registered successfully!');
      login(userData);
      navigate('/');
    } catch (e) {
      alert(`Error registering passkey: ${e.message}`);
    }
    return;
  
  //use the already existing function, but allow passwords to be null or empty for passkey registration. Must update backend to not allow sign in with empty password, but allow it for registration if passkey is used.
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
