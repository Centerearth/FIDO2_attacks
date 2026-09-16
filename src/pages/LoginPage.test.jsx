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
  browserSupportsWebAuthnAutofill: jest.fn(),
}));

const { postAuthRequest } = require('../services/api.js');
const { startAuthentication, browserSupportsWebAuthnAutofill } = require('@simplewebauthn/browser');

beforeEach(() => {
  jest.clearAllMocks();
  // Default: no conditional UI, so each test drives the flow it is testing.
  browserSupportsWebAuthnAutofill.mockResolvedValue(false);
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

  it('signs in with a passkey and no email at all', async () => {
    postAuthRequest
      .mockResolvedValueOnce({ challenge: 'ch' })
      .mockResolvedValueOnce({ verified: true, email: 'a@b.com', name: 'Alice' });
    startAuthentication.mockResolvedValue({ id: 'cred' });

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with passkey' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    // No email typed, so none is sent: the credential identifies the account.
    expect(postAuthRequest).toHaveBeenNthCalledWith(1, '/api/auth/authentication-options', {});
    expect(postAuthRequest).toHaveBeenNthCalledWith(2, '/api/auth/authentication-verify', {
      response: { id: 'cred' },
    });
    expect(mockLogin).toHaveBeenCalledWith({ email: 'a@b.com', name: 'Alice' });
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

  // A typed email still narrows the ceremony, which keeps any older
  // non-discoverable passkey working.
  it('sends the email when the user typed one', async () => {
    postAuthRequest
      .mockResolvedValueOnce({ challenge: 'ch' })
      .mockResolvedValueOnce({ verified: true, email: 'a@b.com', name: 'Alice' });
    startAuthentication.mockResolvedValue({ id: 'cred' });

    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with passkey' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
    expect(postAuthRequest).toHaveBeenNthCalledWith(1, '/api/auth/authentication-options', { email: 'a@b.com' });
    expect(postAuthRequest).toHaveBeenNthCalledWith(2, '/api/auth/authentication-verify', {
      email: 'a@b.com',
      response: { id: 'cred' },
    });
  });

  it('marks the email field so browsers can offer passkeys in autofill', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'username webauthn');
  });

  it('navigates to sign-up when the Sign up button is clicked', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(mockNavigate).toHaveBeenCalledWith('/sign-up');
  });
});

// ---------------------------------------------------------------------------

describe('LoginPage — browser autofill (conditional UI)', () => {
  it('offers passkeys through autofill when the browser supports it', async () => {
    browserSupportsWebAuthnAutofill.mockResolvedValue(true);
    postAuthRequest
      .mockResolvedValueOnce({ challenge: 'ch' })
      .mockResolvedValueOnce({ verified: true, email: 'a@b.com', name: 'Alice' });
    startAuthentication.mockResolvedValue({ id: 'cred' });

    render(<LoginPage />);

    await waitFor(() => expect(startAuthentication).toHaveBeenCalled());
    expect(startAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({ useBrowserAutofill: true })
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'));
  });

  it('does not start a ceremony when the browser cannot do autofill', async () => {
    browserSupportsWebAuthnAutofill.mockResolvedValue(false);

    render(<LoginPage />);
    await waitFor(() => expect(browserSupportsWebAuthnAutofill).toHaveBeenCalled());

    expect(startAuthentication).not.toHaveBeenCalled();
  });

  // The autofill ceremony is a background offer. If the user ignores it, or it
  // is superseded by the button, that must not surface as an error.
  it('stays silent when the autofill ceremony fails', async () => {
    browserSupportsWebAuthnAutofill.mockResolvedValue(true);
    postAuthRequest.mockResolvedValueOnce({ challenge: 'ch' });
    startAuthentication.mockRejectedValue(new Error('AbortError'));

    render(<LoginPage />);
    await waitFor(() => expect(startAuthentication).toHaveBeenCalled());

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
