import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { QRCodeSVG } from 'qrcode.react';
import { UserPlus, Lock, User, Copy, Check, Monitor, Smartphone, Key } from 'lucide-react';

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Register Form, 2: QR Code
  const [formData, setFormData] = useState({ voter_id: '', password: '', invite_code: '' });
  const [qrValue, setQrValue] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const response = await apiClient.post('/voters/', formData);
      // The backend returns the URI for the authenticator app
      setQrValue(response.data.mfa_qr_uri);
      setManualKey(response.data.mfa_setup_key);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(manualKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
        <h2 className="text-3xl font-bold text-center text-blue-500">Voter Registration</h2>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500 text-red-200 rounded text-sm text-center">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Voter ID</label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                <input
                  type="text"
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2.5 pl-10 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="VOTER-123"
                  value={formData.voter_id}
                  onChange={(e) => setFormData({ ...formData, voter_id: e.target.value })}
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
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Election Invite Code</label>
              <div className="relative">
                <Key className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                <input
                  type="text"
                  required
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2.5 pl-10 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="STOV-2024-..."
                  value={formData.invite_code}
                  onChange={(e) => setFormData({ ...formData, invite_code: e.target.value })}
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition duration-200 flex items-center justify-center gap-2"
            >
              <UserPlus size={20} /> Register
            </button>
            <div className="text-center text-sm text-gray-400">
              Already have an account? <Link to="/login" className="text-blue-400 hover:underline">Login</Link>
            </div>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <div className="bg-white p-4 rounded-lg inline-block mb-4">
                <QRCodeSVG value={qrValue} size={180} />
              </div>
              <h3 className="text-xl font-semibold text-green-400">Scan this QR Code</h3>
            </div>

            <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600 relative">
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Manual Entry Code</p>
              <p className="font-mono text-lg text-yellow-400 tracking-widest break-all pr-8">
                {manualKey}
              </p>
              <button 
                onClick={handleCopy}
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                title="Copy to clipboard"
              >
                {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} />}
              </button>
            </div>

            <div className="space-y-3 text-sm text-gray-300 bg-gray-800/50 p-3 rounded border border-gray-700">
              <div className="flex items-center gap-3">
                <Monitor size={18} className="text-blue-400 flex-shrink-0" />
                <span>No phone? Use a browser extension like <strong>Authenticator</strong> or a desktop app like <strong>WinAuth</strong>.</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition duration-200"
            >
              Proceed to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Register;
