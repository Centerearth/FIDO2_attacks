import { createBrowserRouter } from 'react-router-dom';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import ReviewMakerPage from './pages/ReviewMakerPage';
import ClassReviewPage from './pages/ClassReviewPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/about',
    element: <AboutPage />,
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/sign-up',
    element: <SignUpPage />,
  },
  {
    path: '/review-maker',
    element: <ReviewMakerPage />,
  },
  {
    path: '/:classNum',
    element: <ClassReviewPage />,
  },
]);

export default router;
