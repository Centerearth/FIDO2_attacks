import React from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import classDescriptions from '../data/class-descriptions.json';

export default function ClassReviewPage() {
  const { classNum } = useParams();
  const [reviews, setReviews] = React.useState([]);
  const description = classDescriptions[classNum];
  const userName = localStorage.getItem('userName');

  React.useEffect(() => {
    async function loadReviews() {
      let reviewsData = [];
      try {
        const response = await fetch(`/api/review/${classNum}`);
        reviewsData = await response.json();
        localStorage.setItem(`reviews-${classNum}`, JSON.stringify(reviewsData));
      } catch (error) {
        console.log(error);
        const reviewsText = localStorage.getItem(`reviews-${classNum}`);
        if (reviewsText) {
          reviewsData = JSON.parse(reviewsText);
        }
      }
      setReviews(reviewsData);
    }
    loadReviews();
  }, [classNum]);

  return (
    <Layout>
      <div className="pt-4">
        <div className="row">
          <div className="col">
            <div className="card" style={{ width: '20rem' }}>
              <div className="card-body">
                <h5 className="card-title text-center">{classNum.toUpperCase()}</h5>
                <p className="card-text">{description}</p>
              </div>
            </div>
          </div>
          <div className="col">
            <div className="card" style={{ width: '50rem' }}>
              <div className="card-header">{classNum.toUpperCase()}</div>
              <div className="card-body">
                {/* Add overall rating here */}
              </div>
            </div>
          </div>
        </div>
        <div className="container-fluid text-center mt-4">
          <table className="table table-striped-columns">
            <thead className="table-primary">
              <tr>
                <th>Name</th>
                <th>Grade</th>
                <th>Date</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody id="reviewTable">
              {reviews.length > 0 ? (
                reviews.map((review, i) => (
                  <tr key={i}>
                    <td>{review.name}</td>
                    <td>{review.grade}</td>
                    <td>{review.date}</td>
                    <td>{review.review}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4">{userName ? 'No reviews posted yet.' : 'Please login to read and post reviews!'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
