import { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import AuthContext from '../context/AuthContext';

const ProtectedRoute = ({ adminOnly = false }) => {
  const { token, isAdmin, loading } = useContext(AuthContext);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
  }

  // If not logged in, kick them to login page
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // If page is Admin Only but user is NOT admin, kick them to dashboard
  if (adminOnly && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Otherwise, let them pass
  return <Outlet />;
};

export default ProtectedRoute;
