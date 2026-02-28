import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Brain, FileText, Shield, Clock, CheckCircle, AlertCircle, TrendingUp, Download, Eye, BarChart } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { PDFGenerator } from '../lib/pdfGenerator';
import { DebugLogger } from '../lib/debug';

interface UnlearningRequest {
  id: string;
  model_id: string;
  request_reason: string;
  request_date: string;
  data_count: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_time_seconds: number | null;
  blockchain_tx_hash: string | null;
  audit_trail: {
    leak_score?: number;
    ipfs_hash?: string;
  } | null;
  created_at: string;
  user_id: string;
}

export function Dashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<UnlearningRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Ensure user profile exists when dashboard loads
    ensureUserProfileExists();
    fetchUnlearningRequests();

    // Set up real-time subscription for unlearning_requests
    const subscription = supabase
      .channel('unlearning_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'unlearning_requests',
          filter: `requested_by=eq.${user?.id}`
        },
        (_payload) => {
          DebugLogger.log('Real-time database update received');
          // Refresh the data when changes occur
          fetchUnlearningRequests();
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      DebugLogger.log('Unsubscribing from real-time updates');
      subscription.unsubscribe();
    };
  }, [user]);

  const ensureUserProfileExists = async () => {
    if (!user) return;

    try {
      // Check if user profile exists
      const { data: _existingUser, error: selectError } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();

      if (selectError && selectError.code === 'PGRST116') {
        // User doesn't exist, create profile
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            email: user.email || '',
            package_type: user.user_metadata?.package_type || 'individual'
          });

        if (insertError && insertError.code !== '23505') {
          // Only log if it's not a duplicate key error (23505)
          console.warn('⚠️ Failed to create user profile:', insertError.message);
        } else {
          console.log('✅ User profile created in dashboard');
        }
      } else if (selectError) {
        // Log other unexpected errors
        console.warn('⚠️ Error checking user profile:', selectError.message);
      } else {
        console.log('✅ User profile already exists');
      }
    } catch (error) {
      console.warn('⚠️ Error checking user profile:', error);
    }
  };

  const fetchUnlearningRequests = async () => {
    if (!user) return;

    try {
      console.log('📊 Fetching unlearning requests for user:', user.id);

      const { data, error } = await supabase
        .from('unlearning_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log('✅ Fetched', data?.length || 0, 'unlearning requests');
      setRequests(data || []);
    } catch (err) {
      console.error('💥 Failed to fetch requests:', err);
      setError('Failed to load unlearning requests');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-600';
      case 'processing':
        return 'text-yellow-600';
      case 'failed':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  const downloadPDF = (request: UnlearningRequest) => {
    const report = {
      user_id: user?.id || '',
      request_id: request.id,
      operation_type: 'AI Unlearning Operation',
      timestamp: request.created_at || new Date().toISOString(),
      tx_id: request.blockchain_tx_hash || '',
      ipfs_cid: request.audit_trail?.ipfs_hash || '',
      jurisdiction: 'EU' as const,
      regulatory_tags: ['GDPR Article 17', 'Right to be Forgotten', 'AI Transparency']
    };

    const additionalData = {
      modelIdentifier: 'ChatGPT-4',
      leakScore: request.audit_trail?.leak_score || 0.05,
      unlearningType: 'Black-box Adversarial Testing',
      targetInfo: 'Confidential Information'
    };

    const pdfDataUri = PDFGenerator.generateComplianceCertificate(report, additionalData);
    PDFGenerator.downloadPDF(pdfDataUri, `unlearning-certificate-${request.id.slice(0, 8)}.pdf`);
  };

  // Calculate stats from real data
  const stats = {
    totalRequests: requests.length,
    completedRequests: requests.filter(r => r.status === 'completed').length,
    pendingRequests: requests.filter(r => r.status === 'pending' || r.status === 'processing').length,
    averageProcessingTime: requests
      .filter(r => r.processing_time_seconds)
      .reduce((acc, r) => acc + (r.processing_time_seconds || 0), 0) /
      Math.max(requests.filter(r => r.processing_time_seconds).length, 1)
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-900">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#111111] mb-2">Dashboard</h1>
          <p className="text-[#4B4B4B]">
            Monitor your AI unlearning requests and compliance status
          </p>
        </div>

        {/* Built on Avalanche Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-[#111111] mb-2">
                Built on Avalanche
              </h3>
              <p className="text-[#4B4B4B]">
                Suppression evidence is anchored on-chain via Avalanche C-Chain for immutable compliance records.
              </p>
            </div>
            <a
              href="https://forg3t.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-6 py-3 bg-[#2F80ED] text-white font-semibold rounded-lg hover:bg-[#2870CE] transition-colors whitespace-nowrap"
            >
              Visit Forg3t.io
            </a>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[#4B4B4B] text-sm">Total Requests</p>
                <p className="text-2xl font-bold text-[#111111]">{stats.totalRequests}</p>
              </div>
              <BarChart className="h-8 w-8 text-[#2F80ED]" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[#4B4B4B] text-sm">Completed</p>
                <p className="text-2xl font-bold text-green-600">{stats.completedRequests}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[#4B4B4B] text-sm">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendingRequests}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[#4B4B4B] text-sm">Avg. Time</p>
                <p className="text-2xl font-bold text-[#111111]">
                  {stats.averageProcessingTime > 0 ? `${Math.round(stats.averageProcessingTime)}s` : 'N/A'}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-[#2F80ED]" />
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Link
            to="/unlearning?type=black-box"
            className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:border-[#2F80ED]/50 transition-colors group"
          >
            <div className="flex items-center space-x-4">
              <Brain className="h-12 w-12 text-[#2F80ED] group-hover:scale-110 transition-transform" />
              <div>
                <h3 className="text-xl font-semibold text-[#111111] mb-2">Suppression</h3>
                <p className="text-[#4B4B4B] text-sm">Suppression without model access</p>
              </div>
            </div>
          </Link>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm opacity-60 cursor-not-allowed relative">
            <div className="absolute top-4 right-4">
              <span className="px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full">
                Coming Soon
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <FileText className="h-12 w-12 text-gray-400" />
              <div>
                <h3 className="text-xl font-semibold text-gray-400 mb-2">White-box Unlearning</h3>
                <p className="text-gray-400 text-sm">Direct model weight manipulation</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Requests */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-[#111111]">Recent Suppression Requests</h2>
          </div>

          {error && (
            <div className="p-6 bg-red-50 border-b border-red-200">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-red-600 text-sm">{error}</span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            {requests.length === 0 ? (
              <div className="p-8 text-center">
                <Brain className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-[#111111] mb-2">No suppression requests yet</h3>
                <p className="text-[#4B4B4B] mb-4">
                  Start your first suppression request to see it here
                </p>
                <Link
                  to="/unlearning"
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#2F80ED] hover:bg-[#2870CE] transition-colors"
                >
                  Start Suppression
                </Link>
              </div>
            ) : (
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#4B4B4B] uppercase tracking-wider">
                      Request
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#4B4B4B] uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#4B4B4B] uppercase tracking-wider">
                      Data Count
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#4B4B4B] uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#4B4B4B] uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#4B4B4B] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {requests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-[#111111] font-mono">
                          {request.id.slice(0, 8)}...
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-[#4B4B4B] max-w-xs truncate">
                          {request.request_reason}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-[#111111]">
                          {request.data_count}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(request.status)}
                          <span className={`text-sm capitalize ${getStatusColor(request.status)}`}>
                            {request.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-[#4B4B4B]">
                          {new Date(request.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col space-y-2">
                          {/* Action Buttons Row */}
                          <div className="flex items-center space-x-2">
                            {/* PDF Download */}
                            <button
                              onClick={() => downloadPDF(request)}
                              className="text-green-400 hover:text-green-300 tooltip"
                              title="Download Certificate"
                            >
                              <Download className="h-4 w-4" />
                            </button>

                            {/* Blockchain Explorer */}
                            {/* IPFS Link */}
                            {request.audit_trail?.ipfs_hash && (
                              request.audit_trail.ipfs_hash.startsWith('Qm') &&
                              request.audit_trail.ipfs_hash.length > 20 && (
                                <a
                                  href={`https://gateway.pinata.cloud/ipfs/${request.audit_trail.ipfs_hash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#2F80ED] hover:text-[#2870CE] tooltip"
                                  title="View on IPFS"
                                >
                                  <Eye className="h-4 w-4" />
                                </a>
                              ))}

                          </div>

                          {/* Results Summary Row */}
                          {request.audit_trail && (
                            <div className="flex items-center space-x-3 text-xs">
                              {/* IPFS Status */}
                              {request.audit_trail.ipfs_hash && (
                                <div className="flex items-center space-x-1">
                                  <div className="w-2 h-2 rounded-full bg-[#60a5fa]" />
                                  <span className="text-gray-400">IPFS</span>
                                </div>
                              )}

                              {/* Leak Score */}
                              {request.audit_trail.leak_score !== undefined && (
                                <div className="flex items-center space-x-1">
                                  <div className={`w-2 h-2 rounded-full ${request.audit_trail.leak_score < 0.1 ? 'bg-green-400' :
                                    request.audit_trail.leak_score < 0.3 ? 'bg-yellow-400' : 'bg-red-400'
                                    }`} />
                                  <span className="text-gray-400">
                                    {(request.audit_trail.leak_score * 100).toFixed(1)}%
                                  </span>
                                </div>
                              )}

                              {/* Status Badge */}
                              {request.audit_trail.leak_score !== undefined && (
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${request.audit_trail.leak_score < 0.1 ? 'bg-green-100 text-green-700' :
                                  request.audit_trail.leak_score < 0.3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                  {request.audit_trail.leak_score < 0.1 ? 'GDPR OK' :
                                    request.audit_trail.leak_score < 0.3 ? 'Review' : 'Failed'}
                                </span>
                              )}
                            </div>
                          )}

                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center py-6 border-t border-gray-200">
          <p className="text-[#4B4B4B] mb-2">
            Built on Avalanche
          </p>
          <p className="text-sm text-gray-500">
            Powered by <a href="https://forg3t.io" target="_blank" rel="noopener noreferrer" className="text-[#2F80ED] hover:text-[#2870CE] font-semibold">Forg3t Protocol</a>
          </p>
        </div>
      </div>
    </div>
  );
}