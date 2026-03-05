import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }) {
  return (
    <div className="layout-container">
      <Header />
      <main className="container-fluid text-center">{children}</main>
      <Footer />
    </div>
  );
}
