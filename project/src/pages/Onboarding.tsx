import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Users, Building, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export function Onboarding() {
  const { user } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState<'individual' | 'enterprise'>('individual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleComplete = async () => {
    if (!user) {
      setError('No user session found. Please sign in again.');
      navigate('/signin');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('🎯 Completing onboarding process for package:', selectedPackage);

      // Ensure user profile exists
      const { error: profileError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email || '',
          package_type: selectedPackage
        })
        .select()
        .single();

      if (profileError && profileError.code !== '23505') {
        console.warn('⚠️ Profile creation warning:', profileError.message);
      }

      // Update auth metadata
      const { error: authError } = await supabase.auth.updateUser({
        data: { package_type: selectedPackage }
      });

      if (authError) {
        console.warn('⚠️ Failed to update auth metadata:', authError.message);
      }

      console.log('✅ Onboarding completed successfully');
      navigate('/dashboard');

    } catch (error) {
      console.error('💥 Onboarding failed:', error);
      setError(error instanceof Error ? error.message : 'Onboarding failed');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 font-sans">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-3 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 inline-flex">
              <img src="/assets/forg3t-logo.png" alt="Forg3t Protocol" className="h-8 w-auto" />
              <span className="text-gray-300">×</span>
              <img src="/assets/avax-logo.webp" alt="Avalanche" className="h-8 w-auto" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-[#111111]">
            Welcome to Forg3t Protocol
          </h1>
          <p className="mt-4 text-lg text-[#4B4B4B]">
            Choose your package to get started with cryptographically verified AI unlearning
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-2 max-w-md mx-auto mt-4">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-600 text-sm">{error}</span>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Individual Package */}
          <div
            className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all ${selectedPackage === 'individual'
              ? 'border-[#2F80ED] bg-[#2F80ED]/10'
              : 'border-gray-200 bg-white hover:border-[#2F80ED]/50'
              }`}
            onClick={() => setSelectedPackage('individual')}
          >
            {selectedPackage === 'individual' && (
              <div className="absolute top-4 right-4">
                <Check className="h-6 w-6 text-[#2F80ED]" />
              </div>
            )}

            <div className="flex items-center space-x-3 mb-4">
              <Users className="h-8 w-8 text-[#2F80ED]" />
              <div>
                <h3 className="text-xl font-bold text-[#111111]">Individual</h3>
                <p className="text-[#2F80ED] font-semibold">Free</p>
              </div>
            </div>

            <ul className="space-y-3 text-[#4B4B4B]">
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>5 unlearning requests per month</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>Black-box unlearning (ChatGPT)</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>zk-SNARK proofs</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>Compliance certificates</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>IPFS storage</span>
              </li>
            </ul>
          </div>

          {/* Enterprise Package */}
          <div
            className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all ${selectedPackage === 'enterprise'
              ? 'border-[#2F80ED] bg-[#2F80ED]/10'
              : 'border-gray-200 bg-white hover:border-[#2F80ED]/50'
              }`}
            onClick={() => setSelectedPackage('enterprise')}
          >
            {selectedPackage === 'enterprise' && (
              <div className="absolute top-4 right-4">
                <Check className="h-6 w-6 text-[#2F80ED]" />
              </div>
            )}

            <div className="flex items-center space-x-3 mb-4">
              <Building className="h-8 w-8 text-[#2F80ED]" />
              <div>
                <h3 className="text-xl font-bold text-[#111111]">Enterprise</h3>
                <p className="text-[#2F80ED] font-semibold">Free (Beta)</p>
              </div>
            </div>

            <ul className="space-y-3 text-[#4B4B4B]">
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>Unlimited requests</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>Black-box & White-box unlearning</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>Advanced zk-SNARK proofs</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>Regulatory compliance suite</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>Priority support</span>
              </li>
              <li className="flex items-center space-x-2">
                <Check className="h-4 w-4 text-green-500" />
                <span>Custom integrations</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={handleComplete}
            disabled={loading}
            className="px-8 py-3 bg-[#2F80ED] text-white font-semibold rounded-lg hover:bg-[#2870CE] focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Setting up...' : 'Continue to Dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}
