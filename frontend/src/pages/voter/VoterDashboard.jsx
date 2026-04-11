import { useState, useEffect, useContext, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import AuthContext from '../../context/AuthContext';
import { Vote, CheckCircle, AlertCircle, ShieldCheck, Camera, ScanFace, Sun, Moon, LogOut, User, Search, PieChart, Menu, X, Download } from 'lucide-react';
import Chatbot from '../../components/Chatbot';

const VoterDashboard = () => {
  const { isAdmin, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('elections'); // 'elections' | 'profile' | 'track' | 'results'
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [elections, setElections] = useState([]);
  const [electionSearch, setElectionSearch] = useState('');
  const [selectedElection, setSelectedElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isLoadingElections, setIsLoadingElections] = useState(true);
  const [electionsError, setElectionsError] = useState('');
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ name: 'Loading...', email: 'Loading...', voter_id: 'Loading...' });
  
  const [avatar, setAvatar] = useState(null);
  
  // Cropper State
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImg, setTempImg] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, scale: 1 });
  const [imgSize, setImgSize] = useState({ w: 256, h: 256 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Tracking State
  const [trackingId, setTrackingId] = useState('');
  const [trackingResult, setTrackingResult] = useState(null);
  const [trackingError, setTrackingError] = useState('');
  const [isTracking, setIsTracking] = useState(false);

  // Past Results State
  const [pastResults, setPastResults] = useState([]);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [resultsSearch, setResultsSearch] = useState('');

  // Live Timer State
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    let timerId;
    if (activeTab === 'elections' && !selectedElection) {
      timerId = setInterval(() => setCurrentTime(new Date()), 1000);
    }
    return () => clearInterval(timerId);
  }, [activeTab, selectedElection]);

  // Camera & Face Verification State
  const [cameraActive, setCameraActive] = useState(false);
  const [verifyingFace, setVerifyingFace] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceFeedback, setFaceFeedback] = useState('Look directly at your camera.');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const autoVerifyRef = useRef(false);
  const hasBlinkedRef = useRef(false);

  // --- AUTO LOGOUT ON INACTIVITY ---
  useEffect(() => {
    let inactivityTimer;
    const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutes

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        logout();
        navigate('/login');
      }, INACTIVITY_LIMIT);
    };

    const events = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer(); // Initialize

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [logout]);

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

  // 1. Fetch Active Elections (Live Auto-Refresh)
  useEffect(() => {
    let isMounted = true;
    const fetchElections = async (isFirstLoad) => {
      if (isFirstLoad && elections.length === 0) setIsLoadingElections(true);
      try {
        const res = await apiClient.get('/elections/');
        if (isMounted) {
          setElections(res.data);
          setElectionsError('');
        }
      } catch (err) {
        console.error(err);
        if (isMounted && isFirstLoad) setElectionsError('Failed to load active elections. Please try again later.');
      } finally {
        if (isMounted) setIsLoadingElections(false);
      }
    };

    if (activeTab === 'elections' && !selectedElection) {
      fetchElections(true);
      const intervalId = setInterval(() => fetchElections(false), 10000); // 10s polling
      return () => {
        isMounted = false;
        clearInterval(intervalId);
      };
    }
  }, [activeTab, selectedElection]);

  // Fetch Past Results (Live Auto-Refresh)
  useEffect(() => {
    let isMounted = true;
    const fetchResults = async (isFirstLoad) => {
      if (isFirstLoad && pastResults.length === 0) setIsLoadingResults(true);
      try {
        const res = await apiClient.get('/results/');
        if (isMounted) setPastResults(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setIsLoadingResults(false);
      }
    };

    if (activeTab === 'results') {
      fetchResults(true);
      const intervalId = setInterval(() => fetchResults(false), 10000); // 10s polling
      return () => {
        isMounted = false;
        clearInterval(intervalId);
      };
    }
  }, [activeTab]);

  // Fetch Profile Data on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await apiClient.get('/profile/');
        setProfile(res.data);
        if (res.data.avatar) setAvatar(res.data.avatar);
      } catch (err) {
        console.error('Failed to load profile', err);
      }
    };
    fetchProfile();
  }, []);

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTempImg(reader.result);
        setCrop({ x: 0, y: 0, scale: 1 });
        setCropModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  // Mathematical Canvas Crop
  const handleCropSave = () => {
    const canvas = document.createElement('canvas');
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = async () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.translate(size / 2, size / 2);
      ctx.translate(crop.x, crop.y);
      ctx.scale(crop.scale, crop.scale);
      ctx.drawImage(img, -imgSize.w / 2, -imgSize.h / 2, imgSize.w, imgSize.h);

      const base64String = canvas.toDataURL('image/jpeg', 0.9);
      setAvatar(base64String);
      try {
        await apiClient.put('/profile/avatar/', { avatar: base64String });
      } catch (err) {
        console.error('Failed to save avatar to database', err);
      }
      setCropModalOpen(false);
      setTempImg(null);
    };
    img.src = tempImg;
  };

  // --- PIE CHART HELPERS ---
  const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#0ea5e9'];

  const getPieChartStyle = (results) => {
    if (!results) return {};
    const total = Object.values(results).reduce((acc, val) => acc + val, 0);
    
    if (total === 0) return { background: 'conic-gradient(#e5e7eb 0deg 360deg)' };
    
    let currentAngle = 0;
    const parts = Object.entries(results).map(([_, votes], index) => {
      const percentage = (votes / total) * 360;
      const color = CHART_COLORS[index % CHART_COLORS.length];
      const start = currentAngle;
      currentAngle += percentage;
      return `${color} ${start}deg ${currentAngle}deg`;
    });
    
    return { background: `conic-gradient(${parts.join(', ')})` };
  };

  // Touch & Mouse Drag Handlers
  const handlePointerDown = (e) => { setIsDragging(true); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; setDragStart({ x: clientX - crop.x, y: clientY - crop.y }); };
  const handlePointerMove = (e) => { if (!isDragging) return; const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; setCrop({ ...crop, x: clientX - dragStart.x, y: clientY - dragStart.y }); };
  const handlePointerUp = () => setIsDragging(false);

  // 2. Load Candidates when an election is chosen
  const handleSelectElection = async (election) => {
    setSelectedElection(election);
    setReceipt(null);
    setError('');
    setSelectedCandidateIndex(null);
    stopCamera();
    try {
      const res = await apiClient.get(`/candidates/${election.id}`);
      setCandidates(res.data);
    } catch (err) {
      setError('Could not load candidates.');
    }
  };

  // 3. Camera Controls
  const startCamera = async () => {
    setError('');
    setFaceFeedback('Look directly at your camera.');
    hasBlinkedRef.current = false;
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setError('Camera access denied. Please allow camera permissions to verify your identity.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    setCameraActive(false);
  };

  // Cleanup camera on component unmount
  useEffect(() => {
    return () => stopCamera();
  }, []);

  // 4. Auto Face Verification Loop
  useEffect(() => {
    let timeoutId;

    const performAutoVerification = async () => {
      if (!videoRef.current || !cameraActive || autoVerifyRef.current) return;
      
      if (videoRef.current.readyState !== 4) {
        timeoutId = setTimeout(performAutoVerification, 500);
        return;
      }

      autoVerifyRef.current = true;
      setVerifyingFace(true);
      setError(''); // Clear previous hard errors

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
      const faceImageBase64 = canvas.toDataURL('image/jpeg', 0.8);

      try {
        // 1. LIVENESS CHECK INJECTION
        if (!hasBlinkedRef.current) {
          const detectRes = await apiClient.post('/detect-face/', { image: faceImageBase64 });
          setFaceDetected(detectRes.data.detected);
          if (detectRes.data.detected) {
            if (detectRes.data.blinking) {
              hasBlinkedRef.current = true;
              setFaceFeedback('Liveness verified! Open your eyes for identity match...');
            } else {
              setFaceFeedback('Face detected! Please BLINK to verify liveness.');
            }
          } else {
            setFaceFeedback(detectRes.data.detail || 'Scanning... Position your face.');
          }
          autoVerifyRef.current = false;
          if (cameraActive) timeoutId = setTimeout(performAutoVerification, 300);
          return;
        }

        // 2. Wait for eyes to open again before taking the verification photo
        const detectRes2 = await apiClient.post('/detect-face/', { image: faceImageBase64 });
        if (detectRes2.data.blinking) {
            setFaceFeedback('Liveness verified! Open your eyes for identity match...');
            autoVerifyRef.current = false;
            if (cameraActive) timeoutId = setTimeout(performAutoVerification, 300);
            return;
        }

        // 3. ID Verification
        setFaceFeedback('Identity check in progress...');
        await apiClient.post('/verify-face/', { image: faceImageBase64 });
        stopCamera();
        await handleCastVote();
      } catch (err) {
        const detail = err.response?.data?.detail;
        // If it's a critical verification failure, show a persistent error and stop.
        if (detail && (detail.includes('match') || detail.includes('denied'))) {
            setError(detail);
            stopCamera();
        } else {
            // Otherwise, it's a temporary detection issue. Update feedback and retry.
            setFaceFeedback(detail || 'Scanning... Please look directly at the camera.');
            hasBlinkedRef.current = false; // Reset blink to re-run liveness check
            setFaceDetected(false);
            autoVerifyRef.current = false;
            if (cameraActive) {
              timeoutId = setTimeout(performAutoVerification, 1000); // Try again after a delay
            }
        }
      } finally {
        setVerifyingFace(false);
      }
    };

    if (cameraActive) {
      autoVerifyRef.current = false;
      timeoutId = setTimeout(performAutoVerification, 300);
    }

    return () => clearTimeout(timeoutId);
  }, [cameraActive, selectedCandidateIndex, selectedElection]); // Dependencies ensure fresh state

  const handleCastVote = async () => {
    if (selectedCandidateIndex === null) return;
    setLoading(true);
    setFaceFeedback('Face verified! Encrypting and casting vote...');
    setError('');
    
    try {
      const payload = {
        election_id: selectedElection.id,
        candidate_index: selectedCandidateIndex
      };
      
      const res = await apiClient.post('/cast-vote/', payload);
      setReceipt(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Voting failed. You may have already voted.');
    } finally {
      setLoading(false);
    }
  };

  // 5. Track Vote
  const handleTrackVote = async (e) => {
    e.preventDefault();
    if (!trackingId.trim()) return;
    setTrackingError('');
    setTrackingResult(null);
    setIsTracking(true);

    try {
      const res = await apiClient.get(`/track-vote/${trackingId.trim()}`);
      setTrackingResult(res.data);
    } catch (err) {
      setTrackingError(err.response?.data?.detail || 'Failed to track vote. Please check your Tracking ID.');
    } finally {
      setIsTracking(false);
    }
  };

  // 6. Download Receipt PDF
  const handleDownloadReceipt = () => {
    if (!receipt || !selectedElection) return;
    
    const printContainer = document.createElement('div');
    printContainer.id = 'receipt-print-container';
    
    printContainer.innerHTML = `
      <div class="r-header">
        <div class="r-logo">AegisElect</div>
        <div class="r-success">✓ Official Voting Receipt</div>
      </div>
      <div class="r-box">
        <div class="r-row"><div class="r-label">Election Name</div><div class="r-value large">${selectedElection.title}</div></div>
        <div class="r-row"><div class="r-label">Your Tracking ID</div><div class="r-value highlight">${receipt.receipt_id}</div></div>
        <div class="r-row"><div class="r-label">Blockchain Transaction Hash</div><div class="r-value">${receipt.blockchain_transaction_hash}</div></div>
        <div class="r-row"><div class="r-label">Digital Fingerprint</div><div class="r-value" style="color: #7c3aed;">${receipt.digital_fingerprint}</div></div>
        <div class="r-row"><div class="r-label">Timestamp</div><div class="r-value">${new Date(receipt.timestamp).toLocaleString()}</div></div>
      </div>
      <div class="r-footer">
        Keep this receipt safe. You can use the Tracking ID to independently verify your vote on the blockchain.
        <br><br>
        <strong>Do not share your Tracking ID if you wish to remain entirely anonymous.</strong>
      </div>
    `;
    
    const style = document.createElement('style');
    style.innerHTML = `
      @media screen {
        #receipt-print-container { display: none; }
      }
      @media print {
        body > :not(#receipt-print-container) { display: none !important; }
        #receipt-print-container { 
          display: block !important; 
          font-family: system-ui, -apple-system, sans-serif; 
          padding: 40px 20px; 
          color: #1f2937; 
          line-height: 1.5; 
          max-width: 800px;
          margin: 0 auto;
        }
        .r-header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; }
        .r-logo { font-size: 24px; font-weight: 900; color: #2563eb; margin-bottom: 8px; }
        .r-success { color: #16a34a; font-size: 20px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .r-box { background: #f8fafc; border: 1px solid #e5e7eb; padding: 30px; border-radius: 16px; margin-bottom: 24px; }
        .r-row { margin-bottom: 20px; }
        .r-row:last-child { margin-bottom: 0; }
        .r-label { font-size: 11px; text-transform: uppercase; color: #6b7280; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 4px; }
        .r-value { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 14px; word-break: break-all; color: #111827; }
        .r-value.large { font-size: 18px; font-weight: bold; font-family: system-ui, -apple-system, sans-serif; }
        .r-value.highlight { color: #d97706; font-size: 18px; font-weight: bold; }
        .r-footer { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px; }
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(printContainer);
    
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.removeChild(printContainer);
        document.head.removeChild(style);
      }, 1000);
    }, 100);
  };

  // --- DYNAMIC FILTERING ---
  const filteredElections = elections.filter(e => 
    e.title.toLowerCase().includes(electionSearch.toLowerCase())
  );

  const filteredResults = pastResults.filter(e => 
    e.title.toLowerCase().includes(resultsSearch.toLowerCase())
  );

  // --- DYNAMIC GROUPING HELPER CARDS ---
  const exclusiveElections = filteredElections.filter(e => e.is_exclusive);
  const generalElections = filteredElections.filter(e => !e.is_exclusive);

  const exclusiveResults = filteredResults.filter(e => e.is_exclusive);
  const generalResults = filteredResults.filter(e => !e.is_exclusive);

  const formatTimeDiff = (diff) => {
    if (diff <= 0) return '';
    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const m = Math.floor((diff / 1000 / 60) % 60);
    const s = Math.floor((diff / 1000) % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const renderElectionCard = (election) => {
    const now = currentTime;
    const startDate = election.start_time ? new Date(election.start_time) : null;
    const endDate = election.end_time ? new Date(election.end_time) : null;
    const hasStarted = !startDate || startDate <= now;
    const hasEnded = endDate && endDate < now;
    const hasVoted = election.has_voted;
    const isLocked = election.is_locked;
    const isUnavailable = !hasStarted || hasEnded || hasVoted || isLocked;

    return (
      <div key={election.id} className={`bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isUnavailable ? 'opacity-60 grayscale cursor-not-allowed' : 'hover:border-blue-500 dark:hover:border-blue-500 hover:-translate-y-1 hover:shadow-xl cursor-pointer group shadow-md'}`} onClick={() => { if (!isUnavailable) handleSelectElection(election); }}>
        <h3 className="text-xl font-bold mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center flex-wrap gap-2">
          {election.title}
          {election.is_exclusive && (
            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider">
              Exclusive
            </span>
          )}
        </h3>
        
        {(hasVoted || isLocked || !hasStarted || hasEnded) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {hasVoted ? (
              <span className="text-xs font-bold px-3 py-1.5 rounded-md bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                <CheckCircle size={14} /> Voted
              </span>
            ) : isLocked ? (
              <span className="text-xs font-bold px-3 py-1.5 rounded-md bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300 flex items-center gap-1">
                Locked
              </span>
            ) : (
              <span className={`text-xs font-bold px-3 py-1.5 rounded-md ${!hasStarted ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                {!hasStarted ? `Starts: ${startDate.toLocaleString()}` : 'Voting Ended'}
              </span>
            )}
            {!hasStarted && !hasVoted && !isLocked && (
              <span className="text-xs font-bold text-amber-600 dark:text-amber-500">Starts in {formatTimeDiff(startDate - now)}</span>
            )}
          </div>
        )}
        {(hasStarted && endDate && !hasEnded) && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2.5 py-1 rounded">Ends: {endDate.toLocaleString()}</span>
            {!isUnavailable && (
              <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded shadow-sm flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                {formatTimeDiff(endDate - now)} left
              </span>
            )}
          </div>
        )}

        {!isUnavailable && (
          <div className="mt-6 text-gray-500 dark:text-gray-400 text-sm font-semibold flex items-center gap-1 group-hover:translate-x-2 transition-transform duration-300">
            Click to Vote &rarr;
          </div>
        )}
      </div>
    );
  };

  const renderResultCard = (election) => (
    <div key={election.id} className="bg-white dark:bg-gray-800 p-5 sm:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl">
      <div className="flex items-center gap-3 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
        <PieChart className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        <h3 className="font-extrabold text-xl text-gray-900 dark:text-white flex flex-wrap items-center gap-2">
          {election.title}
          {election.is_exclusive && (
            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider">
              Exclusive
            </span>
          )}
        </h3>
      </div>
      
      <div className="flex flex-col md:flex-row items-center gap-10">
        <div 
          className="w-40 h-40 sm:w-56 sm:h-56 rounded-full shadow-lg border-4 border-white dark:border-gray-800 flex-shrink-0 transition-all duration-500"
          style={getPieChartStyle(election.official_results)}
        />
        
        <div className="flex-1 w-full space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(election.official_results).map(([candidate, votes], index) => {
              const total = election.total_votes;
              const percentage = total > 0 ? ((votes / total) * 100).toFixed(1) : 0;
              const details = election.candidate_details?.[candidate] || {};
              return (
                <div key={candidate} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></div>
                  {details.photo ? (
                    <img src={details.photo} alt={candidate} className="w-10 h-10 rounded-full object-cover shadow-sm border border-gray-200 dark:border-gray-700 flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0">
                      <User size={20} className="text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{candidate}</p>
                    {details.party && <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate leading-tight">{details.party}</p>}
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-0.5">{votes} votes ({percentage}%)</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pt-4 mt-2">
            <p className="text-sm font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Total Turnout: <span className="text-blue-600 dark:text-blue-400 ml-2 text-lg">{election.total_votes} votes</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
      
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <h1 
          onClick={() => { setActiveTab('elections'); setSelectedElection(null); setReceipt(null); setIsMobileMenuOpen(false); }}
          className="text-xl font-black text-blue-600 dark:text-blue-500 flex items-center gap-2 tracking-wide cursor-pointer hover:opacity-80 transition-opacity"
        >
          <img src="/aegis_logo.png" alt="AegisElect Logo" className="w-10 h-10 object-contain rounded-full shadow-sm bg-white p-0.5" />
          AegisElect
        </h1>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile Overlay Backdrop */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col shadow-2xl md:shadow-lg z-50 md:z-20 md:sticky md:top-0 md:h-screen transform transition-transform duration-300 md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 pb-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h1 
            onClick={() => { setActiveTab('elections'); setSelectedElection(null); setReceipt(null); }}
            className="text-2xl font-black text-blue-600 dark:text-blue-500 flex items-center gap-2 tracking-wide cursor-pointer hover:opacity-80 transition-opacity"
          >
            <img src="/aegis_logo.png" alt="AegisElect Logo" className="w-10 h-10 object-contain rounded-full flex-shrink-0 shadow-sm bg-white p-0.5" /> 
            <span className="truncate">AegisElect</span>
          </h1>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Profile Card */}
        <div className="p-6 pb-2">
          <div className="flex items-center gap-4 bg-gray-100 dark:bg-gray-700 p-4 rounded-2xl shadow-inner border border-gray-200 dark:border-gray-600">
            {avatar ? (
              <img src={avatar} alt="Avatar" onError={() => setAvatar(null)} className="w-10 h-10 rounded-full object-cover shadow-md border-2 border-white dark:border-gray-800 flex-shrink-0" />
            ) : (
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 rounded-full text-white shadow-md flex-shrink-0">
                <User size={24} />
              </div>
            )}
            <div className="overflow-hidden">
              <p className="font-bold text-sm truncate">{profile.name !== 'Loading...' ? profile.name : 'Verified Voter'}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider mt-0.5 truncate">
                {profile.voter_id !== 'Loading...' ? profile.voter_id : 'Active Session'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
          <button 
            onClick={() => { setActiveTab('elections'); setSelectedElection(null); setReceipt(null); setIsMobileMenuOpen(false); }} 
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'elections' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Vote size={20} /> Active Elections
          </button>
          <button 
            onClick={() => { setActiveTab('results'); setIsMobileMenuOpen(false); }} 
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'results' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <PieChart size={20} /> Past Results
          </button>
          <button 
            onClick={() => { setActiveTab('track'); setTrackingResult(null); setTrackingError(''); setIsMobileMenuOpen(false); }} 
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'track' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Search size={20} /> Track Vote
          </button>
          <button 
            onClick={() => { setActiveTab('profile'); setIsMobileMenuOpen(false); }} 
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'profile' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <User size={20} /> My Profile
          </button>
          
          {isAdmin && (
            <Link to="/admin" onClick={() => setIsMobileMenuOpen(false)} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all duration-200">
              <ShieldAlert size={20} /> Admin Panel
            </Link>
          )}
        </nav>

        {/* Bottom Actions */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2 bg-gray-50 dark:bg-gray-800/50">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            {isDarkMode ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button onClick={() => { logout(); navigate('/login'); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95">
            <LogOut size={20} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-10 lg:p-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto">

        {/* TAB 1: ELECTIONS */}
        {activeTab === 'elections' && (
          <>
            {/* VIEW 1: LIST OF ELECTIONS */}
            {!selectedElection && (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">Active Elections</h2>
                    <span className="flex items-center gap-2 text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-full uppercase tracking-wider border border-green-200 dark:border-green-800 shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                      <span className="hidden sm:inline">Live Updates</span>
                      <span className="sm:hidden">Live</span>
                    </span>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <input
                      type="text"
                      placeholder="Search elections..."
                      value={electionSearch}
                      onChange={(e) => setElectionSearch(e.target.value)}
                      className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all"
                    />
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  </div>
                </div>
                <div className="grid gap-6 md:grid-cols-2">
                {isLoadingElections ? (
                  <div className="col-span-2 text-center py-10 text-gray-500 bg-gray-100 dark:bg-gray-800/50 rounded-3xl border border-gray-300 dark:border-gray-700 border-dashed">
                    Loading active elections...
                  </div>
                ) : electionsError ? (
                  <div className="col-span-2 text-center py-10 text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20 rounded-3xl border border-red-400 dark:border-red-800 border-dashed flex justify-center items-center gap-2">
                    <AlertCircle size={20}/> {electionsError}
                  </div>
                ) : filteredElections.length === 0 ? (
                  <div className="col-span-2 text-center py-10 text-gray-500 bg-gray-100 dark:bg-gray-800/50 rounded-3xl border border-gray-300 dark:border-gray-700 border-dashed">
                    {elections.length === 0 ? 'No active elections found.' : 'No elections match your search.'}
                  </div>
                ) : (
                  <>
                    {exclusiveElections.length > 0 && (
                      <div className="col-span-1 sm:col-span-2 mt-2">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-purple-700 dark:text-purple-400 border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                          Exclusive Elections
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">You may only participate in ONE of these elections.</p>
                      </div>
                    )}
                    {exclusiveElections.map(renderElectionCard)}

                    {generalElections.length > 0 && (
                      <div className="col-span-1 sm:col-span-2 mt-6">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-blue-700 dark:text-blue-400 border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                          General Elections
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Standard elections open to all eligible voters.</p>
                      </div>
                    )}
                    {generalElections.map(renderElectionCard)}
                  </>
                )}
                </div>
              </>
            )}

            {/* VIEW 2: VOTING BOOTH */}
            {selectedElection && !receipt && (
              <div className="bg-white dark:bg-gray-800 p-6 sm:p-10 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
                <button onClick={() => {
                  setSelectedElection(null);
                  stopCamera();
                }} className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors">&larr; Back to Elections</button>
                <h2 className="text-2xl sm:text-3xl font-extrabold mb-8 flex items-center flex-wrap gap-3">
                  <span>Ballot: <span className="text-blue-600 dark:text-blue-400">{selectedElection.title}</span></span>
                  {selectedElection.is_exclusive && (
                    <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-3 py-1 rounded-lg text-sm font-extrabold uppercase tracking-wider">
                      Exclusive
                    </span>
                  )}
                </h2>
                
                {error && <div className="mb-8 p-4 bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 rounded-xl text-red-700 dark:text-red-200 flex items-center gap-2 font-medium"><AlertCircle size={20}/> {error}</div>}

                <div className="space-y-4 mb-8">
                  {candidates.map((candidate) => (
                    <label key={candidate.db_id} className={`flex flex-col p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 ${selectedCandidateIndex === candidate.candidate_index ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 shadow-md' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-500'}`}>
                      <div className="flex items-center w-full">
                        <input 
                          type="radio" 
                          name="candidate" 
                          className="w-5 h-5 text-blue-600 focus:ring-blue-500"
                          checked={selectedCandidateIndex === candidate.candidate_index}
                          onChange={() => setSelectedCandidateIndex(candidate.candidate_index)}
                          disabled={cameraActive || loading}
                        />
                        <div className="ml-4 flex items-center gap-4 w-full">
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0 shadow-sm flex items-center justify-center">
                            {candidate.photo ? <img src={candidate.photo} alt={candidate.name} className="w-full h-full object-cover" /> : <User size={24} className="text-gray-400" />}
                          </div>
                          <div className="flex-1">
                            <span className="block text-lg font-bold text-gray-900 dark:text-white leading-tight">{candidate.name}</span>
                            {candidate.party && <span className="block text-sm font-semibold text-gray-500 dark:text-gray-400">{candidate.party}</span>}
                          </div>
                        </div>
                      </div>

                      {selectedCandidateIndex === candidate.candidate_index && (
                        <div className="mt-6 pt-6 border-t-2 border-dashed border-gray-300 dark:border-gray-600">
                          {!cameraActive ? (
                            <button 
                              onClick={startCamera}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl transition-all duration-200 active:scale-95 text-lg shadow-lg flex items-center justify-center gap-2"
                            >
                              <Camera size={24} /> Verify Face to Vote
                            </button>
                          ) : (
                            <div className="flex flex-col items-center">
                              <div className="mb-4 text-center">
                                <p className={`text-sm font-medium transition-colors duration-300 ${faceDetected ? 'text-green-600 dark:text-green-400 font-bold' : 'text-gray-600 dark:text-gray-400'}`}>{faceFeedback}</p>
                              </div>
                              <div className={`relative w-full max-w-md mx-auto mb-6 overflow-hidden rounded-lg border-2 bg-black aspect-video transition-all duration-500 ${faceDetected ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'border-gray-300 dark:border-gray-600 shadow-lg'}`}>
                                <video ref={videoRef} autoPlay playsInline muted disablePictureInPicture controls={false} controlsList="nodownload nofullscreen noremoteplayback" className="w-full h-full object-cover transform scale-x-[-1] pointer-events-none" />
                                <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-3/4 aspect-square border-4 rounded-full pointer-events-none z-10 transition-all duration-500 ${faceDetected ? 'border-solid border-green-500/80 scale-105' : 'border-dashed border-blue-500/70 animate-pulse'}`}></div>
                              </div>
                              <canvas ref={canvasRef} className="hidden" />
                            </div>
                          )}
                          <p className="text-center text-sm text-gray-500 mt-6 font-medium">Your identity is verified locally before encrypting your vote.</p>
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW 3: RECEIPT */}
            {receipt && (
              <div className="bg-white dark:bg-gray-800 p-6 sm:p-12 rounded-3xl border border-green-500/50 shadow-2xl shadow-green-100 dark:shadow-green-900/20">
                <div className="text-center mb-10">
                  <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-white mb-2">Vote Recorded!</h2>
                  <p className="text-gray-600 dark:text-gray-400 font-medium">Your ballot has been successfully encrypted and anchored.</p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-inner">
                  <div className="text-center">
                    <span className="text-gray-500 block text-xs uppercase font-bold tracking-wider mb-2">Your Tracking ID</span>
                    <span className="text-yellow-600 dark:text-yellow-400 select-all font-mono font-bold text-lg sm:text-xl break-all block px-2">{receipt.receipt_id}</span>
                  </div>
                  
                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <details className="group cursor-pointer">
                      <summary className="text-sm font-semibold text-blue-600 dark:text-blue-400 text-center hover:text-blue-700 dark:hover:text-blue-300 outline-none list-none flex justify-center items-center gap-2 transition-colors">
                        <ShieldCheck size={16} /> Show Advanced Verification Data
                      </summary>
                      <div className="mt-6 space-y-5 font-mono text-xs break-all text-left bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div>
                          <span className="text-gray-500 block uppercase font-bold tracking-wider mb-1">Blockchain Transaction Hash</span>
                          <span className="text-gray-800 dark:text-gray-300 select-all font-medium">{receipt.blockchain_transaction_hash}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block uppercase font-bold tracking-wider mb-1">Digital Fingerprint</span>
                          <span className="text-purple-600 dark:text-purple-400 select-all font-medium">{receipt.digital_fingerprint}</span>
                        </div>
                        {receipt.timestamp && (
                          <div>
                            <span className="text-gray-500 block uppercase font-bold tracking-wider mb-1">Timestamp</span>
                            <span className="text-gray-800 dark:text-gray-300 select-all font-medium">{new Date(receipt.timestamp).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                </div>

                <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
                  <button onClick={handleDownloadReceipt} className="flex items-center justify-center gap-2 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-8 py-4 rounded-xl font-bold transition-all active:scale-95 shadow-sm border border-blue-200 dark:border-blue-800">
                    <Download size={20} /> Save as PDF
                  </button>
                  <button onClick={() => { setSelectedElection(null); setReceipt(null); }} className="bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white px-8 py-4 rounded-xl font-bold transition-all active:scale-95 shadow-md">
                    Return to Dashboard
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB 2: TRACK VOTE */}
        {activeTab === 'track' && (
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-10 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-4">Track Your Vote</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-8 text-base">Enter your Tracking ID to mathematically verify that your encrypted ballot is securely anchored to the blockchain and has not been altered.</p>

            <form onSubmit={handleTrackVote} className="flex flex-col sm:flex-row gap-4 items-start sm:items-end mb-8">
              <div className="flex-1 w-full">
                <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Tracking ID</label>
                <input
                  type="text"
                  required
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                  placeholder="Paste your tracking ID here..."
                />
              </div>
              <button type="submit" disabled={isTracking} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                {isTracking ? <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div> : <Search size={20} />}
                Verify Proof
              </button>
            </form>

            {trackingError && (
              <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 rounded-xl text-red-700 dark:text-red-200 flex items-center gap-2 font-medium">
                <AlertCircle size={20}/> {trackingError}
              </div>
            )}

            {trackingResult && (
              <div className={`p-6 sm:p-8 rounded-2xl border shadow-inner ${trackingResult.status === 'VERIFIED' ? 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-500' : 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-500'}`}>
                <div className="flex items-center gap-4 mb-4">
                  {trackingResult.status === 'VERIFIED' ? <ShieldCheck className="w-10 h-10 text-green-500" /> : <AlertCircle className="w-10 h-10 text-red-500" />}
                  <div>
                    <h3 className={`text-xl font-extrabold ${trackingResult.status === 'VERIFIED' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                      {trackingResult.status === 'VERIFIED' ? 'Cryptographically Verified' : 'Verification Failed'}
                    </h3>
                    {trackingResult.timestamp && <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Recorded on: {new Date(trackingResult.timestamp).toLocaleString()}</p>}
                  </div>
                </div>
                <p className="text-gray-800 dark:text-gray-200 font-medium text-lg leading-relaxed">
                  {trackingResult.message}
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PAST RESULTS */}
        {activeTab === 'results' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">Election Results</h2>
                <span className="flex items-center gap-2 text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-full uppercase tracking-wider border border-green-200 dark:border-green-800 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="hidden sm:inline">Live Updates</span>
                  <span className="sm:hidden">Live</span>
                </span>
              </div>
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search past results..."
                  value={resultsSearch}
                  onChange={(e) => setResultsSearch(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl py-2.5 pl-10 pr-4 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
              </div>
            </div>
            {isLoadingResults ? (
              <div className="text-center py-10 text-gray-500 bg-gray-100 dark:bg-gray-800/50 rounded-3xl border border-gray-300 dark:border-gray-700 border-dashed">
                Loading official results...
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="text-center py-10 text-gray-500 bg-gray-100 dark:bg-gray-800/50 rounded-3xl border border-gray-300 dark:border-gray-700 border-dashed">
                {pastResults.length === 0 ? 'No published election results found.' : 'No results match your search.'}
              </div>
            ) : (
              <div className="space-y-10">
                {exclusiveResults.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-purple-700 dark:text-purple-400 border-b border-gray-200 dark:border-gray-700 pb-3 mb-6">Exclusive Elections</h3>
                    <div className="space-y-6">
                      {exclusiveResults.map(renderResultCard)}
                    </div>
                  </div>
                )}
                {generalResults.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold text-blue-700 dark:text-blue-400 border-b border-gray-200 dark:border-gray-700 pb-3 mb-6">General Elections</h3>
                    <div className="space-y-6">
                      {generalResults.map(renderResultCard)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PROFILE VIEW */}
        {activeTab === 'profile' && (
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-10 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-8">My Profile</h2>
            <div className="flex flex-col sm:flex-row gap-8 items-start">
              <div className="flex flex-col items-center gap-4 w-full sm:w-auto">
                <div className="w-32 h-32 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border-4 border-white dark:border-gray-800 shadow-lg overflow-hidden">
                {avatar ? (
                  <img src={avatar} alt="Profile Avatar" onError={() => setAvatar(null)} className="w-full h-full object-cover" />
                ) : (
                  <User size={48} className="text-gray-400 dark:text-gray-500" />
                )}
                </div>
              <label className="bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-bold px-5 py-2.5 rounded-xl transition-all active:scale-95 shadow-sm border border-gray-200 dark:border-gray-600 cursor-pointer text-center">
                  Upload Photo
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} onClick={(e) => { e.target.value = ''; }} />
              </label>
              </div>
              
              <div className="flex-1 w-full space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Full Name</label>
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 font-medium text-lg">
                    {profile.name}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Email Address</label>
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 font-medium text-lg">
                    {profile.email}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Voter ID</label>
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 font-mono text-lg text-blue-600 dark:text-blue-400">
                    {profile.voter_id}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </main>

      {/* CROP MODAL */}
      {cropModalOpen && tempImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm flex flex-col items-center">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Position & Scale Avatar</h3>
            
            <div 
              className="relative overflow-hidden bg-gray-100 dark:bg-gray-900 rounded-full border-4 border-blue-500 shadow-inner cursor-move touch-none"
              style={{ width: 256, height: 256 }}
              onMouseDown={handlePointerDown} onMouseMove={handlePointerMove} onMouseUp={handlePointerUp} onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown} onTouchMove={handlePointerMove} onTouchEnd={handlePointerUp}
            >
              <img 
                src={tempImg} 
                onLoad={(e) => {
                  const { naturalWidth, naturalHeight } = e.target;
                  const scaleRatio = Math.max(256 / naturalWidth, 256 / naturalHeight);
                  setImgSize({ w: naturalWidth * scaleRatio, h: naturalHeight * scaleRatio });
                }}
                style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: imgSize.w, height: imgSize.h,
                  transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px)) scale(${crop.scale})`,
                  maxWidth: 'none'
                }} 
                draggable="false" alt="Crop Preview"
              />
            </div>

            <div className="w-full mt-8 space-y-2">
              <label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Zoom</label>
              <input type="range" min="1" max="3" step="0.01" value={crop.scale} onChange={(e) => setCrop({ ...crop, scale: parseFloat(e.target.value) })} className="w-full accent-blue-600" />
            </div>

            <div className="flex gap-4 mt-8 w-full">
              <button onClick={() => { setCropModalOpen(false); setTempImg(null); }} className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-bold transition-all active:scale-95">
                Cancel
              </button>
              <button onClick={handleCropSave} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95">
                Save Image
              </button>
            </div>
          </div>
        </div>
      )}
      <Chatbot />
    </div>
  );
};

export default VoterDashboard;