import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  const value = {
    user,
    setUser,
    async login(username, password) {
      const d = await api('/auth/login', { method: 'POST', body: { username, password } });
      setUser(d.user);
      return d.user;
    },
    async logout() {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
