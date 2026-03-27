import { useState, useEffect } from 'react';
import Layout from '../components/Layout';

export default function CartPage() {
  const [cartItems, setCartItems] = useState([]);

  useEffect(() => {
    // Load cart items from localStorage on component mount
    const items = JSON.parse(localStorage.getItem('cart')) || [];
    setCartItems(items);
  }, []);

  const cartTotal = cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

  const handleCheckout = () => {
    localStorage.removeItem('cart');
    setCartItems([]);
    window.dispatchEvent(new Event('cartUpdated'));
  };

  return (
    <Layout>
      <div className="pt-4 w-100 text-start">
        <h1>Cart</h1>
        {cartItems.length > 0 ? (
          <>
            <table className="table mt-4">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Price</th>
                  <th scope="col">Quantity</th>
                  <th scope="col" className="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                {cartItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>${item.price.toFixed(2)}</td>
                    <td>{item.quantity}</td>
                    <td className="text-end">${(item.price * item.quantity).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="3"></td>
                  <td className="text-end fw-bold">${cartTotal.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
<div className="d-flex justify-content-end">
              <button className="btn btn-primary" onClick={handleCheckout}>
                Check out and purchase
              </button>
            </div>
          </>
        ) : (
          <p className="mt-4">Your cart is empty.</p>
        )}
      </div>
    </Layout>
  );
}
