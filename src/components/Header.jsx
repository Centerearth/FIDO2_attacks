import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Header() {
  return (
    <header className="container-fluid">
      <nav className="navbar navbar-dark">
        <NavLink className="navbar-brand" to="/">
          Rate My Class
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
          <li className="nav-item">
            <NavLink className="nav-link" to="/review-maker">
              Post A Review
            </NavLink>
          </li>
        </menu>
        <img className="navbar-pic" src="/Y.png" width="48" height="31" alt="" />
      </nav>
    </header>
  );
}
