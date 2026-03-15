import { useState, useEffect, useContext, useRef } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import AuthContext from '../../context/AuthContext';
import { Vote, CheckCircle, AlertCircle, ShieldCheck, Camera } from 'lucide-react';

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

  // 4. Verify Face and Submit Vote
  const handleVerifyAndVote = async () => {
    if (!videoRef.current) return;
    setVerifyingFace(true);
    setError('');

    // Draw current video frame to canvas to get base64 image
    const context = canvasRef.current.getContext('2d');
    context.drawImage(videoRef.current, 0, 0, 320, 240);
    const faceImageBase64 = canvasRef.current.toDataURL('image/jpeg');

    try {
      // 1. Send image to your backend to verify against the user's profile
      await apiClient.post('/verify-face/', { image: faceImageBase64 });
      
      // 2. If verified, stop the camera and cast the actual vote
      stopCamera();
      await handleCastVote();
    } catch (err) {
      setError(err.response?.data?.detail || 'Face verification failed. Make sure your face is clearly visible.');
      setVerifyingFace(false);
    }
  };

  const handleCastVote = async () => {
    if (selectedCandidateIndex === null) return;
    setLoading(true);
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
                <p className="mb-4 text-sm text-gray-300">Please look directly at the camera to verify your identity.</p>
                <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-sm rounded-lg border border-gray-600 mb-4 bg-black transform scale-x-[-1]" />
                <canvas ref={canvasRef} width="320" height="240" className="hidden" />
                
                <button 
                  onClick={handleVerifyAndVote}
                  disabled={verifyingFace || loading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg transition text-lg shadow-lg flex items-center justify-center gap-2"
                >
                  {verifyingFace || loading ? 'Verifying Identity & Voting...' : <><ShieldCheck size={20} /> Capture & Cast Vote</>}
                </button>
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