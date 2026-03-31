import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const ManageElection = () => {
  const { electionId } = useParams();

  return (
    <div className="p-4 sm:p-10 lg:p-12 text-white">
      <Link to="/admin" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-8 font-semibold">
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>
      <div className="bg-gray-800 p-10 rounded-3xl shadow-xl border border-gray-700 text-center">
        <h1 className="text-3xl font-bold">Manage Election #{electionId}</h1>
        <p className="text-gray-400 mt-4 text-lg">Coming soon: Add candidates, view live results, and trigger the final tally.</p>
      </div>
    </div>
  );
};

export default ManageElection;