import React from 'react';
import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }) {
  return (
    <div className="bg-primary text-dark layout-container">
      <Header />
      <main className="container-fluid bg-white text-center">{children}</main>
      <Footer />
    </div>
  );
}
