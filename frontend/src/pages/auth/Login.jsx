import { useState, useContext, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate, Link } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Sun, Moon, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1); // 1: Credentials, 2: MFA
  const [voterId, setVoterId] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') !== 'light');
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // Step 1: Verify ID and Password
      await apiClient.post('/login/', { voter_id: voterId, password });
      setStep(2); // Move to MFA step
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // Step 2: Verify MFA Code
      const response = await apiClient.post('/verify-mfa/', { 
        voter_id: voterId, 
        mfa_code: mfaCode 
      });
      
      // Save token and redirect
      login(response.data.access_token);
      
      // Check if admin and redirect accordingly
      const decoded = jwtDecode(response.data.access_token);
      if (decoded.is_admin) {
        navigate('/admin');
      } else {
        navigate('/dashboard'); 
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid MFA Code');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-4 py-12 transition-colors duration-300">
      <button onClick={() => setIsDarkMode(!isDarkMode)} className="fixed top-6 right-6 z-50 p-2 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 transition shadow-sm">
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="w-full max-w-md p-10 flex flex-col items-center bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <h2 className="text-4xl font-extrabold text-center text-blue-600 dark:text-blue-500 tracking-wide mb-8">STOV Voting</h2>
        
        {error && (
          <div className="w-full p-3 mb-6 bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-200 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleCredentialsSubmit} className="w-full flex flex-col items-center space-y-6">
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Voter ID</label>
              <input
                type="text"
                required
                className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="VOTER-123"
                value={voterId}
                onChange={(e) => setVoterId(e.target.value)}
              />
            </div>
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-10 text-gray-900 dark:text-white text-center tracking-widest focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all duration-200 active:scale-95"
            >
              Next
            </button>
            <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
              New voter? <Link to="/register" className="text-blue-600 dark:text-blue-400 hover:underline">Register here</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit} className="w-full flex flex-col items-center space-y-6">
            <div className="text-center mb-4">
              <p className="text-gray-600 dark:text-gray-400">Enter the 6-digit code from your authenticator app.</p>
            </div>
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">MFA Code</label>
              <input
                type="text"
                required
                maxLength="6"
                className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 transition-all duration-300 outline-none tracking-[0.75em] text-center text-2xl font-mono font-bold"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all duration-200 active:scale-95"
            >
              Verify & Login
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm"
            >
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
