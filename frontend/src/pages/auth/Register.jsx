import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { QRCodeSVG } from 'qrcode.react';
import { UserPlus, Copy, Check, Monitor, Camera } from 'lucide-react';

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
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 text-white p-4">
      <div className="w-full max-w-md p-10 flex flex-col items-center bg-gray-800 rounded-3xl shadow-2xl border border-gray-700">
        <h2 className="text-4xl font-extrabold text-center text-blue-500 tracking-wide mb-8">Voter Registration</h2>

        {error && (
          <div className="w-full p-3 mb-6 bg-red-900/50 border border-red-500 text-red-200 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleSubmit} className="w-full flex flex-col items-center space-y-6">
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-400 mb-2">Voter ID</label>
              <input
                type="text"
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-xl py-3 px-4 text-white text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="VOTER-123"
                value={formData.voter_id}
                onChange={(e) => setFormData({ ...formData, voter_id: e.target.value })}
              />
            </div>
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-400 mb-2">Password</label>
              <input
                type="password"
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-xl py-3 px-4 text-white text-center tracking-widest focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-400 mb-2">Admin Master Key <span className="text-gray-500 text-xs">(Optional)</span></label>
              <input
                type="password"
                className="w-full bg-gray-700 border border-gray-600 rounded-xl py-3 px-4 text-white text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Only for admin creation"
                value={formData.admin_key}
                onChange={(e) => setFormData({ ...formData, admin_key: e.target.value })}
              />
            </div>

            {/* Camera Section */}
            {!cameraActive && formData.admin_key !== 'STOV-ADMIN-MASTER-KEY' ? (
              <button 
                type="button"
                onClick={startCamera}
                className="w-full bg-gray-700 hover:bg-gray-600 border border-gray-500 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <Camera size={20} /> Enable Camera for Face Registration
              </button>
            ) : formData.admin_key !== 'STOV-ADMIN-MASTER-KEY' ? (
              <div className="flex flex-col items-center w-full bg-gray-800 p-4 rounded-xl border border-gray-600 relative">
                <p className="mb-4 text-sm text-gray-400 font-medium text-center">Position your face inside the dashed oval.</p>
                <div className="relative w-full max-w-sm mx-auto overflow-hidden rounded-lg border border-gray-600 bg-black aspect-video">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1/2 h-3/4 border-4 border-dashed border-blue-500/70 rounded-[50%] pointer-events-none z-10"></div>
                </div>
                <canvas ref={canvasRef} width="640" height="480" className="hidden" />
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isRegistering || (!cameraActive && formData.admin_key !== 'STOV-ADMIN-MASTER-KEY')}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-lg transition-all duration-200 active:scale-95 flex items-center justify-center gap-2"
            >
              {isRegistering ? 'Registering & Processing Face...' : <><UserPlus size={20} /> Register Account</>}
            </button>
            <div className="text-center text-sm text-gray-400 mt-6">
              Already have an account? <Link to="/login" className="text-blue-400 hover:underline">Login</Link>
            </div>
          </form>
        ) : (
          <div className="w-full flex flex-col items-center space-y-6">
            <div className="text-center">
              <div className="bg-white p-4 rounded-xl shadow-lg inline-block mb-4">
                <QRCodeSVG value={qrValue} size={180} />
              </div>
              <h3 className="text-xl font-bold text-emerald-400">Scan this QR Code</h3>
            </div>

            <div className="w-full bg-gray-700 p-4 rounded-xl border border-gray-600 relative text-center">
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Or use Manual Entry Code</p>
              <p className="font-mono text-xl font-bold text-amber-400 tracking-widest break-all">
                {manualKey}
              </p>
              <button 
                onClick={handleCopy}
                className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors p-2"
                title="Copy to clipboard"
              >
                {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} />}
              </button>
            </div>

            <div className="w-full text-sm text-gray-300 bg-gray-700/50 p-4 rounded-xl border border-gray-600">
              <div className="flex items-center gap-3">
                <Monitor size={18} className="text-blue-400 flex-shrink-0" />
                <span>No phone? Use a browser extension like <strong>Authenticator</strong> or a desktop app like <strong>WinAuth</strong>.</span>
              </div>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all duration-200 active:scale-95"
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
