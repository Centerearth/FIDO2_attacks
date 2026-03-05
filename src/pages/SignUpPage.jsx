import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { postAuthRequest } from '../services/api.js';

export default function SignUpPage() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function createUser() {
    if (!password) {
      alert('⚠ Error: Password cannot be empty');
      return;
    }

    try {
      await postAuthRequest('/api/auth/create', { name: userName, email, password });
      localStorage.setItem('userName', userName);
      navigate('/login');
    } catch (error) {
      alert(`⚠ Error: ${error.message}`);
    }
  }

  return (
    <Layout>
      <div className="col-lg-12 col-xl-11 pt-4">
        <div className="card text-black" style={{ borderRadius: '25px' }}>
          <div className="row justify-content-center">
            <div className="col-md-10 col-lg-6 col-xl-5 order-2 order-lg-1">
              <p className="text-center h1 fw-bold mb-5 mx-1 mx-md-4 mt-4">Sign up</p>
              <form className="mx-1 mx-md-4">
                <div className="d-flex flex-row align-items-center mb-4">
                  <i className="fas fa-user fa-lg me-3 fa-fw"></i>
                  <div className="form-outline flex-fill mb-0">
                    <input
                      type="text"
                      id="signUpName"
                      className="form-control"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                    />
                    <label className="form-label" htmlFor="signUpName">Your Name</label>
                  </div>
                </div>
                <div className="d-flex flex-row align-items-center mb-4">
                  <i className="fas fa-envelope fa-lg me-3 fa-fw"></i>
                  <div className="form-outline flex-fill mb-0">
                    <input
                      type="email"
                      id="signUpEmail"
                      className="form-control"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <label className="form-label" htmlFor="signUpEmail">Your Email</label>
                  </div>
                </div>
                <div className="d-flex flex-row align-items-center mb-4">
                  <i className="fas fa-lock fa-lg me-3 fa-fw"></i>
                  <div className="form-outline flex-fill mb-0">
                    <input
                      type="password"
                      id="signUpPassword"
                      className="form-control"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <label className="form-label" htmlFor="signUpPassword">Password</label>
                  </div>
                </div>
                <div className="d-flex justify-content-center mx-4 mb-3 mb-lg-4">
                  <button type="button" className="btn btn-primary btn-lg" onClick={createUser}>
                    Register
                  </button>
                </div>
              </form>
            </div>
            <div className="col-md-10 col-lg-6 col-xl-7 d-flex align-items-center order-1 order-lg-2">
              <img src="/Y2.png" className="img-fluid" alt="Sample image" />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
