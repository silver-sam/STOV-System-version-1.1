import { useState, useContext, useEffect, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate, Link } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import apiClient from '../../api/client';
import { Sun, Moon, Eye, EyeOff, LifeBuoy, X, Camera, Check } from 'lucide-react';

const Login = () => {
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1); // 1: Credentials, 2: MFA
  const [voterId, setVoterId] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [supportVoterId, setSupportVoterId] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportStatus, setSupportStatus] = useState('');
  const [supportError, setSupportError] = useState('');

  // New state for support camera
  const [supportCameraActive, setSupportCameraActive] = useState(false);
  const [supportIsVerifying, setSupportIsVerifying] = useState(false);
  const [supportFaceDetected, setSupportFaceDetected] = useState(false);
  const [supportHasBlinked, setSupportHasBlinked] = useState(false);
  const [supportFaceFeedback, setSupportFaceFeedback] = useState('Enable camera to verify your identity.');
  const supportVideoRef = useRef(null);
  const supportCanvasRef = useRef(null);
  const supportAutoDetectRef = useRef(false);

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

  const startSupportCamera = async () => {
    setSupportError('');
    setSupportHasBlinked(false);
    setSupportCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (supportVideoRef.current) {
        supportVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      setSupportError('Camera access denied. Please allow permission to continue.');
      setSupportCameraActive(false);
    }
  };

  const stopSupportCamera = () => {
    if (supportVideoRef.current && supportVideoRef.current.srcObject) {
      supportVideoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setSupportCameraActive(false);
  };

  // Stop camera when modal closes
  useEffect(() => {
    if (!isSupportOpen) {
        stopSupportCamera();
        setSupportVoterId('');
        setSupportMessage('');
        setSupportStatus('');
        setSupportError('');
        setSupportFaceDetected(false);
        setSupportHasBlinked(false);
        setSupportFaceFeedback('Enable camera to verify your identity.');
    }
  }, [isSupportOpen]);

  // Face polling for support modal
  useEffect(() => {
    let timeoutId;
    const pollFace = async () => {
        if (!supportVideoRef.current || !supportCameraActive || supportAutoDetectRef.current || supportIsVerifying) return;
        if (supportVideoRef.current.readyState !== 4) {
            timeoutId = setTimeout(pollFace, 500);
            return;
        }
        supportAutoDetectRef.current = true;

        const video = supportVideoRef.current;
        const canvas = supportCanvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = canvas.toDataURL('image/jpeg', 0.5);

        try {
            const res = await apiClient.post('/detect-face/', { image: frame });
            setSupportFaceDetected(res.data.detected);

            if (!res.data.detected) {
                setSupportFaceFeedback(res.data.detail || 'Scanning...');
                return;
            }

            if (!supportHasBlinked) {
                if (res.data.blinking) {
                    setSupportHasBlinked(true);
                    setSupportFaceFeedback('Liveness verified! You can now submit your request.');
                } else {
                    setSupportFaceFeedback('Face detected! Please BLINK to verify liveness.');
                }
            }
        } catch (err) {
            setSupportFaceDetected(false);
            setSupportFaceFeedback('Scanning stream...');
        } finally {
            supportAutoDetectRef.current = false;
            if (supportCameraActive && !supportIsVerifying && !supportHasBlinked) {
                timeoutId = setTimeout(pollFace, 300);
            }
        }
    };

    if (isSupportOpen && supportCameraActive) {
        supportAutoDetectRef.current = false;
        timeoutId = setTimeout(pollFace, 300);
    }

    return () => clearTimeout(timeoutId);
  }, [isSupportOpen, supportCameraActive, supportIsVerifying, supportHasBlinked]);

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    setSupportStatus('Verifying face and submitting...');
    setSupportError('');
    setSupportIsVerifying(true);

    let faceImageBase64 = null;
    if (supportVideoRef.current && supportCameraActive) {
        const video = supportVideoRef.current;
        const canvas = supportCanvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        faceImageBase64 = canvas.toDataURL('image/jpeg', 0.8);
    }

    if (!faceImageBase64) {
        setSupportError('Could not capture face image for verification.');
        setSupportIsVerifying(false);
        setSupportStatus('');
        return;
    }

    try {
      await apiClient.post('/support-tickets/', { 
          voter_id: supportVoterId, 
          message: supportMessage,
          face_image: faceImageBase64
      });
      setSupportStatus('Ticket submitted! The administrator will review it shortly.');
      stopSupportCamera();
      setTimeout(() => { 
        setIsSupportOpen(false);
      }, 3500);
    } catch (err) {
      setSupportStatus('');
      setSupportError(err.response?.data?.detail || 'Failed to submit ticket. Please try again.');
    } finally {
      setSupportIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-4 py-12 transition-colors duration-300">
      <button onClick={() => setIsDarkMode(!isDarkMode)} className="fixed top-6 right-6 z-50 p-2 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 transition shadow-sm">
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="w-full max-w-md p-10 flex flex-col items-center bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <h2 className="text-4xl font-extrabold text-center text-blue-600 dark:text-blue-500 tracking-wide mb-8">AegisElect</h2>
        
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
            <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6 space-y-4">
              <div>New voter? <Link to="/register" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">Register here</Link></div>
              <div>Forgot your password? <Link to="/forgot-password" className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">Reset it here</Link></div>
              <button type="button" onClick={() => setIsSupportOpen(true)} className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center justify-center gap-1.5"><LifeBuoy size={16}/> Need help? Contact Support</button>
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
              className="w-full mt-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm font-semibold"
            >
              Back to Login
            </button>
            <button
              type="button"
              onClick={() => setIsSupportOpen(true)}
              className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center justify-center gap-1.5 mt-2 text-sm"
            >
              <LifeBuoy size={16}/> Lost Authenticator App?
            </button>
          </form>
        )}

        {/* SUPPORT MODAL OVERLAY */}
        {isSupportOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md p-8 shadow-2xl relative border border-gray-200 dark:border-gray-700">
              <button onClick={() => setIsSupportOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <X size={24} />
              </button>
              <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white flex items-center gap-2">
                <LifeBuoy className="text-blue-500" /> Support
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium leading-relaxed">Locked out or lost your authenticator device? Submit a request to the administrator to securely wipe your old account.</p>
              <form onSubmit={handleSupportSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Your Voter ID</label>
                  <input type="text" required value={supportVoterId} onChange={e => setSupportVoterId(e.target.value)} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white font-mono" placeholder="e.g. Employee ID, National ID, or Student ID" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Message Details</label>
                  <textarea required value={supportMessage} onChange={e => setSupportMessage(e.target.value)} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white min-h-[100px] resize-y" placeholder="I broke my phone and need my MFA reset to register again..." />
                </div>

                {/* Camera Verification Section */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  {!supportCameraActive ? (
                    <button 
                      type="button"
                      onClick={startSupportCamera}
                      className="w-full font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white"
                    >
                      <Camera size={20} /> Enable Camera for Verification
                    </button>
                  ) : (
                    <div className="flex flex-col items-center w-full bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-600 relative">
                      <p className={`mb-4 text-sm font-medium text-center transition-colors duration-300 ${supportFaceDetected ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>{supportFaceFeedback}</p>
                      <div className={`relative w-full max-w-sm mx-auto overflow-hidden rounded-lg border-2 bg-black aspect-video transition-all duration-500 ${supportFaceDetected ? 'border-green-500 shadow-md' : 'border-gray-300 dark:border-gray-600'}`}>
                        <video ref={supportVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                        <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-3/4 aspect-square border-4 rounded-full pointer-events-none z-10 transition-all duration-500 ${supportFaceDetected ? 'border-solid border-green-500/80' : 'border-dashed border-blue-500/70 animate-pulse'}`}></div>
                      </div>
                      <canvas ref={supportCanvasRef} className="hidden" />
                    </div>
                  )}
                </div>

                <button 
                  type="submit" 
                  disabled={supportIsVerifying || !supportCameraActive || !supportFaceDetected || !supportHasBlinked}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {supportIsVerifying ? 'Processing...' : 'Verify Face & Submit Request'}
                </button>

                {supportStatus && <p className="text-center mt-4 text-sm font-bold text-blue-600 dark:text-blue-400 animate-pulse">{supportStatus}</p>}
                {supportError && <p className="text-center mt-4 text-sm font-bold text-red-600 dark:text-red-400">{supportError}</p>}
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
