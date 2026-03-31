import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { ArrowLeft, Vote, User } from 'lucide-react';

const ManageElection = () => {
  const { electionId } = useParams();
  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchElectionDetails = async () => {
      setLoading(true);
      setError('');
      try {
        // Fetch election details and candidates in parallel for better performance
        const [electionRes, candidatesRes] = await Promise.all([
          apiClient.get(`/admin/elections/${electionId}`),
          apiClient.get(`/candidates/${electionId}`)
        ]);
        
        setElection(electionRes.data);
        setCandidates(candidatesRes.data);

      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to fetch election details.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (electionId) fetchElectionDetails();

  }, [electionId]);

  if (loading) {
    return (
      <div className="p-4 sm:p-10 lg:p-12 text-center text-gray-400">
        Loading election details...
      </div>
    );
  }

  if (error || !election) {
    return (
      <div className="p-4 sm:p-10 lg:p-12 text-center text-red-400">
        <p>{error || 'Election not found.'}</p>
        <Link to="/admin" className="mt-4 inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 font-semibold">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-10 lg:p-12 text-gray-900 dark:text-white">
      <Link to="/admin" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-8 font-semibold">
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>
      
      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-3xl mx-auto">
        <h1 className="text-xl sm:text-2xl font-bold mb-1 flex items-center gap-2">
          <Vote className="text-blue-500 dark:text-blue-400" /> Election Details
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6 font-semibold">{election.title}</p>
        
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700 pb-2">
            Registered Candidates ({candidates.length})
          </h2>
          {candidates.length > 0 ? (
            <div className="space-y-3">
              {candidates.map((c, index) => (
                <div key={c.db_id} className="flex items-center bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex-shrink-0 shadow-sm flex items-center justify-center relative">
                    {c.photo ? (
                      <img src={c.photo} alt={c.name} className="w-full h-full object-cover" />
                    ) : (
                      <User size={24} className="text-gray-400" />
                    )}
                    <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold border-2 border-white dark:border-gray-800">{index + 1}</div>
                  </div>
                  <div className="ml-4">
                    <span className="font-bold text-gray-900 dark:text-white text-lg block">{c.name}</span>
                    {c.party && <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{c.party}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-500 bg-gray-100 dark:bg-gray-800/50 rounded-xl border border-gray-300 dark:border-gray-700 border-dashed">
              No candidates have been added to this election yet.
            </div>
          )}
          <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm">More management options for this election will be available here soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageElection;