import { createContext, useState, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('access_token'));
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      try {
        // Decode the JWT to read the data we just added in the backend
        const decoded = jwtDecode(token);
        setUser({ id: decoded.sub });
        setIsAdmin(decoded.is_admin || false);
      } catch (error) {
        console.error("Invalid token", error);
        logout();
      }
    }
    setLoading(false);
  }, [token]);

  const login = (newToken) => {
    localStorage.setItem('access_token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setToken(null);
    setUser(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider value={{ token, user, isAdmin, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;