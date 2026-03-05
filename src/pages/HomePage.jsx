import React from 'react';
import Layout from '../components/Layout';
import products from '../data/product-descriptions.json';

export default function HomePage() {
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
                  <a href="#" className="btn btn-primary">
                    Add to Cart
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
