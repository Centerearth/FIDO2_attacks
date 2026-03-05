import React from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

export default function HomePage() {
  const navigate = useNavigate();
  const [selectedClass, setSelectedClass] = React.useState('');

  function goto() {
    if (selectedClass) {
      navigate(`/${selectedClass}`);
    }
  }

  return (
    <Layout>
      <div id="index-main" className="pt-4">
        <h1>Welcome!</h1>
        <p>Search for a class below</p>
        <select
          className="custom-select custom-select-lg mb-3"
          id="classSelection"
          onChange={(e) => setSelectedClass(e.target.value)}
        >
          <option value="">Class List</option>
          <option value="cs260">CS 260</option>
          <option value="cs235">CS 235</option>
          <option value="cs111">CS 111</option>
          <option value="cs180">CS 180</option>
          <option value="math290">MATH 290</option>
          <option value="acc200">ACC 200</option>
          <option value="acc241">ACC 241</option>
          <option value="acc300">ACC 300</option>
          <option value="acc301">ACC 301</option>
          <option value="acc310">ACC 310</option>
          <option value="acc329">ACC 329</option>
          <option value="acc401">ACC 401</option>
          <option value="acc403">ACC 403</option>
          <option value="acc405">ACC 405</option>
          <option value="acc406">ACC 406</option>
        </select>
        <button type="button" className="btn btn-primary btn-block" onClick={goto}>
          GO
        </button>
      </div>
    </Layout>
  );
}
