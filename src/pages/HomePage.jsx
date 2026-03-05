import React from 'react';
import Layout from '../components/Layout';

export default function HomePage() {
  return (
    <Layout>
      <div id="index-main" className="pt-4 w-100">
        <h1>Welcome!</h1>
        <p>This is a simple shopping website for FIDO2 research.</p>

        <div className="row mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="col-md-3 mb-4">
              <div className="card h-100">
                <div className="card-body text-start">
                  <h5 className="card-title">Product {i + 1}</h5>
                  <p className="card-text">
                    This is a simple box for a product. More details about the product can go here.
                  </p>
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
