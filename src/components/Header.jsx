import { NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../services/api.js';

export default function Header() {
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('userEmail');

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
        {userEmail ? (
          <>
            <NavLink className="nav-link text-white-50 px-3" to="/cart">
              Cart
            </NavLink>
            <NavLink className="nav-link text-white-50 ms-auto px-3" to="/account">Account</NavLink>
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
