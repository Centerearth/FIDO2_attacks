import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [itemCount, setItemCount] = useState(0);
  const [errorModal, setErrorModal] = useState(null);

  useEffect(() => {
    const calculateItemCount = () => {
      const cart = JSON.parse(localStorage.getItem('cart')) || [];
      const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
      setItemCount(totalItems);
    };

    calculateItemCount();

    window.addEventListener('cartUpdated', calculateItemCount);

    return () => {
      window.removeEventListener('cartUpdated', calculateItemCount);
    };
  }, []);

  async function handleLogout() {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      setErrorModal(error.message);
    }
  }

  return (
    <>
      <header className="container-fluid bg-dark">
        <nav className="navbar navbar-dark align-items-baseline">
          <NavLink className="navbar-brand" to="/">
            Simply Shopping
          </NavLink>
          <NavLink className="nav-link text-white-50 px-3" to="/">
            Home
          </NavLink>
          <NavLink className="nav-link text-white-50 px-3" to="/about">
            About
          </NavLink>
          {user ? (
            <>
              <NavLink className="nav-link text-white-50 ms-auto px-3 position-relative" to="/cart">
                Cart
                {itemCount > 0 && (
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                    {itemCount}
                    <span className="visually-hidden">items in cart</span>
                  </span>
                )}
              </NavLink>
              <NavLink className="nav-link text-white-50 px-3" to="/account">
                Account
              </NavLink>
              <button className="btn btn-link nav-link text-white-50 px-3" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <NavLink className="nav-link text-white-50 ms-auto px-3" to="/login">
              Login
            </NavLink>
          )}
        </nav>
      </header>

      {errorModal && (
        <>
          <div className="modal d-block" tabIndex="-1">
            <div className="modal-dialog">
              <div className="modal-content">
                <div className="modal-header text-bg-danger">
                  <h5 className="modal-title">Logout Error</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setErrorModal(null)} />
                </div>
                <div className="modal-body">
                  <p>{errorModal}</p>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setErrorModal(null)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" />
        </>
      )}
    </>
  );
}
