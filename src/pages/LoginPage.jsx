import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startAuthentication } from '@simplewebauthn/browser';
import Layout from '../components/Layout';
import { postAuthRequest } from '../services/api.js';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  async function loginUserPasskey() {
    setErrorMsg(null);
    if (!email) {
      setErrorMsg('Please enter your email address first to use a passkey.');
      return;
    }

    try {
      const options = await postAuthRequest('/api/auth/authentication-options', { email });
      console.log('Received authentication options from server:', options);
      const attResp = await startAuthentication({ optionsJSON: options });
      const verifyResp = await postAuthRequest('/api/auth/authentication-verify', { email, response: attResp });
      if (verifyResp.verified) {
        login({ email: verifyResp.email, name: verifyResp.name });
        navigate('/');
      }
    } catch (e) {
      setErrorMsg(`Error logging in with passkey: ${e.message}`);
    }
  }

  return (
    <Layout>
      <div id="login-main" className="pt-5">
        <div className="card shadow-sm" style={{ width: '25rem' }}>
          <div className="card-body p-4">
            <h1 className="card-title text-center mb-4">Login</h1>
            <form id="myForm" onSubmit={(e) => { e.preventDefault(); loginUserPasskey(); }}>
              <div className="form-floating mb-4">
                <input
                  type="email"
                  id="loginEmail"
                  className="form-control"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrorMsg(null); }}
                  placeholder="name@example.com"
                />
                <label htmlFor="loginEmail">Email address</label>
              </div>
              {errorMsg && (
                <div role="alert" className="alert alert-danger py-2 mb-3">
                  {errorMsg}
                </div>
              )}
              <button type="submit" className="btn btn-primary w-100 py-2">
                Sign in with passkey
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
