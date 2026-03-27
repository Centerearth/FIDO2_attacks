/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignUpPage from './SignUpPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockLogin = jest.fn();
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

jest.mock('../components/Layout', () => function Layout({ children }) { return children; });

jest.mock('../services/api.js', () => ({
  postAuthRequest: jest.fn(),
}));

jest.mock('@simplewebauthn/browser', () => ({
  startRegistration: jest.fn(),
}));

const { postAuthRequest } = require('../services/api.js');
const { startRegistration } = require('@simplewebauthn/browser');

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe('SignUpPage', () => {
  it('renders name, email, password inputs and both buttons', () => {
    render(<SignUpPage />);

    expect(screen.getByLabelText('Your Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign up with passkey' })).toBeInTheDocument();
  });

  it('does not show an error message on initial render', () => {
    render(<SignUpPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error when password is shorter than 8 characters', async () => {
    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Register' }).closest('form'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('at least 8 characters')
    );
    expect(postAuthRequest).not.toHaveBeenCalled();
  });

  it('shows an error when the API call fails', async () => {
    postAuthRequest.mockRejectedValue(new Error('Email already in use'));

    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longpassword' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Register' }).closest('form'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Email already in use')
    );
  });

  it('clears the error when the user types in the name field', async () => {
    postAuthRequest.mockRejectedValue(new Error('Fail'));

    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longpassword' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Register' }).closest('form'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alice' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the error when the user types in the email field', async () => {
    postAuthRequest.mockRejectedValue(new Error('Fail'));

    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longpassword' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Register' }).closest('form'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.com' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('calls login() and navigates home on successful registration', async () => {
    const userData = { email: 'a@b.com', name: 'Alice' };
    postAuthRequest.mockResolvedValue(userData);

    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'longpassword' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Register' }).closest('form'));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith(userData));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows an error when passkey button is clicked with no email or name', async () => {
    render(<SignUpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign up with passkey' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Please enter your email address and name first')
    );
    expect(postAuthRequest).not.toHaveBeenCalled();
  });

  it('shows an error when passkey registration fails', async () => {
    postAuthRequest.mockResolvedValueOnce({ challenge: 'ch' });
    startRegistration.mockRejectedValue(new Error('Authenticator cancelled'));

    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up with passkey' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Authenticator cancelled')
    );
  });

  it('calls login() and navigates home on successful passkey sign-up', async () => {
    postAuthRequest
      .mockResolvedValueOnce({ challenge: 'ch' })
      .mockResolvedValueOnce({ verified: true, email: 'a@b.com', name: 'Alice' });
    startRegistration.mockResolvedValue({ id: 'cred' });

    render(<SignUpPage />);
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign up with passkey' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(mockLogin).toHaveBeenCalledWith({ email: 'a@b.com', name: 'Alice' });
  });

  it('navigates to login when the Login button is clicked', () => {
    render(<SignUpPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
