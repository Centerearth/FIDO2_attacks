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
  renamePasskey: jest.fn(),
  deleteAccount: jest.fn(),
  updatePassword: jest.fn(),
  getReauthStatus: jest.fn(),
  getReauthOptions: jest.fn(),
  verifyReauth: jest.fn(),
  reauthWithPassword: jest.fn(),
}));

jest.mock('@simplewebauthn/browser', () => ({
  startRegistration: jest.fn(),
  startAuthentication: jest.fn(),
}));

const api = require('../services/api');
const { startRegistration, startAuthentication } = require('@simplewebauthn/browser');

/** Mirrors the ApiError the real api module throws for a 403 reauth gate. */
function reauthError(operation = 'delete-passkey') {
  const err = new Error('Please confirm it is you before continuing.');
  err.status = 403;
  err.reauthRequired = true;
  err.operation = operation;
  return err;
}

const PASSKEY = {
  credentialID: 'pk-1',
  name: 'Apple Passwords',
  transports: ['internal'],
  created_at: new Date('2024-01-01'),
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getPasskeys.mockResolvedValue([]);
  api.getReauthStatus.mockResolvedValue({
    reauthenticated: false,
    methods: { password: true, passkey: true },
    gatedOperations: ['delete-passkey'],
  });
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

  it('renders each passkey by its authenticator name', async () => {
    api.getPasskeys.mockResolvedValue([
      { credentialID: 'abc123', name: 'YubiKey 5 Series', transports: ['usb'], created_at: new Date('2024-01-01') },
    ]);

    await renderPage();
    expect(screen.getByText('YubiKey 5 Series')).toBeInTheDocument();
    // The raw credential ID stays visible so passkeys can be matched to logs.
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
    api.updatePassword.mockRejectedValue(new Error('Password must be at least 8 characters long.'));

    await renderPage();
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'weak' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Update Password' }).closest('form'));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters long.')
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
    api.getPasskeys.mockResolvedValue([PASSKEY]);

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));

    expect(screen.getByText('Delete Passkey')).toBeInTheDocument();
  });

  it('calls deletePasskey and reloads the list on confirm', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);
    api.deletePasskey.mockResolvedValue();

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));
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

// ---------------------------------------------------------------------------

describe('AccountPage — rename passkey', () => {
  it('shows an editable field pre-filled with the current name', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Rename Apple Passwords/ }));

    expect(screen.getByLabelText('Passkey name')).toHaveValue('Apple Passwords');
  });

  it('saves the new name and reloads the list', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);
    api.renamePasskey.mockResolvedValue({ credentialID: 'pk-1', name: 'Work Key' });

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Rename Apple Passwords/ }));
    fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: 'Work Key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.renamePasskey).toHaveBeenCalledWith('pk-1', 'Work Key'));
  });

  it('refuses to save an empty name', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Rename Apple Passwords/ }));
    fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByText(/cannot be empty/i)).toBeInTheDocument());
    expect(api.renamePasskey).not.toHaveBeenCalled();
  });

  it('leaves the name alone when the edit is cancelled', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Rename Apple Passwords/ }));
    fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: 'Discarded' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(api.renamePasskey).not.toHaveBeenCalled();
    expect(screen.getByText('Apple Passwords')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------

describe('AccountPage — reauthentication', () => {
  it('prompts instead of failing when the server asks for reauthentication', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);
    api.deletePasskey.mockRejectedValue(reauthError());

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.getByText("Confirm it's you")).toBeInTheDocument());
    expect(screen.getByText(/before you delete this passkey/i)).toBeInTheDocument();
  });

  it('replays the operation once the user reauthenticates with a password', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);
    api.deletePasskey
      .mockRejectedValueOnce(reauthError())
      .mockResolvedValueOnce();
    api.reauthWithPassword.mockResolvedValue({ reauthenticated: true });

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByLabelText('Password')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm with password' }));

    await waitFor(() => expect(api.deletePasskey).toHaveBeenCalledTimes(2));
    expect(api.reauthWithPassword).toHaveBeenCalledWith('secret123');
  });

  it('replays the operation after a passkey reauthentication', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);
    api.deletePasskey
      .mockRejectedValueOnce(reauthError())
      .mockResolvedValueOnce();
    api.getReauthOptions.mockResolvedValue({ challenge: 'ch' });
    startAuthentication.mockResolvedValue({ id: 'cred' });
    api.verifyReauth.mockResolvedValue({ reauthenticated: true });

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm with passkey' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Confirm with passkey' }));

    await waitFor(() => expect(api.deletePasskey).toHaveBeenCalledTimes(2));
  });

  it('reports a failed reauthentication and does not replay the operation', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);
    api.deletePasskey.mockRejectedValue(reauthError());
    api.reauthWithPassword.mockRejectedValue(new Error('Incorrect password.'));

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByLabelText('Password')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm with password' }));

    await waitFor(() => expect(screen.getByText('Incorrect password.')).toBeInTheDocument());
    expect(api.deletePasskey).toHaveBeenCalledTimes(1);
  });

  it('only offers the methods the account has', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);
    api.deletePasskey.mockRejectedValue(reauthError());
    api.getReauthStatus.mockResolvedValue({
      reauthenticated: false,
      methods: { password: false, passkey: true },
      gatedOperations: ['delete-passkey'],
    });

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm with passkey' })).toBeInTheDocument());
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('prompts before adding a passkey and does not start the ceremony first', async () => {
    api.postAuthRequest.mockRejectedValue(reauthError('add-passkey'));

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Add passkey' }));

    await waitFor(() => expect(screen.getByText("Confirm it's you")).toBeInTheDocument());
    // The browser must not be asked to create a credential that the server
    // would then reject.
    expect(startRegistration).not.toHaveBeenCalled();
  });

  it('abandons the operation when the prompt is cancelled', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);
    api.deletePasskey.mockRejectedValue(reauthError());

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(screen.getByText("Confirm it's you")).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    await waitFor(() => expect(screen.queryByText("Confirm it's you")).not.toBeInTheDocument());
    expect(api.deletePasskey).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------

describe('AccountPage — leftover credential notice', () => {
  // A website cannot remove a credential from an authenticator, so the user has
  // to be told to clean it up where it actually lives.
  it('warns in the confirmation that a copy stays on the device', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));

    expect(screen.getByText(/copy stays on your device or password manager/i)).toBeInTheDocument();
  });

  it('tells the user where to delete it after a successful deletion', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);
    api.deletePasskey.mockResolvedValue();

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.getByText('Passkey Deleted')).toBeInTheDocument());
    expect(screen.getByText(/still saved in your password manager or device settings/i)).toBeInTheDocument();
    expect(screen.getByText(/Google Password Manager/)).toBeInTheDocument();
  });

  it('does not claim success when the deletion failed', async () => {
    api.getPasskeys.mockResolvedValue([PASSKEY]);
    api.deletePasskey.mockRejectedValue(new Error('Passkey not found.'));

    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Delete Apple Passwords/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.getByText('Passkey not found.')).toBeInTheDocument());
    expect(screen.queryByText('Passkey Deleted')).not.toBeInTheDocument();
  });
});
