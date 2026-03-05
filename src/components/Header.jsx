import { NavLink } from 'react-router-dom';

export default function Header() {
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
          <li className="nav-item">
            <NavLink className="nav-link" to="/login">
              Login
            </NavLink>
          </li>
        </menu>
      </nav>
    </header>
  );
}
