/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import AccountPage from './AccountPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

const mockClearUser = jest.fn();
const mockUser = { email: 'a@b.com', name: 'Alice' };
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, clearUser: mockClearUser }),
}));

jest.mock('../components/Layout', () => function Layout({ children }) { return children; });

jest.mock('../services/api', () => ({
  postAuthRequest: jest.fn(),
  getPasskeys: jest.fn(),
  deletePasskey: jest.fn(),
  deleteAccount: jest.fn(),
  updatePassword: jest.fn(),
}));

jest.mock('@simplewebauthn/browser', () => ({
  startRegistration: jest.fn(),
}));

const api = require('../services/api');
const { startRegistration } = require('@simplewebauthn/browser');

beforeEach(() => {
  jest.clearAllMocks();
  api.getPasskeys.mockResolvedValue([]);
});

// Wait for the useEffect → getPasskeys() → setPasskeys() cycle to settle.
async function renderPage() {
  render(<AccountPage />);
  await act(async () => {});
}

// ---------------------------------------------------------------------------

describe('AccountPage — authenticated', () => {
  it('displays the user name and email', async () => {
    await renderPage();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it('shows "no passkeys" message when the list is empty', async () => {
    await renderPage();
    expect(screen.getByText(/no passkeys registered/i)).toBeInTheDocument();
  });

  it('renders each passkey in the list', async () => {
    api.getPasskeys.mockResolvedValue([
      { credentialID: 'abc123', transports: ['usb'], created_at: new Date('2024-01-01') },
    ]);

    await renderPage();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe('AccountPage — update password', () => {
  it('shows a success message on successful password update', async () => {
    api.updatePassword.mockResolvedValue();

    await renderPage();
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newSecret' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Update Password' }).closest('form'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Password updated successfully')
    );
    expect(api.updatePassword).toHaveBeenCalledWith('newSecret');
  });

  it('shows an error message when password update fails', async () => {
    api.updatePassword.mockRejectedValue(new Error('Password too weak'));

    await renderPage();
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'weak' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Update Password' }).closest('form'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Password too weak')
    );
  });

  it('clears the password message when the user types in the password field', async () => {
    api.updatePassword.mockRejectedValue(new Error('Fail'));

    await renderPage();
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'old' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Update Password' }).closest('form'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'new' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe('AccountPage — delete account', () => {
  it('opens a confirmation modal when Delete Account is clicked', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('does not delete when the modal is cancelled', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(api.deleteAccount).not.toHaveBeenCalled();
  });

  it('calls deleteAccount, clears user, and navigates home on confirm', async () => {
    api.deleteAccount.mockResolvedValue();

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(mockClearUser).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});

// ---------------------------------------------------------------------------

describe('AccountPage — delete passkey', () => {
  it('opens a confirmation modal when a passkey Delete button is clicked', async () => {
    api.getPasskeys.mockResolvedValue([
      { credentialID: 'pk-1', transports: ['usb'], created_at: new Date('2024-01-01') },
    ]);

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByText('Delete Passkey')).toBeInTheDocument();
  });

  it('calls deletePasskey and reloads the list on confirm', async () => {
    api.getPasskeys.mockResolvedValue([
      { credentialID: 'pk-1', transports: ['usb'], created_at: new Date('2024-01-01') },
    ]);
    api.deletePasskey.mockResolvedValue();

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(api.deletePasskey).toHaveBeenCalledWith('pk-1'));
  });
});

// ---------------------------------------------------------------------------

describe('AccountPage — add passkey', () => {
  it('shows an info modal on successful passkey registration', async () => {
    api.postAuthRequest
      .mockResolvedValueOnce({ challenge: 'ch' })
      .mockResolvedValueOnce({ verified: true });
    startRegistration.mockResolvedValue({ id: 'new-cred' });

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }));

    await waitFor(() =>
      expect(screen.getByText('Passkey Added')).toBeInTheDocument()
    );
  });

  it('shows an error modal when passkey registration fails', async () => {
    api.postAuthRequest.mockResolvedValueOnce({ challenge: 'ch' });
    startRegistration.mockRejectedValue(new Error('Device not supported'));

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }));

    await waitFor(() =>
      expect(screen.getByText(/Device not supported/i)).toBeInTheDocument()
    );
  });
});
