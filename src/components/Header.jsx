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
      <nav className="navbar navbar-dark">
        <NavLink className="navbar-brand" to="/">
          Simply Shopping
        </NavLink>
        <menu className="navbar-nav">
          <li className="nav-item">
            <NavLink className="nav-link" to="/">
              Home
            </NavLink>
          </li>
          <li className="nav-item">
            <NavLink className="nav-link" to="/about">
              About
            </NavLink>
          </li>
          {userEmail ? (
            <>
              <li className="nav-item">
                <span className="nav-link">{userEmail}</span>
              </li>
              <li className="nav-item">
                <button className="btn btn-link nav-link" onClick={handleLogout}>
                  Logout
                </button>
              </li>
            </>
          ) : (
            <li className="nav-item">
              <NavLink className="nav-link" to="/login">
                Login
              </NavLink>
            </li>
          )}
        </menu>
      </nav>
    </header>
  );
}
