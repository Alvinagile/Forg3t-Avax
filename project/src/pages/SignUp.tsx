import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import { authService } from '../lib/supabase';

export function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    console.log('🚀 Starting signup process...');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await authService.signUp(email, password, 'individual');

      if (error) {
        console.warn('⚠️ Signup failed:', error.message);

        if (error.message.includes('User already registered') ||
          error.message.includes('user_already_exists') ||
          error.code === 'user_already_exists') {
          setError('This email address is already registered. Please sign in or use a different email.');
        } else if (error.message.includes('Invalid email')) {
          setError('Please enter a valid email address.');
        } else {
          setError(`Account could not be created: ${error.message}`);
        }
      } else if (data.user) {
        console.log('✅ Signup successful, redirecting to onboarding');
        navigate('/onboarding');
      } else {
        setError('Signup failed: No user data returned');
      }

    } catch (error) {
      console.error('💥 Unexpected signup error:', error);
      setError('An unexpected error occurred. Please try again.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 font-sans">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="flex items-center space-x-3 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
              <img src="/assets/forg3t-logo.png" alt="Forg3t Protocol" className="h-8 w-auto" />
              <span className="text-gray-300">×</span>
              <img src="/assets/avax-logo.webp" alt="Avalanche" className="h-8 w-auto" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-[#111111]">Create Account</h2>
          <p className="mt-2 text-sm text-[#4B4B4B]">
            Join Forg3t Protocol
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSignUp}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-600 text-sm">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#111111] mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent transition-shadow"
                  placeholder="Enter your email address"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#111111] mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent transition-shadow"
                  placeholder="Create a password"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Minimum 6 characters required</p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#111111] mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent transition-shadow"
                  placeholder="Re-enter your password"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-[#2F80ED] hover:bg-[#2F80ED]/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2F80ED] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center group"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Creating account...
              </>
            ) : (
              <>
                Create Account
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>

          <div className="text-center">
            <span className="text-[#4B4B4B] text-sm">
              Already have an account?{' '}
              <Link to="/signin" className="text-[#2F80ED] hover:text-[#2870CE] font-medium transition-colors">
                Sign in
              </Link>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}