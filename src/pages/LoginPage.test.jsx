/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './LoginPage';

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
  startAuthentication: jest.fn(),
}));

const { postAuthRequest } = require('../services/api.js');
const { startAuthentication } = require('@simplewebauthn/browser');

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe('LoginPage', () => {
  it('renders the email input, password input, and both buttons', () => {
    render(<LoginPage />);

    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with passkey' })).toBeInTheDocument();
  });

  it('does not show an error message on initial render', () => {
    render(<LoginPage />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error message when the API call fails', async () => {
    postAuthRequest.mockRejectedValue(new Error('Invalid credentials'));

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials')
    );
  });

  it('clears the error when the user types in the email field', async () => {
    postAuthRequest.mockRejectedValue(new Error('Fail'));

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'x@y.com' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the error when the user types in the password field', async () => {
    postAuthRequest.mockRejectedValue(new Error('Fail'));

    render(<LoginPage />);
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('calls login() and navigates home on successful password login', async () => {
    const userData = { email: 'a@b.com', name: 'Alice' };
    postAuthRequest.mockResolvedValue(userData);

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Sign in' }).closest('form'));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith(userData));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows an error when passkey button is clicked with no email', async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with passkey' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Please enter your email address first')
    );
    expect(postAuthRequest).not.toHaveBeenCalled();
  });

  it('shows an error when passkey authentication fails', async () => {
    postAuthRequest.mockResolvedValueOnce({ challenge: 'ch' });
    startAuthentication.mockRejectedValue(new Error('Authenticator cancelled'));

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with passkey' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Authenticator cancelled')
    );
  });

  it('calls login() and navigates home on successful passkey login', async () => {
    postAuthRequest
      .mockResolvedValueOnce({ challenge: 'ch' })
      .mockResolvedValueOnce({ verified: true, email: 'a@b.com', name: 'Alice' });
    startAuthentication.mockResolvedValue({ id: 'cred' });

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with passkey' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(mockLogin).toHaveBeenCalledWith({ email: 'a@b.com', name: 'Alice' });
  });

  it('navigates to sign-up when the Sign up button is clicked', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(mockNavigate).toHaveBeenCalledWith('/sign-up');
  });
});
