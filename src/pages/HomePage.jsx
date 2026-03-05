import React from 'react';
import Layout from '../components/Layout';
import products from '../data/product-descriptions.json';

export default function HomePage() {
  function addToCart(product) {
    // Get the existing cart from localStorage, or initialize an empty array
    const cart = JSON.parse(localStorage.getItem('cart')) || [];

    // Check if the product is already in the cart
    const existingProductIndex = cart.findIndex((item) => item.id === product.id);

    if (existingProductIndex > -1) {
      // If it exists, just increment the quantity
      cart[existingProductIndex].quantity += 1;
    } else {
      // If it's a new product, add it to the cart with a quantity of 1
      cart.push({ ...product, quantity: 1 });
    }

    // Save the updated cart back to localStorage
    localStorage.setItem('cart', JSON.stringify(cart));
    window.dispatchEvent(new Event('cartUpdated'));
  }

  return (
    <Layout>
      <div id="index-main" className="pt-4 w-100">
        <h1>Welcome!</h1>
        <p>This is a simple shopping website for FIDO2 research.</p>

        <div className="row mt-4">
          {products.map((product) => (
            <div key={product.id} className="col-md-3 mb-4">
              <div className="card h-100">
                <div className="card-body text-start">
                  <h5 className="card-title">{product.name}</h5>
                  <p className="card-text">
                    {product.description}
                  </p>
                  <p className="card-text fw-bold">${product.price.toFixed(2)}</p>
                  <button className="btn btn-primary" onClick={() => addToCart(product)}>
                    Add to Cart
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
