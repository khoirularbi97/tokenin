import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));
  const [hasToken, setHasToken] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    setHasToken(false);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch((err) => {
        if (err.status === 401) logout();
      })
      .finally(() => setChecking(false));
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setHasToken(true);
    setUser(data.user);
  }, []);

  const value = useMemo(
    () => ({ user, checking, loggedIn: hasToken, login, logout }),
    [user, checking, hasToken, login, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
