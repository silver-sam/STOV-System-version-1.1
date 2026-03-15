import { useState, useEffect, useContext, useRef } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import AuthContext from '../../context/AuthContext';
import { Vote, CheckCircle, AlertCircle, ShieldCheck, Camera, ScanFace } from 'lucide-react';

const VoterDashboard = () => {
  const { isAdmin } = useContext(AuthContext);
  const [elections, setElections] = useState([]);
  const [selectedElection, setSelectedElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isLoadingElections, setIsLoadingElections] = useState(true);
  const [electionsError, setElectionsError] = useState('');
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Camera & Face Verification State
  const [cameraActive, setCameraActive] = useState(false);
  const [verifyingFace, setVerifyingFace] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const autoVerifyRef = useRef(false);

  // 1. Fetch Active Elections on Load
  useEffect(() => {
    const fetchElections = async () => {
      setIsLoadingElections(true);
      try {
        const res = await apiClient.get('/elections/');
        setElections(res.data);
      } catch (err) {
        console.error(err);
        setElectionsError('Failed to load active elections. Please try again later.');
      } finally {
        setIsLoadingElections(false);
      }
    };
    fetchElections();
  }, []);

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

      const context = canvasRef.current.getContext('2d');
      context.drawImage(videoRef.current, 0, 0, 640, 480);
      const faceImageBase64 = canvasRef.current.toDataURL('image/jpeg');

      try {
        await apiClient.post('/verify-face/', { image: faceImageBase64 });
        stopCamera();
        await handleCastVote();
      } catch (err) {
        // Streams live feedback from the Python backend (e.g., "Multiple faces", "Score 0.68")
        setError(err.response?.data?.detail || 'Scanning... Please look directly at the camera.');
        autoVerifyRef.current = false;
        if (cameraActive) {
          timeoutId = setTimeout(performAutoVerification, 1500); // Try again in 1.5 seconds
        }
      }
    };

    if (cameraActive) {
      autoVerifyRef.current = false;
      timeoutId = setTimeout(performAutoVerification, 1000);
    }

    return () => clearTimeout(timeoutId);
  }, [cameraActive, selectedCandidateIndex, selectedElection]); // Dependencies ensure fresh state

  const handleCastVote = async () => {
    if (selectedCandidateIndex === null) return;
    setLoading(true);
    setError('Face verified! Encrypting and casting vote...');
    
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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b border-gray-700 pb-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-blue-500 flex items-center gap-3">
              <Vote className="text-blue-500" /> Voter Dashboard
            </h1>
            <p className="text-gray-400 mt-2 text-sm">Secure, Anonymous, and Immutable Voting.</p>
          </div>
          {isAdmin && (
            <Link to="/admin" className="text-sm bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded border border-gray-600 transition">
               Switch to Admin View
            </Link>
          )}
        </header>

        {/* VIEW 1: LIST OF ELECTIONS */}
        {!selectedElection && (
          <div className="grid gap-6 md:grid-cols-2">
            {isLoadingElections ? (
              <div className="col-span-2 text-center py-10 text-gray-500 bg-gray-800/50 rounded-xl border border-gray-700 border-dashed">
                Loading active elections...
              </div>
            ) : electionsError ? (
              <div className="col-span-2 text-center py-10 text-red-400 bg-red-900/20 rounded-xl border border-red-800 border-dashed flex justify-center items-center gap-2">
                <AlertCircle size={20}/> {electionsError}
              </div>
            ) : elections.length === 0 ? (
              <div className="col-span-2 text-center py-10 text-gray-500 bg-gray-800/50 rounded-xl border border-gray-700 border-dashed">
                No active elections found.
              </div>
            ) : (
              elections.map((election) => (
                <div key={election.id} className="bg-gray-800 p-6 rounded-xl border border-gray-700 hover:border-blue-500 transition cursor-pointer group" onClick={() => handleSelectElection(election)}>
                  <h3 className="text-xl font-semibold mb-2 group-hover:text-blue-400 transition">{election.title}</h3>
                  <span className="text-xs font-mono bg-blue-900/50 text-blue-200 px-2 py-1 rounded">ID: {election.id}</span>
                  <div className="mt-4 text-gray-400 text-sm flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Click to Vote &rarr;
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* VIEW 2: VOTING BOOTH */}
        {selectedElection && !receipt && (
          <div className="bg-gray-800 p-8 rounded-xl border border-gray-700">
            <button onClick={() => {
              setSelectedElection(null);
              stopCamera();
            }} className="text-sm text-gray-400 hover:text-white mb-4">&larr; Back to Elections</button>
            <h2 className="text-2xl font-bold mb-6">Ballot: <span className="text-blue-400">{selectedElection.title}</span></h2>
            
            {error && <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded text-red-200 flex items-center gap-2"><AlertCircle size={20}/> {error}</div>}

            <div className="space-y-3 mb-8">
              {candidates.map((candidate) => (
                <label key={candidate.db_id} className={`flex items-center p-4 rounded-lg border cursor-pointer transition ${selectedCandidateIndex === candidate.candidate_index ? 'bg-blue-900/30 border-blue-500' : 'bg-gray-700/30 border-gray-600 hover:bg-gray-700'}`}>
                  <input 
                    type="radio" 
                    name="candidate" 
                    className="w-5 h-5 text-blue-600"
                    checked={selectedCandidateIndex === candidate.candidate_index}
                    onChange={() => setSelectedCandidateIndex(candidate.candidate_index)}
                    disabled={cameraActive || loading}
                  />
                  <span className="ml-3 text-lg">{candidate.name}</span>
                </label>
              ))}
            </div>

            {!cameraActive ? (
              <button 
                onClick={startCamera}
                disabled={selectedCandidateIndex === null}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg transition text-lg shadow-lg flex items-center justify-center gap-2"
              >
                <Camera size={20} /> Verify Face to Vote
              </button>
            ) : (
              <div className="flex flex-col items-center bg-gray-900 p-6 rounded-lg border border-gray-700">
                <div className="mb-4 text-center">
                  <ScanFace className="w-8 h-8 text-blue-400 mx-auto mb-2 animate-pulse" />
                  <p className="text-sm text-gray-300 font-semibold">Auto-detecting face...</p>
                  <p className="text-xs text-gray-500">Position your face inside the dashed oval</p>
                </div>
                <div className="relative w-full max-w-sm mb-4">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg border border-gray-600 bg-black transform scale-x-[-1]" />
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-1/2 h-3/4 border-4 border-dashed border-blue-500/70 rounded-[50%] pointer-events-none z-10 animate-pulse"></div>
                </div>
                <canvas ref={canvasRef} width="640" height="480" className="hidden" />
                <div className="w-full bg-gray-800 border border-gray-600 text-gray-400 font-bold py-3 rounded-lg flex items-center justify-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-t-blue-500 animate-spin"></div>
                  Processing stream...
                </div>
              </div>
            )}
            <p className="text-center text-xs text-gray-500 mt-4">Your identity is verified locally/securely before encrypting and anchoring your vote.</p>
          </div>
        )}

        {/* VIEW 3: RECEIPT */}
        {receipt && (
          <div className="bg-gray-800 p-8 rounded-xl border border-green-500/50 shadow-2xl shadow-green-900/20">
            <div className="text-center mb-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-white">Vote Recorded!</h2>
              <p className="text-gray-400">Your ballot has been successfully encrypted and stored.</p>
            </div>

            <div className="space-y-4 bg-gray-900 p-6 rounded-lg border border-gray-700 font-mono text-sm break-all">
              <div>
                <span className="text-gray-500 block text-xs uppercase mb-1">Receipt ID</span>
                <span className="text-yellow-400 select-all">{receipt.receipt_id}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs uppercase mb-1">Blockchain Transaction Hash</span>
                <span className="text-blue-400 select-all">{receipt.blockchain_transaction_hash}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-xs uppercase mb-1">Digital Fingerprint</span>
                <span className="text-purple-400 select-all">{receipt.digital_fingerprint}</span>
              </div>
            </div>

            <div className="mt-8 flex justify-center">
              <button onClick={() => { setSelectedElection(null); setReceipt(null); }} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition">
                Return to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoterDashboard;