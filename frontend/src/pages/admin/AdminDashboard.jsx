import { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { Download, Plus, Save, Users, Vote, FileKey, ShieldAlert, Scale, Lock, RefreshCw } from 'lucide-react';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('tokens'); // 'tokens' | 'create' | 'tally'
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // --- TOKEN GENERATION STATE ---
  const [tokenCount, setTokenCount] = useState(20);
  const [generatedTokens, setGeneratedTokens] = useState([]);

  // --- ELECTION CREATION STATE ---
  const [electionTitle, setElectionTitle] = useState('');
  const [createdElection, setCreatedElection] = useState(null); // Stores ID and Secret Key
  const [candidateName, setCandidateName] = useState('');

  // --- TALLY & AUDIT STATE ---
  const [allElections, setAllElections] = useState([]);
  const [tallyElectionId, setTallyElectionId] = useState(null);
  const [secretKeyInput, setSecretKeyInput] = useState('');
  const [tallyResults, setTallyResults] = useState(null);
  const [auditResults, setAuditResults] = useState(null);

  // 1. Generate Tokens
  const handleGenerateTokens = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      const res = await apiClient.post('/admin/generate-tokens/', { count: parseInt(tokenCount) });
      setGeneratedTokens(res.data.tokens);
      setMessage(`Successfully generated ${res.data.tokens.length} tokens.`);
    } catch (err) {
      setError('Failed to generate tokens.');
    }
  };

  // 2. Download Tokens as CSV
  const handleDownloadTokens = () => {
    const csvContent = "data:text/csv;charset=utf-8," + generatedTokens.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "voter_tokens.csv");
    document.body.appendChild(link);
    link.click();
  };

  // 3. Create Election
  const handleCreateElection = async (e) => {
    e.preventDefault();
    setMessage(''); setError('');
    try {
      const res = await apiClient.post('/create-election/', { title: electionTitle });
      setCreatedElection(res.data); // Save the response so we can show the Secret Key
      setMessage('Election created! SAVE THE SECRET KEY BELOW.');
      setElectionTitle('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create election.');
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
    } catch (err) {
      setError('Failed to add candidate.');
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

  // 7. Tally and Audit
  const handleTallyAndAudit = async (e) => {
    e.preventDefault();
    setMessage(''); setError(''); setTallyResults(null); setAuditResults(null);
    try {
      // Tally first
      const tallyRes = await apiClient.post('/tally-election/', {
        election_id: tallyElectionId,
        admin_secret_key: secretKeyInput,
      });
      setTallyResults(tallyRes.data);

      // Then Audit
      const auditRes = await apiClient.get(`/audit-election/${tallyElectionId}`);
      setAuditResults(auditRes.data);

    } catch (err) {
      setError(err.response?.data?.detail || 'Tally/Audit process failed.');
    }
  };

  // 8. Recover Key
  const handleRecoverKey = async () => {
    if (!tallyElectionId) return;
    try {
      const res = await apiClient.post(`/elections/${tallyElectionId}/recover-key`);
      setSecretKeyInput(res.data.admin_secret_key);
      setMessage('Secret Key recovered from secure backup.');
    } catch (err) {
      setError('Failed to recover key. Backup may not exist.');
    }
  };

  // Fetch elections when the tally tab is activated
  useEffect(() => { if (activeTab === 'tally') fetchAllElections(); }, [activeTab]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-3xl font-bold text-blue-500 flex items-center gap-3">
            <ShieldAlert className="text-blue-500" /> Admin Command Center
          </h1>
        </header>

        {/* Status Messages */}
        {message && <div className="mb-4 p-4 bg-green-900/50 border border-green-500 rounded text-green-200">{message}</div>}
        {error && <div className="mb-4 p-4 bg-red-900/50 border border-red-500 rounded text-red-200">{error}</div>}

        {/* Tabs */}
        <div className="flex gap-4 mb-8">
          <button 
            onClick={() => setActiveTab('tokens')}
            className={`px-6 py-2 rounded-lg font-medium transition ${activeTab === 'tokens' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            <Users className="inline-block mr-2 w-4 h-4" /> Voter Access
          </button>
          <button 
            onClick={() => setActiveTab('create')}
            className={`px-6 py-2 rounded-lg font-medium transition ${activeTab === 'create' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            <Vote className="inline-block mr-2 w-4 h-4" /> New Election
          </button>
          <button 
            onClick={() => setActiveTab('tally')}
            className={`px-6 py-2 rounded-lg font-medium transition ${activeTab === 'tally' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            <Scale className="inline-block mr-2 w-4 h-4" /> Tally & Audit
          </button>
        </div>

        {/* TAB 1: TOKEN GENERATION */}
        {activeTab === 'tokens' && (
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Generate Registration Tokens</h2>
            <p className="text-gray-400 mb-6 text-sm">Create unique, one-time use codes for students to register.</p>
            
            <form onSubmit={handleGenerateTokens} className="flex gap-4 items-end mb-8">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-400 mb-1">Number of Tokens</label>
                <input 
                  type="number" 
                  min="1" 
                  max="1000"
                  value={tokenCount}
                  onChange={(e) => setTokenCount(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition">
                Generate
              </button>
            </form>

            {generatedTokens.length > 0 && (
              <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-mono text-yellow-400">Generated Batch</h3>
                  <button onClick={handleDownloadTokens} className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded transition">
                    <Download size={16} /> Download CSV
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2 font-mono text-sm text-gray-300 max-h-60 overflow-y-auto">
                  {generatedTokens.map((token, i) => (
                    <div key={i} className="bg-gray-800 p-2 rounded text-center select-all">{token}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CREATE ELECTION */}
        {activeTab === 'create' && (
          <div className="space-y-6">
            {/* Step 1: Define Election */}
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
              <h2 className="text-xl font-semibold mb-4">1. Create New Election</h2>
              <form onSubmit={handleCreateElection} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-400 mb-1">Election Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Class President 2024"
                    value={electionTitle}
                    onChange={(e) => setElectionTitle(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-medium transition flex items-center gap-2">
                  <Plus size={18} /> Create
                </button>
              </form>
            </div>

            {/* Step 2: Save Keys (Only shows after creation) */}
            {createdElection && (
              <div className="bg-yellow-900/20 border border-yellow-600 p-6 rounded-xl animate-fade-in">
                <div className="flex items-start gap-4">
                  <FileKey className="text-yellow-500 w-12 h-12 flex-shrink-0" />
                  <div className="w-full">
                    <h3 className="text-lg font-bold text-yellow-400 mb-2">CRITICAL: Save This Key!</h3>
                    <p className="text-yellow-200/80 text-sm mb-4">
                      This is the <strong>Private Key</strong> for Election ID #{createdElection.election_id}. 
                      It is required to decrypt the results. It is NOT stored in the database. 
                      If you lose it, the votes cannot be counted.
                    </p>
                    <div className="bg-black/50 p-4 rounded border border-yellow-800 break-all font-mono text-sm text-yellow-100 select-all">
                      {createdElection.admin_secret_key_DO_NOT_LOSE}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Add Candidates */}
            <div className={`bg-gray-800 p-6 rounded-xl border border-gray-700 ${!createdElection ? 'opacity-50 pointer-events-none' : ''}`}>
              <h2 className="text-xl font-semibold mb-4">2. Add Candidates</h2>
              <form onSubmit={handleAddCandidate} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-400 mb-1">Candidate Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Jane Doe"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    disabled={!createdElection}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2 px-4 text-white focus:ring-2 focus:ring-blue-500 disabled:bg-gray-800"
                  />
                </div>
                <button type="submit" disabled={!createdElection} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-6 py-2.5 rounded-lg font-medium transition flex items-center gap-2">
                  <Save size={18} /> Add Candidate
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: TALLY & AUDIT */}
        {activeTab === 'tally' && (
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold">Manage Elections</h2>
              <button onClick={fetchAllElections} className="text-sm text-gray-400 hover:text-white flex items-center gap-2"><RefreshCw size={14}/> Refresh</button>
            </div>
            
            <div className="space-y-4">
              {allElections.map(election => (
                <div key={election.id} className="bg-gray-900 p-4 rounded-lg border border-gray-700 flex justify-between items-center">
                  <div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${election.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                      {election.is_active ? 'ACTIVE' : 'CLOSED'}
                    </span>
                    <p className="font-semibold mt-2">{election.title} <span className="text-gray-500 font-mono text-sm">(ID: {election.id})</span></p>
                  </div>
                  <div className="flex gap-2">
                    {election.is_active && (
                      <button onClick={() => handleCloseElection(election.id)} className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                        Close Voting
                      </button>
                    )}
                    <button onClick={() => { setTallyElectionId(election.id); setTallyResults(null); setAuditResults(null); setSecretKeyInput(''); }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      Tally / Audit
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Tally Modal/Form */}
            {tallyElectionId !== null && (
              <div className="mt-8 pt-6 border-t border-gray-700">
                <h3 className="text-lg font-semibold mb-4">Tally & Audit for Election ID: {tallyElectionId}</h3>
                <form onSubmit={handleTallyAndAudit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Admin Secret Key</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-500" />
                      <input
                        type="password"
                        required
                        value={secretKeyInput}
                        onChange={(e) => setSecretKeyInput(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg py-2.5 pl-10 px-4 text-white focus:ring-2 focus:ring-blue-500"
                        placeholder="Paste the secret key you saved..."
                      />
                    </div>
                    <button type="button" onClick={handleRecoverKey} className="text-xs text-blue-400 hover:text-blue-300 underline mt-1">
                      Lost your key? Recover from backup
                    </button>
                  </div>
                  <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg font-medium">
                    Decrypt & Verify
                  </button>
                </form>

                {/* Results Display */}
                {tallyResults && (
                  <div className="mt-6 bg-gray-900 p-4 rounded-lg border border-gray-700">
                    <h4 className="font-bold text-green-400 mb-2">Official Tally Results</h4>
                    <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(tallyResults.official_results, null, 2)}</pre>
                    <p className="text-xs text-gray-400 mt-2">Total Votes: {tallyResults.total_votes_counted}</p>
                  </div>
                )}
                {auditResults && (
                  <div className={`mt-4 p-4 rounded-lg border ${auditResults.audit_status === 'VERIFIED' ? 'bg-green-900/50 border-green-500' : 'bg-red-900/50 border-red-500'}`}>
                    <h4 className={`font-bold mb-2 ${auditResults.audit_status === 'VERIFIED' ? 'text-green-300' : 'text-red-300'}`}>Audit Status: {auditResults.audit_status}</h4>
                    <p className="text-sm">{auditResults.message}</p>
                    {auditResults.issues_found && <pre className="mt-2 text-xs bg-black/30 p-2 rounded">{JSON.stringify(auditResults.issues_found, null, 2)}</pre>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
