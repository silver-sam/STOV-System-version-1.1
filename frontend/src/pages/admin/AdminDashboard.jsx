import { useState, useEffect, useContext } from 'react';
import apiClient from '../../api/client';
import AuthContext from '../../context/AuthContext';
import { Plus, Save, Users, Vote, ShieldAlert, Scale, RefreshCw, Sun, Moon, User, LogOut, AlertCircle, Activity, PieChart, Download, Trash2 } from 'lucide-react';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'create' | 'tally' | 'profile'
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { logout } = useContext(AuthContext);

  // --- ANALYTICS STATE ---
  const [analyticsData, setAnalyticsData] = useState(null);

  // --- ELECTION CREATION STATE ---
  const [electionTitle, setElectionTitle] = useState('');
  const [createdElection, setCreatedElection] = useState(null);
  const [candidateName, setCandidateName] = useState('');
  const [currentCandidates, setCurrentCandidates] = useState([]);

  // --- TALLY & AUDIT STATE ---
  const [allElections, setAllElections] = useState([]);
  const [tallyElectionId, setTallyElectionId] = useState(null);
  const [tallyResults, setTallyResults] = useState(null);
  const [auditResults, setAuditResults] = useState(null);
  const [profile, setProfile] = useState({ name: 'Loading...', email: 'Loading...', voter_id: 'Loading...' });
  const [avatar, setAvatar] = useState(null);

  // Cropper State
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [tempImg, setTempImg] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, scale: 1 });
  const [imgSize, setImgSize] = useState({ w: 256, h: 256 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

  // 3. Create Election
  const handleCreateElection = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      const res = await apiClient.post('/create-election/', { title: electionTitle });
      setCreatedElection(res.data);
      setCurrentCandidates([]);
      setMessage('Election created successfully!');
      setElectionTitle('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create election.');
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
        name: candidateName 
      });
      setMessage(`Candidate '${candidateName}' added successfully.`);
      setCandidateName('');
      fetchCurrentCandidates(createdElection.election_id);
    } catch (err) {
      setError('Failed to add candidate.');
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

  const handleDeployLedger = async () => {
    setMessage(''); setError('');
    try {
      const res = await apiClient.get('/deploy-ledger/');
      setMessage(`Ledger Deployed! Contract Address: ${res.data.contract_address}`);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to deploy ledger.');
    }
  };

  // Fetch elections when the tally tab is activated
  useEffect(() => { if (activeTab === 'tally') fetchAllElections(); }, [activeTab]);
  
  // Fetch analytics when the analytics tab is activated
  useEffect(() => {
    if (activeTab === 'analytics') fetchAnalytics();
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

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-full md:w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col shadow-lg md:sticky md:top-0 md:h-screen z-20">
        <div className="p-6 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-black text-blue-600 dark:text-blue-500 flex items-center gap-3 tracking-wide">
            <ShieldAlert size={28} /> STOV Admin
          </h1>
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
            onClick={() => setActiveTab('analytics')}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Activity size={20} /> System Analytics
          </button>
          <button 
            onClick={() => setActiveTab('create')}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'create' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Vote size={20} /> New Election
          </button>
          <button 
            onClick={() => setActiveTab('tally')}
            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${activeTab === 'tally' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <Scale size={20} /> Tally & Audit
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
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
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all active:scale-95">
            <LogOut size={20} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 sm:p-10 lg:p-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto">

        {/* Status Messages */}
        {message && <div className="mb-4 p-4 bg-green-100 dark:bg-green-900/50 border border-green-400 dark:border-green-500 rounded-xl text-green-700 dark:text-green-200 font-medium">{message}</div>}
        {error && <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/50 border border-red-400 dark:border-red-500 rounded-xl text-red-700 dark:text-red-200 font-medium">{error}</div>}

        {/* TAB 1: SYSTEM ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold">System Analytics</h2>
              <button onClick={fetchAnalytics} className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2 transition-colors">
                <RefreshCw size={16}/> Refresh
              </button>
            </div>
            
            {analyticsData ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-2xl border border-blue-200 dark:border-blue-800 shadow-sm">
                  <p className="text-blue-600 dark:text-blue-400 text-sm font-bold uppercase tracking-wider mb-2">Registered Voters</p>
                  <div className="flex items-center gap-4">
                    <Users className="w-10 h-10 text-blue-500 opacity-80" />
                    <p className="text-4xl font-black text-blue-900 dark:text-blue-100">{analyticsData.total_registered_voters}</p>
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-2xl border border-green-200 dark:border-green-800 shadow-sm">
                  <p className="text-green-600 dark:text-green-400 text-sm font-bold uppercase tracking-wider mb-2">Voters Who Voted</p>
                  <div className="flex items-center gap-4">
                    <Activity className="w-10 h-10 text-green-500 opacity-80" />
                    <p className="text-4xl font-black text-green-900 dark:text-green-100">{analyticsData.voters_who_voted}</p>
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-2xl border border-purple-200 dark:border-purple-800 shadow-sm">
                  <p className="text-purple-600 dark:text-purple-400 text-sm font-bold uppercase tracking-wider mb-2">Total Ballots Cast</p>
                  <div className="flex items-center gap-4">
                    <Vote className="w-10 h-10 text-purple-500 opacity-80" />
                    <p className="text-4xl font-black text-purple-900 dark:text-purple-100">{analyticsData.total_ballots_cast}</p>
                  </div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-2xl border border-amber-200 dark:border-amber-800 shadow-sm">
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
          </div>
        )}

        {/* TAB 2: CREATE ELECTION */}
        {activeTab === 'create' && (
          <div className="space-y-6">
            {/* Step 0: Deploy Ledger */}
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
              <h2 className="text-xl font-bold mb-4">0. Initialize Blockchain Ledger</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm leading-relaxed">Deploy the smart contract to the local Ganache network. This must be done once before any votes can be cast.</p>
              <button type="button" onClick={handleDeployLedger} className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95">
                Deploy Smart Contract
              </button>
            </div>

            {/* Step 1: Define Election */}
            <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
              <h2 className="text-xl font-bold mb-6">1. Create New Election</h2>
              <form onSubmit={handleCreateElection} className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                <div className="flex-1 w-full">
                  <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Election Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Class President 2024"
                    value={electionTitle}
                    onChange={(e) => setElectionTitle(e.target.value)}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  />
                </div>
                <button type="submit" className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2">
                  <Plus size={20} /> Create
                </button>
              </form>
              
              {/* Display Current Candidates Being Added */}
              {currentCandidates.length > 0 && (
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Current Candidates</h3>
                  <div className="space-y-3">
                    {currentCandidates.map(c => (
                      <div key={c.db_id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{c.name}</span>
                        <button type="button" onClick={() => handleDeleteCandidate(c.db_id)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-2 transition-colors" title="Remove candidate"><Trash2 size={18} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Add Candidates */}
            <div className={`bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl ${!createdElection ? 'opacity-50 pointer-events-none' : ''}`}>
              <h2 className="text-xl font-bold mb-6">2. Add Candidates</h2>
              <form onSubmit={handleAddCandidate} className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                <div className="flex-1 w-full">
                  <label className="block text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Candidate Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Jane Doe"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    disabled={!createdElection}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50"
                  />
                </div>
                <button type="submit" disabled={!createdElection} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95 flex justify-center items-center gap-2">
                  <Save size={20} /> Add Candidate
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: TALLY & AUDIT */}
        {activeTab === 'tally' && (
          <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold">Manage Elections</h2>
              <button onClick={fetchAllElections} className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2 transition-colors"><RefreshCw size={16}/> Refresh</button>
            </div>
            
            <div className="space-y-4">
              {allElections.map(election => (
                <div key={election.id} className="bg-gray-50 dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5 shadow-sm">
                  <div>
                    <span className={`text-xs font-extrabold px-3 py-1.5 rounded-md uppercase tracking-wider ${election.is_active ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300'}`}>
                      {election.is_active ? 'ACTIVE' : 'CLOSED'}
                    </span>
                    <p className="font-bold text-lg mt-3 text-gray-900 dark:text-white">{election.title} <span className="text-gray-500 font-mono text-sm ml-2">(ID: {election.id})</span></p>
                  </div>
                  <div className="flex w-full sm:w-auto gap-3">
                    {election.is_active && (
                      <button onClick={() => handleCloseElection(election.id)} className="flex-1 sm:flex-none bg-yellow-600 hover:bg-yellow-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow transition-all active:scale-95">
                        Close Voting
                      </button>
                    )}
                    <button onClick={() => { setTallyElectionId(election.id); setTallyResults(null); setAuditResults(null); }} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow transition-all active:scale-95">
                      Tally / Audit
                    </button>
                    <button onClick={() => handleDeleteElection(election.id)} className="flex-1 sm:flex-none bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 px-4 py-2.5 rounded-xl text-sm font-bold shadow transition-all active:scale-95 flex items-center justify-center">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Tally Modal/Form */}
            {tallyElectionId !== null && (
              <div className="mt-10 pt-8 border-t border-gray-200 dark:border-gray-700">
                <h3 className="text-xl font-bold mb-6">Tally & Audit for Election ID: {tallyElectionId}</h3>
                <form onSubmit={handleTallyAndAudit} className="space-y-5">
                  <button type="submit" className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg transition-all active:scale-95">
                    Decrypt & Verify
                  </button>
                </form>

                {/* Results Display */}
                {tallyResults && (
                  <div className="mt-8 bg-gray-50 dark:bg-gray-900 p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-inner">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                      <div className="flex items-center gap-3">
                        <PieChart className="w-6 h-6 text-green-600 dark:text-green-400" />
                        <h4 className="font-extrabold text-xl text-green-600 dark:text-green-400">Official Tally Results</h4>
                      </div>
                      <button onClick={exportResultsCSV} className="text-sm font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2.5 rounded-xl shadow-sm transition-all active:scale-95 flex items-center gap-2">
                        <Download size={16} /> Export CSV
                      </button>
                    </div>
                    
                    <div className="flex flex-col md:flex-row items-center gap-10">
                      {/* CSS-Powered Pie Chart */}
                      <div 
                        className="w-48 h-48 sm:w-64 sm:h-64 rounded-full shadow-lg border-4 border-white dark:border-gray-800 flex-shrink-0 transition-all duration-500"
                        style={getPieChartStyle(tallyResults.official_results)}
                      />
                      
                      {/* Color-coded Legend & Stats */}
                      <div className="flex-1 w-full space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {Object.entries(tallyResults.official_results).map(([candidate, votes], index) => {
                            const total = tallyResults.total_votes_counted;
                            const percentage = total > 0 ? ((votes / total) * 100).toFixed(1) : 0;
                            return (
                              <div key={candidate} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
                                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></div>
                                <div className="flex-1">
                                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{candidate}</p>
                                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{votes} votes ({percentage}%)</p>
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
            )}
          </div>
        )}

        {/* TAB 4: PROFILE VIEW */}
        {activeTab === 'profile' && (
          <div className="bg-white dark:bg-gray-800 p-8 sm:p-10 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-2xl">
            <h2 className="text-3xl font-extrabold mb-8">My Profile</h2>
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
    </div>
  );
};

export default AdminDashboard;
