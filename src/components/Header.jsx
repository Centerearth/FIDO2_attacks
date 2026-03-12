import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [itemCount, setItemCount] = useState(0);

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
      alert(`⚠ Error during logout: ${error.message}`);
    }
  }

  return (
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
  );
}
