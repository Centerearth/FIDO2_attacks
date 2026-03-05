import React from 'react';
import Layout from '../components/Layout';

export default function HomePage() {
  return (
    <Layout>
      <div id="index-main" className="pt-4">
        <h1>Welcome!</h1>
        <p>This is a simple shopping website for FIDO2 research.</p>
      </div>
    </Layout>
  );
}
