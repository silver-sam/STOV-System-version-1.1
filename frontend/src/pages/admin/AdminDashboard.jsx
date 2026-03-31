import { useState, useEffect, useContext } from 'react';
import apiClient from '../../api/client';
import { useNavigate } from 'react-router-dom';
import AuthContext from '../../context/AuthContext';
import { Plus, Save, Users, Vote, ShieldAlert, Scale, RefreshCw, Sun, Moon, User, LogOut, AlertCircle, Activity, PieChart, Download, Trash2, Menu, X, Check, Rocket, Inbox, KeyRound, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'create' | 'tally' | 'profile'
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();

  // --- ANALYTICS STATE ---
  const [analyticsData, setAnalyticsData] = useState(null);
  const [resetVoterId, setResetVoterId] = useState('');
  const [deleteVoterId, setDeleteVoterId] = useState('');

  // --- MFA Reset Modal State ---
  const [mfaResetModalOpen, setMfaResetModalOpen] = useState(false);
  const [mfaResetData, setMfaResetData] = useState(null);
  const [mfaResetCopied, setMfaResetCopied] = useState(false);

  // --- ELECTION CREATION STATE ---
  const [electionTitle, setElectionTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isExclusive, setIsExclusive] = useState(false);
  const [createdElection, setCreatedElection] = useState(null);
  const [candidateName, setCandidateName] = useState('');
  const [candidateParty, setCandidateParty] = useState('');
  const [candidatePhoto, setCandidatePhoto] = useState(null);
  const [currentCandidates, setCurrentCandidates] = useState([]);

  // --- TALLY & AUDIT STATE ---
  const [allElections, setAllElections] = useState([]);
  const [tallyElectionId, setTallyElectionId] = useState(null);
  const [tallyResults, setTallyResults] = useState(null);
  const [auditResults, setAuditResults] = useState(null);
  const [profile, setProfile] = useState({ name: 'Loading...', email: 'Loading...', voter_id: 'Loading...' });
  const [avatar, setAvatar] = useState(null);
  const [supportTickets, setSupportTickets] = useState([]);

  // Cropper State
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImg, setTempImg] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, scale: 1 });
  const [imgSize, setImgSize] = useState({ w: 256, h: 256 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

  // Fetch Analytics
  const fetchAnalytics = async () => {
    try {
      const res = await apiClient.get('/admin/analytics/');
      setAnalyticsData(res.data);
    } catch (err) {
      setError('Could not fetch analytics.');
    }
  };

  // Fetch Support Tickets
  const fetchTickets = async () => {
    try {
      const res = await apiClient.get('/admin/support-tickets/');
      setSupportTickets(res.data);
    } catch (err) {
      setError('Could not fetch support tickets.');
    }
  };

  // 3. Create Election
  const handleCreateElection = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      const payload = { title: electionTitle, is_exclusive: isExclusive };
      if (startTime) payload.start_time = startTime;
      if (endTime) payload.end_time = endTime;
      const res = await apiClient.post('/create-election/', payload);
      setCreatedElection(res.data);
      setCurrentCandidates([]);
      setMessage('Election created successfully!');
      setElectionTitle('');
      setStartTime('');
      setEndTime('');
      setIsExclusive(false);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create election.');
    }
  };

  // Resolve Support Ticket
  const handleResolveTicket = async (ticketId) => {
    try {
      await apiClient.put(`/admin/support-tickets/${ticketId}/resolve`);
      fetchTickets(); // Refresh lists
      fetchAnalytics(); // Refresh badge count
    } catch (err) {
      setError('Failed to resolve ticket.');
    }
  };

  // Handle Candidate Photo Upload
  const handleCandidatePhoto = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCandidatePhoto(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // Helper to fetch candidates for the current setup
  const fetchCurrentCandidates = async (electionId) => {
    try {
      const res = await apiClient.get(`/candidates/${electionId}`);
      setCurrentCandidates(res.data);
    } catch (err) {
      console.error('Could not fetch candidates', err);
    }
  };

  // 4. Add Candidate
  const handleAddCandidate = async (e) => {
    e.preventDefault();
    if (!createdElection) return;
    try {
      await apiClient.post('/candidates/', { 
        election_id: createdElection.election_id, 
        name: candidateName,
        party: candidateParty,
        photo: candidatePhoto
      });
      setMessage(`Candidate '${candidateName}' added successfully.`);
      setCandidateName('');
      setCandidateParty('');
      setCandidatePhoto(null);
      fetchCurrentCandidates(createdElection.election_id);
    } catch (err) {
      setError('Failed to add candidate.');
    }
  };

  // Publish an election
  const handlePublishElection = async (electionId) => {
    setMessage(''); setError('');
    try {
      await apiClient.put(`/elections/${electionId}/publish`);
      setMessage('Election is now LIVE and visible to voters!');
      // Reset the creation wizard if publishing from there
      if (activeTab === 'create' && createdElection?.election_id === electionId) {
        setCreatedElection(null);
        setElectionTitle('');
        setStartTime('');
        setEndTime('');
        setIsExclusive(false);
        setCurrentCandidates([]);
      }
      fetchAllElections();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to publish election.');
    }
  };

  // Delete Candidate
  const handleDeleteCandidate = async (candidateId) => {
    if (!createdElection) return;
    try {
      await apiClient.delete(`/candidates/${candidateId}`);
      setMessage('Candidate removed successfully.');
      fetchCurrentCandidates(createdElection.election_id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove candidate.');
    }
  };

  // 5. Fetch all elections for the Tally tab
  const fetchAllElections = async () => {
    try {
      const res = await apiClient.get('/admin/elections/');
      setAllElections(res.data);
    } catch (err) {
      setError('Could not fetch elections.');
    }
  };

  // 6. Close an election
  const handleCloseElection = async (electionId) => {
    setMessage(''); setError('');
    try {
      await apiClient.put(`/elections/${electionId}/close`);
      setMessage('Election closed successfully. You can now tally the results.');
      fetchAllElections(); // Refresh the list
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to close election.');
    }
  };

  // Delete Election
  const handleDeleteElection = async (electionId) => {
    if (!window.confirm("Are you sure you want to permanently delete this election? This cannot be undone.")) return;
    setMessage(''); setError('');
    try {
      await apiClient.delete(`/elections/${electionId}`);
      setMessage('Election deleted successfully.');
      fetchAllElections();
      if (tallyElectionId === electionId) {
        setTallyElectionId(null);
        setTallyResults(null);
        setAuditResults(null);
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete election.');
    }
  };

  // 7. Tally and Audit
  const handleTallyAndAudit = async (e) => {
    e.preventDefault();
    setMessage(''); setError(''); setTallyResults(null); setAuditResults(null);
    try {
      // Tally first
      const tallyRes = await apiClient.post('/tally-election/', {
        election_id: tallyElectionId
      });
      setTallyResults(tallyRes.data);

      // Then Audit
      const auditRes = await apiClient.get(`/audit-election/${tallyElectionId}`);
      setAuditResults(auditRes.data);

    } catch (err) {
      setError(err.response?.data?.detail || 'Tally/Audit process failed.');
    }
  };

  // Fetch elections when the tally tab is activated
  useEffect(() => { if (activeTab === 'tally') fetchAllElections(); }, [activeTab]);
  
  // Fetch analytics when the analytics tab is activated
  useEffect(() => {
    fetchAnalytics(); // Run once on mount for the badge
  }, []);
  
  // Fetch data depending on active tab
  useEffect(() => {
    if (activeTab === 'analytics') fetchAnalytics();
    if (activeTab === 'inbox') fetchTickets();
  }, [activeTab]);

  // Fetch Profile Data on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await apiClient.get('/profile/');
        setProfile(res.data);
        if (res.data.avatar) setAvatar(res.data.avatar);
      } catch (err) {
        console.error("Failed to load profile", err);
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

  // Touch & Mouse Drag Handlers
  const handlePointerDown = (e) => { setIsDragging(true); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; setDragStart({ x: clientX - crop.x, y: clientY - crop.y }); };
  const handlePointerMove = (e) => { if (!isDragging) return; const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; setCrop({ ...crop, x: clientX - dragStart.x, y: clientY - dragStart.y }); };
  const handlePointerUp = () => setIsDragging(false);

  // --- PIE CHART HELPERS ---
  const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#0ea5e9'];

  const getPieChartStyle = (results) => {
    if (!results) return {};
    const total = Object.values(results).reduce((acc, val) => acc + val, 0);
    
    // If no votes have been cast yet, render a gray circle
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

  // --- EXPORT TO CSV ---
  const exportResultsCSV = () => {
    if (!tallyResults) return;
    
    const election = allElections.find(e => e.id === tallyElectionId);
    const electionTitle = election ? election.title : `Election_${tallyElectionId}`;
    
    let csvContent = "Candidate,Votes,Percentage\n";
    const total = tallyResults.total_votes_counted;
    
    Object.entries(tallyResults.official_results).forEach(([candidate, votes]) => {
      const percentage = total > 0 ? ((votes / total) * 100).toFixed(1) : 0;
      csvContent += `"${candidate}",${votes},${percentage}%\n`;
    });
    csvContent += `\nTotal Votes Counted,${total},\n`;
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${electionTitle.replace(/\s+/g, '_')}_Results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- EXPORT TO PDF ---
  const handleDownloadResultsPDF = () => {
    if (!tallyResults) return;
    
    const election = allElections.find(e => e.id === tallyElectionId);
    const electionTitle = election ? election.title : `Election_${tallyElectionId}`;
    const total = tallyResults.total_votes_counted;
    
    let resultsHtmlRows = '';
    Object.entries(tallyResults.official_results).forEach(([candidate, votes]) => {
      const percentage = total > 0 ? ((votes / total) * 100).toFixed(1) : 0;
      const party = tallyResults.candidate_details?.[candidate]?.party;
      const candidateText = party ? `${candidate} <span style="font-weight:normal;color:#6b7280;font-size:14px;">(${party})</span>` : candidate;
      resultsHtmlRows += `
        <div class="r-row">
          <div class="r-candidate">${candidateText}</div>
          <div class="r-stats">${votes} votes (${percentage}%)</div>
        </div>
      `;
    });

    const printContainer = document.createElement('div');
    printContainer.id = 'results-print-container';
    
    printContainer.innerHTML = `
      <div class="r-header">
        <div class="r-logo">AegisElect</div>
        <div class="r-title">${electionTitle}</div>
        <div class="r-success">✓ Official Certified Results</div>
      </div>
      <div class="r-box">
        ${resultsHtmlRows}
        <div class="r-total-box">
          <div class="r-total-label">Total Votes Counted</div>
          <div class="r-total-val">${total}</div>
        </div>
      </div>
      <div class="r-footer">
        Generated on ${new Date().toLocaleString()} by AegisElect Administrator.
        <br><br>
        <strong>These results are cryptographically verified and backed by the blockchain ledger.</strong>
      </div>
    `;

    const style = document.createElement('style');
    style.innerHTML = `
      @media screen {
        #results-print-container { display: none; }
      }
      @media print {
        body > :not(#results-print-container) { display: none !important; }
        #results-print-container { 
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
        .r-title { color: #111827; font-size: 20px; font-weight: bold; margin-bottom: 8px; }
        .r-success { color: #16a34a; font-size: 16px; font-weight: bold; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .r-box { background: #f8fafc; border: 1px solid #e5e7eb; padding: 30px; border-radius: 16px; margin-bottom: 24px; }
        .r-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
        .r-row:last-child { border-bottom: none; }
        .r-candidate { font-size: 16px; font-weight: bold; color: #111827; }
        .r-stats { font-size: 16px; color: #4b5563; font-variant-numeric: tabular-nums; }
        .r-total-box { margin-top: 20px; padding-top: 20px; border-top: 2px solid #cbd5e1; display: flex; justify-content: space-between; align-items: center; }
        .r-total-label { font-size: 14px; text-transform: uppercase; font-weight: 800; color: #6b7280; letter-spacing: 0.05em; }
        .r-total-val { font-size: 20px; font-weight: 900; color: #2563eb; }
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

  // --- EXPORT VOTERS ---
  const handleExportVotersCSV = async () => {
    try {
      const res = await apiClient.get('/admin/voters-export/');
      const voters = res.data;
      
      if (voters.length === 0) {
        alert("No registered voters found.");
        return;
      }
      
      let csvContent = "Voter ID,Full Name,Email Address\n";
      voters.forEach(v => {
        const name = (v.name || "Unknown").replace(/"/g, '""');
        const email = (v.email || "Unknown").replace(/"/g, '""');
        csvContent += `"${v.voter_id}","${name}","${email}"\n`;
      });
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `AegisElect_Registered_Voters_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setError('Failed to export voters list.');
    }
  };

  // --- RESET VOTER MFA ---
  const handleResetMFA = async (voterId) => {
    if (!voterId) {
      setError('Voter ID is required to reset MFA.');
      return;
    }
    if (!window.confirm(`Are you sure you want to reset the MFA for '${voterId}'? This will invalidate their current authenticator app.`)) return;
    
    setMessage(''); setError('');
    try {
      const res = await apiClient.post('/admin/reset-mfa/', { voter_id: voterId });
      setMfaResetData({ voter_id: voterId, ...res.data });
      setMfaResetModalOpen(true);
      setMessage(res.data.message); // Show success message in main view
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to reset MFA.');
    }
  };

  // --- DELETE VOTER ACCOUNT ---
  const handleDeleteVoter = async (e) => {
    e.preventDefault();
    if (!window.confirm(`Are you sure you want to permanently delete the account for '${deleteVoterId}'? This cannot be undone.`)) return;
    setMessage(''); setError('');
    try {
      const res = await apiClient.delete(`/admin/voters/${encodeURIComponent(deleteVoterId)}`);
      setMessage(res.data.message);
      setDeleteVoterId('');
      fetchAnalytics();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete voter account.');
    }
  };

  // --- GROUP ELECTIONS ---
  const exclusiveElections = allElections.filter(e => e.is_exclusive);
  const generalElections = allElections.filter(e => !e.is_exclusive);

  const renderAdminElectionCard = (election) => (
    <div key={election.id} className="bg-gray-50 dark:bg-gray-900 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 shadow-sm">
      <div>
        <span className={`text-xs font-extrabold px-3 py-1.5 rounded-md uppercase tracking-wider ${election.status === 'active' ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : election.status === 'setup' ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'}`}>
          {election.status === 'active' ? 'ACTIVE' : election.status === 'setup' ? 'SETUP' : 'CLOSED'}
        </span>
        <p className="font-bold text-lg mt-3 text-gray-900 dark:text-white">
          {election.title}
          {election.is_exclusive && (
            <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 px-2 py-0.5 rounded text-[10px] font-extrabold ml-3 uppercase tracking-wider align-middle">Exclusive</span>
          )}
        </p>
        {(election.start_time || election.end_time) && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 font-medium">
            {election.start_time && <span>Starts: {new Date(election.start_time).toLocaleString()} </span>}
            {election.start_time && election.end_time && <span className="mx-1">|</span>}
            {election.end_time && <span>Ends: {new Date(election.end_time).toLocaleString()}</span>}
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
            <Users size={14} className="text-blue-500" />
            {election.vote_count} / {election.total_eligible} Votes
          </div>
          <div className="hidden sm:block w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
            <div 
              className={`h-full rounded-full ${election.vote_count === election.total_eligible && election.total_eligible > 0 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${election.total_eligible > 0 ? (election.vote_count / election.total_eligible) * 100 : 0}%` }}
            ></div>
          </div>
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
            {election.total_eligible > 0 ? ((election.vote_count / election.total_eligible) * 100).toFixed(1) : 0}%
          </span>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row w-full sm:w-auto gap-2 sm:gap-3">
        {election.status === 'setup' && (
          <button onClick={() => handlePublishElection(election.id)} className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow transition-all active:scale-95 flex justify-center items-center gap-2">
            <Rocket size={16} /> Go Live
          </button>
        )}
        {election.status === 'active' && (
          <button onClick={() => handleCloseElection(election.id)} className="flex-1 sm:flex-none bg-yellow-600 hover:bg-yellow-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow transition-all active:scale-95">
            Close Voting
          </button>
        )}
        {election.status === 'closed' && (
          <button onClick={() => { setTallyElectionId(election.id); setTallyResults(null); setAuditResults(null); }} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow transition-all active:scale-95">
            Tally / Audit
          </button>
        )}
        <button onClick={() => handleDeleteElection(election.id)} className="flex-1 sm:flex-none bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 px-4 py-2.5 rounded-xl text-sm font-bold shadow transition-all active:scale-95 flex items-center justify-center">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
      
      {/* Mobile Top Bar */}
      <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <h1 className="text-xl font-black text-blue-600 dark:text-blue-500 flex items-center gap-2 tracking-wide">
          <ShieldAlert size={24} /> AegisElect Admin
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
          <h1 className="text-2xl font-black text-blue-600 dark:text-blue-500 flex items-center gap-2 tracking-wide">
            <ShieldAlert size={24} className="flex-shrink-0" /> <span className="truncate">AegisElect Admin</span>
          </h1>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Profile Card */}
        <div className="p-6 pb-2">
          <div className="flex items-center gap-4 bg-gray-100 dark:bg-gray-700 p-4 rounded-2xl shadow-inner border border-gray-200 dark:border-gray-600">
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-10 h-10 rounded-full object-cover shadow-md border-2 border-white dark:border-gray-800 flex-shrink-0" />
            ) : (
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-full text-white shadow-md flex-shrink-0">
                <User size={24} />
              </div>
            )}
            <div className="overflow-hidden">
              <p className="font-bold text-sm truncate">{profile.name !== 'Loading...' ? profile.name : 'Administrator'}</p>
              <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider mt-0.5 truncate">
                {profile.voter_id !== 'Loading...' ? profile.voter_id : 'Master Access'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
          <button 
            onClick={() => { setActiveTab('analytics'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Activity size={20} /> System Analytics
          </button>
          <button 
            onClick={() => { setActiveTab('create'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'create' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Vote size={20} /> New Election
          </button>
          <button 
            onClick={() => { setActiveTab('tally'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'tally' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Scale size={20} /> Tally & Audit
          </button>
          <button 
            onClick={() => { setActiveTab('inbox'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'inbox' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Inbox size={20} /> <span className="flex-1 text-left">Support Inbox</span>
            {analyticsData?.pending_tickets > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{analyticsData.pending_tickets}</span>}
          </button>
          
          <button 
            onClick={() => { setActiveTab('profile'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'profile' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <User size={20} /> My Profile
          </button>
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

        {/* Status Messages */}
        {message && <div className="mb-4 p-4 bg-green-100 dark:bg-green-900/50 border border-green-400 dark:border-green-500 rounded-xl text-green-700 dark:text-green-200 font-medium">{message}</div>}
        {error && <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 rounded-xl text-red-700 dark:text-red-200 font-medium">{error}</div>}

        {/* TAB 1: SYSTEM ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl sm:text-2xl font-bold">System Analytics</h2>
              <div className="flex items-center gap-3 sm:gap-4">
                <button onClick={handleExportVotersCSV} className="text-sm font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 sm:px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-2">
                  <Download size={16} /> <span className="hidden sm:inline">Export Voters</span>
                </button>
                <button onClick={fetchAnalytics} className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2 transition-colors">
                  <RefreshCw size={16}/> <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>
            
            {analyticsData ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-5 sm:p-6 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-sm">
                  <p className="text-blue-600 dark:text-blue-400 text-sm font-bold uppercase tracking-wider mb-2">Registered Voters</p>
                  <div className="flex items-center gap-4">
                    <Users className="w-10 h-10 text-blue-500 opacity-80" />
                    <p className="text-4xl font-black text-blue-900 dark:text-blue-100">{analyticsData.total_registered_voters}</p>
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-5 sm:p-6 rounded-2xl border border-green-200 dark:border-green-800 shadow-sm">
                  <p className="text-green-600 dark:text-green-400 text-sm font-bold uppercase tracking-wider mb-2">Voters Who Voted</p>
                  <div className="flex items-center gap-4">
                    <Activity className="w-10 h-10 text-green-500 opacity-80" />
                    <p className="text-4xl font-black text-green-900 dark:text-green-100">{analyticsData.voters_who_voted}</p>
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-5 sm:p-6 rounded-2xl border border-purple-200 dark:border-purple-800 shadow-sm">
                  <p className="text-purple-600 dark:text-purple-400 text-sm font-bold uppercase tracking-wider mb-2">Total Ballots Cast</p>
                  <div className="flex items-center gap-4">
                    <Vote className="w-10 h-10 text-purple-500 opacity-80" />
                    <p className="text-4xl font-black text-purple-900 dark:text-purple-100">{analyticsData.total_ballots_cast}</p>
                  </div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 p-5 sm:p-6 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-sm">
                  <p className="text-amber-600 dark:text-amber-400 text-sm font-bold uppercase tracking-wider mb-2">Total Elections</p>
                  <div className="flex items-center gap-4">
                    <Scale className="w-10 h-10 text-amber-500 opacity-80" />
                    <p className="text-4xl font-black text-amber-900 dark:text-amber-100">{analyticsData.total_elections}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-gray-500 bg-gray-100 dark:bg-gray-800/50 rounded-3xl border border-gray-300 dark:border-gray-700 border-dashed">
                Loading analytics data...
              </div>
            )}

            {/* MFA Reset Section */}
            <div className="mt-10 bg-blue-50 dark:bg-blue-900/10 p-6 sm:p-8 rounded-3xl border border-blue-200 dark:border-blue-800/30 shadow-sm">
              <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-2">
                <KeyRound size={20} /> Reset User MFA
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                If a user has lost their authenticator app, you can generate a new MFA secret for them here. Their password and voting history will remain unchanged.
              </p>
              <form onSubmit={(e) => { e.preventDefault(); handleResetMFA(resetVoterId); }} className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                <div className="flex-1 w-full max-w-md">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Voter ID</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. EMP-1234, NAT-5678, or Student ID"
                    value={resetVoterId}
                    onChange={(e) => setResetVoterId(e.target.value)}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm font-mono"
                  />
                </div>
                <button type="submit" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow transition-all active:scale-95 flex items-center justify-center gap-2">
                  <RefreshCw size={20} /> Reset MFA
                </button>
              </form>
            </div>

            {/* DANGER ZONE: Delete Account */}
            <div className="mt-10 bg-red-50 dark:bg-red-900/10 p-6 sm:p-8 rounded-3xl border border-red-200 dark:border-red-800/30 shadow-sm">
              <h3 className="text-lg font-bold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
                <ShieldAlert size={20} /> Danger Zone: Delete Voter Account
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                This will <strong className="text-red-600 dark:text-red-400">permanently delete</strong> a user's account, including their face model and credentials. They will need to re-register. Use this as a last resort.
              </p>
              <form onSubmit={handleDeleteVoter} className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                <div className="flex-1 w-full max-w-md">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Voter ID</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. EMP-1234, NAT-5678, or Student ID"
                    value={deleteVoterId}
                    onChange={(e) => setDeleteVoterId(e.target.value)}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 outline-none transition-all shadow-sm font-mono"
                  />
                </div>
                <button type="submit" className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-xl font-bold shadow transition-all active:scale-95 flex items-center justify-center gap-2">
                  <Trash2 size={20} /> Delete Account
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: CREATE ELECTION */}
        {activeTab === 'create' && (
          <div className="max-w-3xl mx-auto space-y-8">
            <div className="mb-8">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">Election Setup</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">Follow the steps below to configure a secure blockchain election.</p>
            </div>

            {/* Step 1: Define Election Title */}
            <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
              <h3 className="text-lg sm:text-xl font-bold mb-6 flex items-center gap-3">
                <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm">1</span>
                Define Election Title
              </h3>
              <div className="ml-11">
                <form onSubmit={handleCreateElection} className="flex flex-col gap-4">
                  <div className="w-full">
                    <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Election Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Class President 2024"
                      value={electionTitle}
                      onChange={(e) => setElectionTitle(e.target.value)}
                      disabled={!!createdElection}
                      className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 w-full">
                      <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Start Time <span className="text-xs font-normal text-gray-400">(Optional)</span></label>
                      <input 
                        type="datetime-local" 
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        disabled={!!createdElection}
                        className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="flex-1 w-full">
                      <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">End Time <span className="text-xs font-normal text-gray-400">(Optional)</span></label>
                      <input 
                        type="datetime-local" 
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        disabled={!!createdElection}
                        className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="mt-1 flex items-start sm:items-center gap-3">
                    <input 
                      type="checkbox" 
                      id="isExclusive"
                      checked={isExclusive}
                      onChange={(e) => setIsExclusive(e.target.checked)}
                      disabled={!!createdElection}
                      className="mt-1 sm:mt-0 w-5 h-5 text-blue-600 bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 disabled:opacity-60 flex-shrink-0"
                    />
                    <label htmlFor="isExclusive" className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                      Exclusive Election <span className="text-xs font-normal text-gray-500 block sm:inline sm:ml-1">(Voters can only participate in ONE exclusive election)</span>
                    </label>
                  </div>
                  <div className="mt-2 flex justify-end">
                    {!createdElection ? (
                      <button type="submit" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold shadow-md transition-all active:scale-95 flex justify-center items-center gap-2">
                        <Plus size={20} /> Create
                      </button>
                    ) : (
                      <div className="w-full sm:w-auto bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-8 py-3 rounded-xl font-bold flex justify-center items-center gap-2 border border-green-200 dark:border-green-800">
                        <Check size={20} /> Created
                      </div>
                    )}
                  </div>
                </form>
              </div>
            </div>

            {/* Step 2: Add Candidates */}
            <div className={`bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl relative overflow-hidden transition-opacity duration-300 ${!createdElection ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="absolute top-0 left-0 w-2 h-full bg-green-500"></div>
              <h3 className="text-lg sm:text-xl font-bold mb-6 flex items-center gap-3">
                <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm">2</span>
                Add Candidates
              </h3>
              
              <div className="ml-11">
                <form onSubmit={handleAddCandidate} className="mb-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Candidate Full Name *</label>
                      <input 
                        type="text" 
                        placeholder="e.g. william Ruto"
                        value={candidateName}
                        onChange={(e) => setCandidateName(e.target.value)}
                        disabled={!createdElection}
                        className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition-all disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Party / Affiliation <span className="text-xs font-normal">(Optional)</span></label>
                      <input 
                        type="text" 
                        placeholder="e.g. Independent"
                        value={candidateParty}
                        onChange={(e) => setCandidateParty(e.target.value)}
                        disabled={!createdElection}
                        className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                    <div className="w-full sm:w-1/2">
                      <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Profile Photo <span className="text-xs font-normal">(Optional)</span></label>
                      <input type="file" accept="image/*" onChange={handleCandidatePhoto} disabled={!createdElection} className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 dark:file:bg-gray-700 dark:file:text-gray-300 disabled:opacity-50 transition-all cursor-pointer" />
                    </div>
                    <button type="submit" disabled={!createdElection || !candidateName.trim()} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-8 py-3 rounded-xl font-bold shadow-md transition-all active:scale-95 flex justify-center items-center gap-2">
                      <Save size={20} /> Add Candidate
                    </button>
                  </div>
                </form>

                {/* Display Current Candidates Being Added */}
                {currentCandidates.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Registered Candidates</h4>
                    {currentCandidates.map((c, index) => (
                      <div key={c.db_id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm transition-all hover:border-gray-300 dark:hover:border-gray-600">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0 shadow-sm flex items-center justify-center relative">
                            {c.photo ? (
                              <img src={c.photo} alt={c.name} className="w-full h-full object-cover" />
                            ) : (
                              <User size={24} className="text-gray-400" />
                            )}
                            <div className="absolute -bottom-1 -right-1 bg-green-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold border-2 border-white dark:border-gray-800">{index + 1}</div>
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 dark:text-white text-lg block">{c.name}</span>
                            {c.party && <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{c.party}</span>}
                          </div>
                        </div>
                        <button type="button" onClick={() => handleDeleteCandidate(c.db_id)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-2 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-lg transition-colors shadow-sm" title="Remove candidate">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Publish Election */}
            <div className={`bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl relative overflow-hidden transition-opacity duration-300 ${!createdElection || currentCandidates.length < 2 ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="absolute top-0 left-0 w-2 h-full bg-purple-500"></div>
              <h3 className="text-lg sm:text-xl font-bold mb-4 flex items-center gap-3">
                <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-sm">3</span>
                Publish Election
              </h3>
              <div className="ml-11">
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm leading-relaxed">Everything is set up. Click below to make this election visible to voters so they can begin casting their ballots.</p>
                <button type="button" onClick={() => handlePublishElection(createdElection.election_id)} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-bold shadow-md transition-all active:scale-95 flex justify-center items-center gap-2">
                  <Rocket size={20} /> Go Live
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TALLY & AUDIT */}
        {activeTab === 'tally' && (
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl sm:text-2xl font-bold">Manage Elections</h2>
              <button onClick={fetchAllElections} className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2 transition-colors"><RefreshCw size={16}/> Refresh</button>
            </div>
            
            {allElections.length === 0 ? (
              <div className="text-center py-10 text-gray-500 bg-gray-100 dark:bg-gray-800/50 rounded-3xl border border-gray-300 dark:border-gray-700 border-dashed">
                No elections created yet.
              </div>
            ) : (
              <div className="space-y-8">
                {exclusiveElections.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-purple-700 dark:text-purple-400 border-b border-gray-200 dark:border-gray-700 pb-3 mb-4">Exclusive Elections</h3>
                    <div className="space-y-4">
                      {exclusiveElections.map(renderAdminElectionCard)}
                    </div>
                  </div>
                )}
                {generalElections.length > 0 && (
                  <div>
                    <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400 border-b border-gray-200 dark:border-gray-700 pb-3 mb-4">General Elections</h3>
                    <div className="space-y-4">
                      {generalElections.map(renderAdminElectionCard)}
                    </div>
                  </div>
                )}
              </div>
            )}

      {/* TALLY & AUDIT MODAL */}
      {tallyElectionId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-4xl relative my-8">
            <button onClick={() => { setTallyElectionId(null); setTallyResults(null); setAuditResults(null); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <X size={24} />
            </button>
            <h3 className="text-xl sm:text-2xl font-bold mb-6 flex items-center gap-2">
              <Scale className="text-blue-500" /> Tally & Audit <span className="text-sm font-normal text-gray-500 ml-2">- {allElections.find(e => e.id === tallyElectionId)?.title}</span>
            </h3>
            
            {!tallyResults && !auditResults && (
              <form onSubmit={handleTallyAndAudit} className="space-y-5">
                <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm leading-relaxed">
                  This action will decrypt the mathematically secure ballots and cryptographically verify them against the blockchain ledger.
                </p>
                <button type="submit" className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2">
                  <Scale size={20} /> Decrypt & Verify
                </button>
              </form>
            )}

            {/* Results Display */}
            {tallyResults && (
              <div className="mt-8 bg-gray-50 dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-inner">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <PieChart className="w-6 h-6 text-green-600 dark:text-green-400" />
                    <h4 className="font-extrabold text-xl text-green-600 dark:text-green-400">Official Tally Results</h4>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={exportResultsCSV} className="text-sm font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-2">
                      <Download size={16} /> CSV
                    </button>
                    <button onClick={handleDownloadResultsPDF} className="text-sm font-bold bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-2">
                      <Download size={16} /> PDF
                    </button>
                  </div>
                </div>
                
                <div className="flex flex-col md:flex-row items-center gap-10">
                  {/* CSS-Powered Pie Chart */}
                  <div 
                    className="w-40 h-40 sm:w-64 sm:h-64 rounded-full shadow-lg border-4 border-white dark:border-gray-800 flex-shrink-0 transition-all duration-500"
                    style={getPieChartStyle(tallyResults.official_results)}
                  />
                  
                  {/* Color-coded Legend & Stats */}
                  <div className="flex-1 w-full space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Object.entries(tallyResults.official_results).map(([candidate, votes], index) => {
                        const total = tallyResults.total_votes_counted;
                        const percentage = total > 0 ? ((votes / total) * 100).toFixed(1) : 0;
                        const details = tallyResults.candidate_details?.[candidate] || {};
                        return (
                          <div key={candidate} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></div>
                            {details.photo ? (
                              <img src={details.photo} alt={candidate} className="w-10 h-10 rounded-full object-cover shadow-sm border border-gray-200 dark:border-gray-700 flex-shrink-0" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
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
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Total Votes Counted: <span className="text-blue-600 dark:text-blue-400 ml-2 text-lg">{tallyResults.total_votes_counted}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {auditResults && (
              <div className={`mt-6 p-6 rounded-2xl border shadow-inner ${auditResults.audit_status === 'VERIFIED' ? 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-500' : 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-500'}`}>
                <h4 className={`font-extrabold text-lg mb-3 ${auditResults.audit_status === 'VERIFIED' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>Audit Status: {auditResults.audit_status}</h4>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-relaxed">{auditResults.message}</p>
                {auditResults.issues_found && auditResults.issues_found.length > 0 && (
                  <ul className="mt-5 space-y-3">
                    {auditResults.issues_found.map((issue, idx) => (
                      <li key={idx} className="bg-white/60 dark:bg-black/20 p-4 rounded-xl border border-red-200/60 dark:border-red-800/60 flex items-start gap-3 shadow-sm">
                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm font-semibold text-red-900 dark:text-red-200 leading-relaxed">{issue}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
          </div>
        )}

        {/* TAB 4: PROFILE VIEW */}
        {activeTab === 'profile' && (
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-10 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
            <h2 className="text-2xl sm:text-3xl font-extrabold mb-8">My Profile</h2>
            <div className="flex flex-col sm:flex-row gap-8 items-start">
              <div className="flex flex-col items-center gap-4 w-full sm:w-auto">
                <div className="w-32 h-32 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center border-4 border-white dark:border-gray-800 shadow-lg overflow-hidden">
                {avatar ? (
                  <img src={avatar} alt="Profile Avatar" className="w-full h-full object-cover" />
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
                  <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">Admin ID</label>
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 font-mono text-lg text-blue-600 dark:text-blue-400">
                    {profile.voter_id}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SUPPORT INBOX */}
        {activeTab === 'inbox' && (
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-3"><Inbox className="text-blue-500" /> Support Inbox</h2>
              <button onClick={fetchTickets} className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2 transition-colors"><RefreshCw size={16}/> Refresh</button>
            </div>
            
            {supportTickets.length === 0 ? (
              <div className="text-center py-10 text-gray-500 bg-gray-100 dark:bg-gray-800/50 rounded-3xl border border-gray-300 dark:border-gray-700 border-dashed">
                No support tickets right now!
              </div>
            ) : (
              <div className="space-y-4">
                {supportTickets.map(ticket => (
                  <div key={ticket.id} className={`p-5 rounded-2xl border flex flex-col sm:flex-row justify-between gap-4 transition-all shadow-sm ${ticket.status === 'resolved' ? 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 opacity-70' : 'bg-white dark:bg-gray-800 border-blue-200 dark:border-blue-800/50 hover:border-blue-300 dark:hover:border-blue-700'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${ticket.status === 'resolved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                          {ticket.status}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">{new Date(ticket.created_at).toLocaleString()}</span>
                      </div>
                      <h4 className="font-bold text-lg font-mono text-gray-900 dark:text-white mb-1">ID: {ticket.voter_id}</h4>
                      <p className="text-gray-700 dark:text-gray-300 text-sm">{ticket.message}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      {ticket.status === 'pending' && (
                        <>
                          <button onClick={() => handleResetMFA(ticket.voter_id)} className="w-full sm:w-auto bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2">
                            <KeyRound size={16} /> Reset MFA
                          </button>
                          <button onClick={() => { setDeleteVoterId(ticket.voter_id); setActiveTab('analytics'); }} className="w-full sm:w-auto bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2">
                            <Trash2 size={16} /> Delete User
                          </button>
                          <button onClick={() => handleResolveTicket(ticket.id)} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow transition-all active:scale-95 flex items-center justify-center gap-2">
                            <Check size={16} /> Mark Resolved
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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

      {/* MFA RESET MODAL */}
      {mfaResetModalOpen && mfaResetData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md relative my-8">
            <button onClick={() => { setMfaResetModalOpen(false); setMfaResetData(null); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              <X size={24} />
            </button>
            <h3 className="text-xl sm:text-2xl font-bold mb-2 flex items-center gap-2">
              <KeyRound className="text-green-500" /> MFA Reset Successful
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              MFA has been reset for voter <span className="font-bold font-mono text-gray-800 dark:text-gray-200">{mfaResetData.voter_id}</span>. Provide them with the new setup details below.
            </p>

            <div className="w-full flex flex-col items-center space-y-5">
              <div className="text-center">
                <div className="bg-white p-4 rounded-xl shadow-md dark:shadow-lg inline-block mb-3">
                  <QRCodeSVG value={mfaResetData.new_mfa_qr_uri} size={180} />
                </div>
                <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">Scan this QR Code</h3>
              </div>

              <div className="w-full bg-gray-100 dark:bg-gray-700 p-4 rounded-xl border border-gray-300 dark:border-gray-600 relative text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Or use Manual Entry Code</p>
                <p className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400 tracking-widest break-all">
                  {mfaResetData.new_mfa_setup_key}
                </p>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(mfaResetData.new_mfa_setup_key);
                    setMfaResetCopied(true);
                    setTimeout(() => setMfaResetCopied(false), 2000);
                  }}
                  className="absolute top-2 right-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors p-2"
                  title="Copy to clipboard"
                >
                  {mfaResetCopied ? <Check size={20} className="text-green-400" /> : <Copy size={20} />}
                </button>
              </div>

              <button
                onClick={() => { setMfaResetModalOpen(false); setMfaResetData(null); }}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 active:scale-95"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
