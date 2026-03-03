import React from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { postReview } from '../services/api.js';

export default function ReviewMakerPage() {
    const navigate = useNavigate();
    const [userName, setUserName] = React.useState('');
    const [grade, setGrade] = React.useState('A');
    const [classNum, setClassNum] = React.useState('cs260');
    const [reviewContent, setReviewContent] = React.useState('');

    async function saveReview() {
        const date = new Date().toLocaleDateString();
        const newReview = { name: userName, grade: grade, date: date, class: classNum, review: reviewContent };
        const reviews = await postReview(classNum, newReview);
        localStorage.setItem('reviews', JSON.stringify(reviews));
        navigate(`/${classNum}`);
    }

    return (
        <Layout>
            <div className="col-lg-12 col-xl-11">
                <hr style={{ visibility: 'hidden' }} />
                <form id="reviewForm">
                    <div className="form-group">
                        <label htmlFor="nameId">First Name</label>
                        <input
                            type="text"
                            className="form-control"
                            id="nameId"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                        />
                    </div>
                    <hr />
                    <div className="form-group">
                        <label htmlFor="gradeId">Please Select Your Grade</label>
                        <select className="form-control" id="gradeId" value={grade} onChange={(e) => setGrade(e.target.value)}>
                            <option>A</option>
                            <option>A-</option>
                            <option>B+</option>
                            <option>B</option>
                            <option>B-</option>
                            <option>C+</option>
                            <option>C</option>
                            <option>C-</option>
                            <option>D+</option>
                            <option>D</option>
                            <option>D-</option>
                            <option>F</option>
                        </select>
                    </div>
                    <hr />
                    <div className="form-group">
                        <label htmlFor="classId">Please Select the Class</label>
                        <select className="form-control" id="classId" value={classNum} onChange={(e) => setClassNum(e.target.value)}>
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
                    </div>
                    <hr />
                    <div className="form-group">
                        <label htmlFor="reviewId">Leave Your Review Here</label>
                        <textarea
                            className="form-control"
                            id="reviewId"
                            rows="4"
                            value={reviewContent}
                            onChange={(e) => setReviewContent(e.target.value)}
                        ></textarea>
                    </div>
                    <hr />
                    <button type="button" className="btn btn-primary btn-block mb-4" onClick={saveReview}>
                        Submit
                    </button>
                </form>
            </div>
        </Layout>
    );
}
