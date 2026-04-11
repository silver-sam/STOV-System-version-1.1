import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import apiClient from '../../api/client';
import { QRCodeSVG } from 'qrcode.react';
import { UserPlus, Copy, Check, Monitor, Camera, Sun, Moon, Eye, EyeOff, AlertTriangle } from 'lucide-react';

const Register = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminRegistration = new URLSearchParams(location.search).get('admin') === 'true';
  const [step, setStep] = useState(1); // 1: Register Form, 2: QR Code
  const [formData, setFormData] = useState({ name: '', email: '', voter_id: '', password: '', admin_key: '' });
  const [qrValue, setQrValue] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminKey, setShowAdminKey] = useState(false);
  
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

  // Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [hasBlinked, setHasBlinked] = useState(false);
  const [capturedFace, setCapturedFace] = useState(null);
  const [faceFeedback, setFaceFeedback] = useState('Look directly at your camera.');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const autoDetectRef = useRef(false);
  const formRef = useRef(null);
  const submitBtnRef = useRef(null);
  const hasAutoSubmittedRef = useRef(false);

  const startCamera = async () => {
    setError('');
    hasAutoSubmittedRef.current = false;
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

  // Live Validation Checks (Must be declared BEFORE the useEffect uses them)
  const isNameValid = formData.name.trim().split(/\s+/).length >= 2;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
  const isVoterIdValid = formData.voter_id.trim().length > 0;
  const pwdHasLength = formData.password.length >= 8;
  const pwdHasUpper = /[A-Z]/.test(formData.password);
  const pwdHasLower = /[a-z]/.test(formData.password);
  const pwdHasNumber = /\d/.test(formData.password);
  const pwdHasSpecial = /[^A-Za-z0-9\s]/.test(formData.password);
  const pwdNoSpaces = formData.password.length > 0 && !/\s/.test(formData.password);
  const isPasswordValid = pwdHasLength && pwdHasUpper && pwdHasLower && pwdHasNumber && pwdHasSpecial && pwdNoSpaces;
  const isAdminKeyValid = !isAdminRegistration || formData.admin_key.trim().length > 0;
  const isFormValid = isNameValid && isEmailValid && isVoterIdValid && isPasswordValid && isAdminKeyValid;

  // Real-time Face Detection Polling
  useEffect(() => {
    let timeoutId;
    const pollFace = async () => {
      if (!videoRef.current || !cameraActive || autoDetectRef.current || isRegistering || capturedFace) return;
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

        // We have a face, now check liveness
        if (!hasBlinked) {
          if (res.data.blinking) {
            setHasBlinked(true);
            setFaceFeedback('Liveness verified! Open your eyes to capture...');
          } else {
            setFaceFeedback('Face detected! Please BLINK to verify liveness.');
          }
          return;
        }

        // Liveness is verified (hasBlinked is true), now wait for eyes to be open
        if (res.data.blinking) {
          setFaceFeedback('Liveness verified! Open your eyes to capture...');
          return;
        }

        // Eyes are open! Lock it in.
        setCapturedFace(frame);
        if (videoRef.current) {
            videoRef.current.pause();
        }

        // Form is valid, and we haven't submitted yet
        if (isFormValid && !hasAutoSubmittedRef.current) {
          setFaceFeedback('Face captured! Auto-registering...');
          hasAutoSubmittedRef.current = true;
          if (submitBtnRef.current) {
            submitBtnRef.current.click();
          }
          return; // Stop polling after submission attempt
        } else if (!isFormValid) {
            setFaceFeedback('Face captured! Please complete all fields to register.');
        } else if (hasAutoSubmittedRef.current) {
            setFaceFeedback('Face captured! Click Register to try again if auto-submit fails.');
        }

      } catch (err) {
        console.error("Face detection poll failed:", err);
        const detail = err.response?.data?.detail || 'Scanning stream...';
        setFaceDetected(false);
        setFaceFeedback(detail);
      } finally {
        autoDetectRef.current = false;
        if (cameraActive && !isRegistering && !hasAutoSubmittedRef.current && !capturedFace) {
            timeoutId = setTimeout(pollFace, 300);
        }
      }
    };

    if (cameraActive && !capturedFace) { autoDetectRef.current = false; timeoutId = setTimeout(pollFace, 300); } 
    else if (!cameraActive) { setFaceDetected(false); setHasBlinked(false); setCapturedFace(null); setFaceFeedback('Look directly at your camera.'); }
    return () => clearTimeout(timeoutId);
  }, [cameraActive, isRegistering, hasBlinked, isFormValid, capturedFace]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isRegistering) return;

    if (!isFormValid) {
      setError('Please complete all form requirements correctly.');
      return;
    }

    if (!videoRef.current) {
      setError('Camera is required for face registration.');
      return;
    }
    
    setIsRegistering(true);
    setError('');
    
    let faceImageBase64 = capturedFace;
    if (!faceImageBase64) {
      setError('Please wait for your face to be securely captured.');
      setIsRegistering(false);
      return;
    }

    try {
      const payload = {
        name: formData.name,
        email: formData.email,
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
      console.error("Registration Error Details:", err);
      if (err.response?.data) {
        if (typeof err.response.data === 'string') {
          // Catches FastAPI raw 500 errors (like unmigrated databases)
          setError(`Server Error: Database schema out of sync. Please run 'docker-compose down -v' and restart.`);
        } else if (err.response.data.detail) {
          // Catches FastAPI 422 Validation Arrays or our custom 400 errors
          const detail = err.response.data.detail;
          if (Array.isArray(detail)) setError(detail.map(d => `${d.loc[d.loc.length-1]}: ${d.msg}`).join(', '));
          else setError(detail);
        } else {
          setError('Registration failed due to an unknown server error.');
        }
      } else {
        setError(err.message || 'Registration failed. Network error.');
      }
      hasAutoSubmittedRef.current = false; // Allow another auto-submit attempt on failure
      setCapturedFace(null);
      setHasBlinked(false);
      if (videoRef.current) {
          videoRef.current.play().catch(() => {});
      }
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-4 py-12 transition-colors duration-300">
      <button onClick={() => setIsDarkMode(!isDarkMode)} className="fixed top-6 right-6 z-50 p-2 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700 transition shadow-sm">
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="w-full max-w-md p-10 flex flex-col items-center bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 transition-colors duration-300">
        <h2 className="text-4xl font-extrabold text-center text-blue-600 dark:text-blue-500 tracking-wide mb-8">
          {isAdminRegistration ? 'Admin Registration' : 'Voter Registration'}
        </h2>

        {step === 1 ? (
          <form ref={formRef} onSubmit={handleSubmit} className="w-full flex flex-col items-center space-y-6">
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center justify-center gap-2">
                Full Name {formData.name.length > 0 && (isNameValid ? <Check size={16} className="text-green-500" /> : <span className="text-red-500 text-xs font-bold">First and Last Name Required</span>)}
              </label>
              <input
                type="text"
                required
                className={`w-full bg-gray-100 dark:bg-gray-700 border ${formData.name.length > 0 ? (isNameValid ? 'border-green-500' : 'border-red-400') : 'border-gray-300 dark:border-gray-600'} rounded-xl py-3 px-4 text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all`}
                placeholder="full name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center justify-center gap-2">
                Email Address {formData.email.length > 0 && (isEmailValid ? <Check size={16} className="text-green-500" /> : <span className="text-red-500 text-xs font-bold">Invalid Format</span>)}
              </label>
              <input
                type="email"
                required
                className={`w-full bg-gray-100 dark:bg-gray-700 border ${formData.email.length > 0 ? (isEmailValid ? 'border-green-500' : 'border-red-400') : 'border-gray-300 dark:border-gray-600'} rounded-xl py-3 px-4 text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all`}
                placeholder="youremail@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center justify-center gap-2">
                {isAdminRegistration ? 'Admin ID' : 'Voter ID'} {formData.voter_id.length > 0 && (isVoterIdValid && <Check size={16} className="text-green-500" />)}
              </label>
              <input
                type="text"
                required
                className={`w-full bg-gray-100 dark:bg-gray-700 border ${formData.voter_id.length > 0 ? (isVoterIdValid ? 'border-green-500' : 'border-red-400') : 'border-gray-300 dark:border-gray-600'} rounded-xl py-3 px-4 text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all`}
                placeholder={isAdminRegistration ? "ADMIN-123" : "e.g. Employee ID, National ID..."}
                value={formData.voter_id}
                onChange={(e) => setFormData({ ...formData, voter_id: e.target.value })}
              />
            </div>
            <div className="w-full text-center">
              <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Password</label>
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
                    <span>Special char eg (#&*?/!@%) </span>
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
                  className={`w-full bg-gray-100 dark:bg-gray-700 border ${formData.password.length > 0 ? (isPasswordValid ? 'border-green-500' : 'border-red-400') : 'border-gray-300 dark:border-gray-600'} rounded-xl py-3 px-10 text-gray-900 dark:text-white text-center tracking-widest focus:ring-2 focus:ring-blue-500 outline-none transition-all`}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
            {isAdminRegistration && (
              <div className="w-full text-center">
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center justify-center gap-2">
                  Admin Master Key {formData.admin_key.length > 0 && <Check size={16} className="text-green-500" />}
                </label>
                <div className="relative">
                  <input
                    type={showAdminKey ? "text" : "password"}
                    required
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-10 text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                    placeholder="insert admin master key"
                    value={formData.admin_key}
                    onChange={(e) => setFormData({ ...formData, admin_key: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminKey(!showAdminKey)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    {showAdminKey ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            )}

            {/* Camera Section */}
            {!cameraActive ? (
              <button 
                type="button"
                onClick={startCamera}
            disabled={!isFormValid}
                className={`w-full font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-sm sm:text-base ${!isFormValid ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 cursor-not-allowed' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white'}`}
              >
                <Camera size={20} className="flex-shrink-0" /> <span className="text-center">Enable Camera for Face Registration</span>
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

            {error && (
              <div className="w-full p-3 bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-200 rounded-lg text-sm text-center">
                {error}
              </div>
            )}

            {/* Hidden button to trigger native form submission with HTML5 validation */}
            <button type="submit" ref={submitBtnRef} disabled={!isFormValid} className="hidden" />

            <button
              type="submit"
              disabled={isRegistering || !cameraActive || !faceDetected || !hasBlinked || !isFormValid || !capturedFace}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              {isRegistering ? 'Registering & Processing Face...' : (!faceDetected) ? 'Looking for face...' : (!hasBlinked) ? 'Waiting for blink...' : <><UserPlus size={20} className="flex-shrink-0" /> <span>Register Account</span></>}
            </button>
            <div className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
              Already have an account? <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline">Login</Link>
            </div>
          </form>
        ) : (
          <div className="w-full flex flex-col items-center space-y-5">
            
            {/* --- NEW WARNING BANNER --- */}
            <div className="w-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 p-5 rounded-2xl shadow-sm text-left">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" size={24} />
                <div>
                  <h3 className="text-amber-800 dark:text-amber-300 font-extrabold text-lg tracking-wide">ACTION REQUIRED: Setup 2FA</h3>
                  <p className="text-amber-700 dark:text-amber-400 text-sm mt-1 font-medium leading-relaxed">
                    To secure your identity, you <strong>must</strong> link an authenticator app right now. If you skip this, you will not be able to log in!
                  </p>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800/80 p-4 rounded-xl border border-amber-100 dark:border-amber-800 text-sm text-gray-700 dark:text-gray-300 space-y-2.5 font-medium shadow-inner">
                <p><span className="bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-100 px-2 py-0.5 rounded-md mr-2">1</span> Download <strong>Google Authenticator</strong> or <strong>Authy</strong>.</p>
                <p><span className="bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-100 px-2 py-0.5 rounded-md mr-2">2</span> Tap the <strong>+</strong> icon in the app to add an account.</p>
                <p><span className="bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-100 px-2 py-0.5 rounded-md mr-2">3</span> Scan the QR code below.</p>
              </div>
            </div>

            <div className="text-center">
              <div className="bg-white p-4 rounded-xl shadow-md dark:shadow-lg inline-block mb-3">
                <QRCodeSVG value={qrValue} size={180} />
              </div>
              <h3 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">Scan this QR Code</h3>
            </div>

            <div className="w-full bg-gray-100 dark:bg-gray-700 p-4 rounded-xl border border-gray-300 dark:border-gray-600 relative text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Or use Manual Entry Code</p>
              <p className="font-mono text-xl font-bold text-amber-600 dark:text-amber-400 tracking-widest break-all">
                {manualKey}
              </p>
              <button 
                onClick={handleCopy}
                className="absolute top-2 right-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors p-2"
                title="Copy to clipboard"
              >
                {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} />}
              </button>
            </div>

            <div className="w-full text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-300 dark:border-gray-600">
              <div className="flex items-center gap-3">
                <Monitor size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span>No phone? Use a browser extension like <strong>Authenticator</strong> or a desktop app like <strong>WinAuth</strong>.</span>
              </div>
            </div>

            {error && (
              <div className="w-full p-3 bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 text-red-700 dark:text-red-200 rounded-lg text-sm text-center">
                {error}
              </div>
            )}

            <button
              onClick={() => navigate('/login')}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 active:scale-95 text-sm sm:text-base"
            >
              I've scanned it, Proceed to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Register;
