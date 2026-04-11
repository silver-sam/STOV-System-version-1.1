import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/client';
import { Sun, Moon, Camera, Check, Eye, EyeOff } from 'lucide-react';

const ForgotPassword = () => {
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1); // 1: Verify Identity, 2: Reset Password
  const [searchParams] = useSearchParams();
  const [voterId, setVoterId] = useState('');
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [hasBlinked, setHasBlinked] = useState(false);
  const [capturedFace, setCapturedFace] = useState(null);
  const [faceFeedback, setFaceFeedback] = useState('Enable camera to verify your identity.');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const autoDetectRef = useRef(false);

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

  // NEW: Check for token in URL on component load
  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    if (tokenFromUrl) {
      setResetToken(tokenFromUrl);
      setStep(2);
    }
  }, [searchParams]);

  const startCamera = async () => {
    setError('');
    setHasBlinked(false);
    setCapturedFace(null);
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError('Camera access denied. Please allow permission to continue.');
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

  // Face polling
  useEffect(() => {
    let timeoutId;
    const pollFace = async () => {
        if (!videoRef.current || !cameraActive || autoDetectRef.current || isVerifying || capturedFace) return;
        if (videoRef.current.readyState !== 4) {
            timeoutId = setTimeout(pollFace, 500);
            return;
        }
        autoDetectRef.current = true;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        let targetWidth = video.videoWidth;
        let targetHeight = video.videoHeight;
        const maxDim = 640;
        
        if (Math.max(targetWidth, targetHeight) > maxDim) {
          const scale = maxDim / Math.max(targetWidth, targetHeight);
          targetWidth = Math.round(targetWidth * scale);
          targetHeight = Math.round(targetHeight * scale);
        }
        
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, targetWidth, targetHeight);
        const frame = canvas.toDataURL('image/jpeg', 0.5);

        try {
            const res = await apiClient.post('/detect-face/', { image: frame });
            setFaceDetected(res.data.detected);

            if (!res.data.detected) {
                setFaceFeedback(res.data.detail || 'Scanning...');
                return;
            }

            if (!hasBlinked) {
                if (res.data.blinking) {
                    setHasBlinked(true);
                    setFaceFeedback('Liveness verified! You can now verify your identity.');
                } else {
                    setFaceFeedback('Face detected! Please BLINK to verify liveness.');
                }
            }
        } catch (err) {
            console.error("Face detection poll failed:", err);
            const detail = err.response?.data?.detail || 'Scanning stream...';
            setFaceDetected(false);
            setFaceFeedback(detail);
        } finally {
            autoDetectRef.current = false;
            if (cameraActive && !isVerifying && !hasBlinked) {
                timeoutId = setTimeout(pollFace, 300);
            }
        }
    };

    if (cameraActive) {
        autoDetectRef.current = false;
        timeoutId = setTimeout(pollFace, 300);
    } else {
        setFaceDetected(false);
        setFaceFeedback('Enable camera to verify your identity.');
    }

    return () => clearTimeout(timeoutId);
  }, [cameraActive, isVerifying, hasBlinked]);

  const handleVerifyIdentity = async (e) => {
    e.preventDefault();
    if (!cameraActive) {
      setError('Camera is required to verify identity.');
      return;
    }
    setStatus('Verifying face and identity...');
    setError('');
    setIsVerifying(true);

    if (!capturedFace) {
        setError('Please wait for your face to be securely captured before verifying.');
        setIsVerifying(false);
        setStatus('');
        return;
    }

    try {
      const response = await apiClient.post('/forgot-password/', { 
          voter_id: voterId, 
          email: email,
          face_image: capturedFace
      });
      
      // The token is now emailed. We just show the success message.
      setStatus(response.data.message);
      stopCamera();
      // The user will now need to click the link in their email.
    } catch (err) {
      setStatus('');
      setError(err.response?.data?.detail || 'Identity verification failed. Please try again.');
      
      // If the identity verification failed, reset the camera so they can try again
      setCapturedFace(null);
      setHasBlinked(false);
      if (videoRef.current) {
          videoRef.current.play().catch(() => {});
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('Resetting password...');
    
    try {
      await apiClient.post('/reset-password/', {
        token: resetToken,
        new_password: newPassword
      });
      
      setStatus('Password reset successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      setStatus('');
      setError(err.response?.data?.detail || 'Failed to reset password.');
    }
  };

  const isForm1Valid = voterId.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // Live Validation Checks for Password
  const pwdHasLength = newPassword.length >= 8;
  const pwdHasUpper = /[A-Z]/.test(newPassword);
  const pwdHasLower = /[a-z]/.test(newPassword);
  const pwdHasNumber = /\d/.test(newPassword);
  const pwdHasSpecial = /[^A-Za-z0-9\s]/.test(newPassword);
  const pwdNoSpaces = newPassword.length > 0 && !/\s/.test(newPassword);
  const isPasswordValid = pwdHasLength && pwdHasUpper && pwdHasLower && pwdHasNumber && pwdHasSpecial && pwdNoSpaces;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-4 py-12 transition-colors duration-300">
      <button onClick={() => setIsDarkMode(!isDarkMode)} className="fixed top-6 right-6 z-50 p-2 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 transition shadow-sm">
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="w-full max-w-md p-10 flex flex-col items-center bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <h2 className="text-4xl font-extrabold text-center text-blue-600 dark:text-blue-500 tracking-wide mb-8">Reset Password</h2>
        
        {error && (
          <div className="w-full p-3 mb-6 bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-200 rounded-lg text-sm text-center">
            {error}
          </div>
        )}
        
        {status && (
          <div className="w-full p-3 mb-6 bg-green-100 dark:bg-green-900/50 border border-green-400 dark:border-green-500 text-green-700 dark:text-green-200 rounded-lg text-sm text-center font-bold animate-pulse">
            {status}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleVerifyIdentity} className="w-full flex flex-col items-center space-y-6">
            <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-2">Enter your registered details and scan your face to authorize a password reset.</p>
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
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Email Address</label>
              <input
                type="email"
                required
                className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="youremail@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            {/* Camera Section */}
            <div className="w-full">
              {!cameraActive ? (
                <button 
                  type="button"
                  onClick={startCamera}
                  disabled={!isForm1Valid}
                  className={`w-full font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm sm:text-base ${!isForm1Valid ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 cursor-not-allowed' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white'}`}
                >
                  <Camera size={20} className="flex-shrink-0" /> <span className="text-center">Enable Camera to Verify</span>
                </button>
              ) : (
                <div className="flex flex-col items-center w-full bg-gray-50 dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-600 relative">
                  <p className={`mb-4 text-sm font-medium text-center transition-colors duration-300 ${faceDetected ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>{faceFeedback}</p>
                  <div className={`relative w-full max-w-sm mx-auto overflow-hidden rounded-lg border-2 bg-black aspect-video transition-all duration-500 ${faceDetected ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'border-gray-300 dark:border-gray-600 shadow-lg'}`}>
                    <video ref={videoRef} autoPlay playsInline muted disablePictureInPicture controls={false} controlsList="nodownload nofullscreen noremoteplayback" className="w-full h-full object-cover transform scale-x-[-1] pointer-events-none" />
                    <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-3/4 aspect-square border-4 rounded-full pointer-events-none z-10 transition-all duration-500 ${faceDetected ? 'border-solid border-green-500/80 scale-105' : 'border-dashed border-blue-500/70 animate-pulse'}`}></div>
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isVerifying || !cameraActive || !faceDetected || !hasBlinked || !isForm1Valid || !capturedFace}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              {isVerifying ? 'Verifying...' : 'Verify Identity'}
            </button>
            
            <div className="text-center mt-4">
              <Link to="/login" className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors text-sm font-semibold">
                Back to Login
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="w-full flex flex-col items-center space-y-6">
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">New Password</label>
              
              <div className="text-xs text-left mb-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                <p className="font-semibold text-gray-700 dark:text-gray-300">Requirements:</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`flex items-center gap-1.5 ${pwdHasLength ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {pwdHasLength ? <Check size={14} className="flex-shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-current flex-shrink-0" />}
                    <span>8+ characters</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${pwdHasUpper ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {pwdHasUpper ? <Check size={14} className="flex-shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-current flex-shrink-0" />}
                    <span>Uppercase (A-Z)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${pwdHasLower ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {pwdHasLower ? <Check size={14} className="flex-shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-current flex-shrink-0" />}
                    <span>Lowercase (a-z)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${pwdHasNumber ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {pwdHasNumber ? <Check size={14} className="flex-shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-current flex-shrink-0" />}
                    <span>Number (0-9)</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${pwdHasSpecial ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {pwdHasSpecial ? <Check size={14} className="flex-shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-current flex-shrink-0" />}
                    <span>Special char</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${pwdNoSpaces ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {pwdNoSpaces ? <Check size={14} className="flex-shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-current flex-shrink-0" />}
                    <span>No spaces</span>
                  </div>
                </div>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className={`w-full bg-gray-100 dark:bg-gray-700 border ${newPassword.length > 0 ? (isPasswordValid ? 'border-green-500' : 'border-red-400') : 'border-gray-300 dark:border-gray-600'} rounded-xl py-3 px-10 text-gray-900 dark:text-white text-center tracking-widest focus:ring-2 focus:ring-blue-500 outline-none transition-all`}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
              disabled={!isPasswordValid}
              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              Set New Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;