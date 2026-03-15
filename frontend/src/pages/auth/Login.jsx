import { useState, useContext } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate, Link } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Lock, User, KeyRound } from 'lucide-react';

const Login = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1); // 1: Credentials, 2: MFA
  const [voterId, setVoterId] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');

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
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
        <h2 className="text-3xl font-bold text-center text-blue-500">STOV Voting</h2>
        
        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500 text-red-200 rounded text-sm text-center">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Voter ID</label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                <input
                  type="text"
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2.5 pl-10 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="VOTER-123"
                  value={voterId}
                  onChange={(e) => setVoterId(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                <input
                  type="password"
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2.5 pl-10 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition duration-200"
            >
              Next
            </button>
            <div className="text-center text-sm text-gray-400 mt-4">
              New voter? <Link to="/register" className="text-blue-400 hover:underline">Register here</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit} className="space-y-4">
            <div className="text-center mb-4">
              <p className="text-gray-400">Enter the 6-digit code from your authenticator app.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">MFA Code</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                <input
                  type="text"
                  required
                  maxLength="6"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2.5 pl-10 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent tracking-widest text-center text-xl"
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition duration-200"
            >
              Verify & Login
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full text-gray-400 hover:text-white text-sm"
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
