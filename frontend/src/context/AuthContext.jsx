import { createContext, useState, useEffect, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('access_token'));
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (token) {
      try {
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

  // Auto-logout after 15 minutes of inactivity
  useEffect(() => {
    let intervalId;
    const events = ['mousemove', 'keydown', 'scroll', 'touchstart'];
    
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    if (token) {
      lastActivityRef.current = Date.now(); // Reset on login
      events.forEach(event => window.addEventListener(event, updateActivity, { passive: true }));
      
      intervalId = setInterval(() => {
        if (Date.now() - lastActivityRef.current >= 15 * 60 * 1000) {
          logout();
        }
      }, 10000); // Check every 10 seconds
    }

    return () => {
      events.forEach(event => window.removeEventListener(event, updateActivity));
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, user, isAdmin, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;