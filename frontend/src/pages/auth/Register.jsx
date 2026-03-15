import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { QRCodeSVG } from 'qrcode.react';
import { UserPlus, Lock, User, Copy, Check, Monitor, Camera } from 'lucide-react';

const Register = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Register Form, 2: QR Code
  const [formData, setFormData] = useState({ voter_id: '', password: '', admin_key: '' });
  const [qrValue, setQrValue] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const startCamera = async () => {
    setError('');
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError('Camera access denied. Please allow permissions.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!videoRef.current && formData.admin_key !== 'STOV-ADMIN-MASTER-KEY') {
      setError('Camera is required for face registration.');
      return;
    }
    
    setIsRegistering(true);
    setError('');
    
    let faceImageBase64 = null;
    if (videoRef.current && cameraActive) {
        const context = canvasRef.current.getContext('2d');
        context.drawImage(videoRef.current, 0, 0, 640, 480);
        faceImageBase64 = canvasRef.current.toDataURL('image/jpeg');
    }

    try {
      const payload = {
        voter_id: formData.voter_id,
        password: formData.password,
        face_image: faceImageBase64,
        admin_key: formData.admin_key || null
      };

      const response = await apiClient.post('/voters/', payload);
      // The backend returns the URI for the authenticator app
      setQrValue(response.data.mfa_qr_uri);
      setManualKey(response.data.mfa_setup_key);
      stopCamera();
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setIsRegistering(false);
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
              <label className="block text-sm font-medium text-gray-400 mb-1">Admin Master Key (Optional for voters)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                <input
                  type="password"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2.5 pl-10 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Only for admin creation"
                  value={formData.admin_key}
                  onChange={(e) => setFormData({ ...formData, admin_key: e.target.value })}
                />
              </div>
            </div>

            {/* Camera Section */}
            {!cameraActive && formData.admin_key !== 'STOV-ADMIN-MASTER-KEY' ? (
              <button 
                type="button"
                onClick={startCamera}
                className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
              >
                <Camera size={20} /> Enable Camera for Face Registration
              </button>
            ) : formData.admin_key !== 'STOV-ADMIN-MASTER-KEY' ? (
              <div className="flex flex-col items-center bg-gray-900 p-4 rounded-lg border border-gray-700 relative">
                <p className="mb-2 text-sm text-gray-300 font-medium">Position your face inside the dashed oval.</p>
                <div className="relative w-full max-w-sm">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg border border-gray-600 bg-black transform scale-x-[-1]" />
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1/2 h-3/4 border-4 border-dashed border-blue-500/70 rounded-[50%] pointer-events-none z-10"></div>
                </div>
                <canvas ref={canvasRef} width="640" height="480" className="hidden" />
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isRegistering || (!cameraActive && formData.admin_key !== 'STOV-ADMIN-MASTER-KEY')}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition duration-200 flex items-center justify-center gap-2"
            >
              {isRegistering ? 'Registering & Processing Face...' : <><UserPlus size={20} /> Register Account</>}
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
