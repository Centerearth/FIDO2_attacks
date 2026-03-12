import { createContext, useContext, useState, useEffect } from 'react';
import { getUser as getUserApi, logout as logoutApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Check if the user is already logged in (e.g., from a previous session)
    async function loadUser() {
      try {
        const data = await getUserApi();
        if (data) setUser(data);
      } catch (error) {
        console.error('Failed to fetch user on initial load', error);
      } finally {
        setAuthLoading(false);
      }
    }
    loadUser();
  }, []);

  // Called from login/register pages with the response from the API
  const login = (userData) => setUser(userData);

  // Called for a standard logout
  const logout = async () => {
    setUser(null);
    await logoutApi();
  };

  // Called when user state needs to be cleared without an API call (e.g., after account deletion)
  const clearUser = () => setUser(null);

  const value = { user, isAuthLoading, login, logout, clearUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
