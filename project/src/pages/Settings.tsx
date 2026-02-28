import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, Save, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase, authService } from '../lib/supabase';
import { DebugLogger } from '../lib/debug';
import { UserService } from '../lib/userService';

export function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form states
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userProfile, setUserProfile] = useState<any>(null);

  // Load user profile on mount
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user) return;

      const profileResult = await UserService.getUserProfile(user.id);
      if (profileResult.success) {
        setUserProfile(profileResult.user);
      } else {
        DebugLogger.error('Failed to load user profile', profileResult.error);
      }
    };

    loadUserProfile();
  }, [user]);

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailLoading(true);
    setMessage({ type: '', text: '' });

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setMessage({ type: 'error', text: 'Please enter a valid email address' });
      setEmailLoading(false);
      return;
    }

    if (email === user?.email) {
      setMessage({ type: 'error', text: 'New email must be different from current email' });
      setEmailLoading(false);
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ email });

      if (error) {
        // Check for specific error types
        if (error.message.includes('already registered') ||
          error.message.includes('already exists') ||
          error.message.includes('duplicate') ||
          error.message.includes('already in use')) {
          setMessage({
            type: 'error',
            text: `❌ This email address is already registered by another user. Please use a different email address.`
          });
          setEmailLoading(false);
          return;
        }
        throw error;
      }

      setMessage({
        type: 'success',
        text: `✅ Confirmation email sent to ${email}. Please check your inbox and click the confirmation link. Your email will be updated after confirmation.`
      });

      // Show additional info
      setTimeout(() => {
        setMessage({
          type: 'info',
          text: '📧 Don\'t forget to check your spam folder if you don\'t see the email in your inbox.'
        });
      }, 5000);

    } catch (error) {
      DebugLogger.error('Email update failed', error);

      if (error instanceof Error) {
        if (error.message.includes('rate_limit')) {
          setMessage({
            type: 'error',
            text: '⏱️ Too many attempts. Please wait before trying again.'
          });
        } else if (error.message.includes('already registered') ||
          error.message.includes('already exists') ||
          error.message.includes('duplicate') ||
          error.message.includes('already in use')) {
          setMessage({
            type: 'error',
            text: '❌ This email address is already registered by another user. Please use a different email address.'
          });
        } else if (error.message.includes('invalid') || error.message.includes('malformed')) {
          setMessage({
            type: 'error',
            text: '📧 Please enter a valid email address format.'
          });
        } else {
          setMessage({
            type: 'error',
            text: `❌ Email update failed: ${error.message}`
          });
        }
      } else {
        setMessage({
          type: 'error',
          text: '❌ Failed to update email address. Please try again.'
        });
      }
    }

    setEmailLoading(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setMessage({ type: '', text: '' });

    // Current password zorunlu
    if (!currentPassword.trim()) {
      setMessage({ type: 'error', text: 'Current password is required for security verification' });
      setPasswordLoading(false);
      return;
    }

    // Enhanced password validation
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      setPasswordLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters long' });
      setPasswordLoading(false);
      return;
    }

    // Strong password check
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!strongPasswordRegex.test(newPassword)) {
      setMessage({
        type: 'error',
        text: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)'
      });
      setPasswordLoading(false);
      return;
    }

    if (newPassword === currentPassword) {
      setMessage({ type: 'error', text: 'New password must be different from current password' });
      setPasswordLoading(false);
      return;
    }

    try {
      // First verify current password by trying to sign in
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword
      });

      if (verifyError) {
        setMessage({
          type: 'error',
          text: '❌ Current password is incorrect. Please verify your current password.'
        });
        setPasswordLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setMessage({
        type: 'success',
        text: '🔐 Password updated successfully! A confirmation email has been sent to your email address. You will remain signed in on this device, but will need to sign in again on other devices.'
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Show additional security info after 5 seconds
      setTimeout(() => {
        setMessage({
          type: 'info',
          text: '📧 Check your email for password change confirmation. If you didn\'t make this change, please contact support immediately.'
        });
      }, 5000);

      // Auto-clear success message after 15 seconds
      setTimeout(() => {
        setMessage({ type: '', text: '' });
      }, 15000);

    } catch (error) {
      DebugLogger.error('Password update failed', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ?
          (error.message.includes('rate_limit') ?
            'Too many attempts. Please wait before trying again.' :
            `Password update failed: ${error.message}`) :
          'Failed to update password'
      });
    }

    setPasswordLoading(false);
  };

  const refreshUserData = async () => {
    setLoading(true);
    try {
      const { data: { user: refreshedUser } } = await supabase.auth.getUser();
      if (refreshedUser?.email && refreshedUser.email !== email) {
        setEmail(refreshedUser.email);
        setMessage({
          type: 'success',
          text: '✅ User data refreshed successfully!'
        });
      } else {
        setMessage({
          type: 'info',
          text: 'ℹ️ User data is already up to date.'
        });
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Failed to refresh user data'
      });
    }
    setLoading(false);

    // Clear message after 3 seconds
    setTimeout(() => {
      setMessage({ type: '', text: '' });
    }, 3000);
  };
  const handleSignOut = async () => {
    const confirmSignOut = window.confirm('Are you sure you want to sign out?');
    if (confirmSignOut) {
      await authService.signOut();
      window.location.href = '/signin';
    }
  };

  return (
    <div className="py-6 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#111111] mb-2">Account Settings</h1>
              <p className="text-[#4B4B4B]">
                Manage your account preferences and security settings
              </p>
            </div>
            <button
              onClick={refreshUserData}
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 bg-[#2F80ED] text-white rounded-lg hover:bg-[#2870CE] transition-colors disabled:opacity-50"
              title="Refresh user data"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg flex items-center space-x-2 ${message.type === 'success'
            ? 'bg-green-50 border border-green-200'
            : message.type === 'info'
              ? 'bg-blue-50 border border-blue-200'
              : 'bg-red-50 border border-red-200'
            }`}>
            {message.type === 'success' ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : message.type === 'info' ? (
              <AlertCircle className="h-4 w-4 text-blue-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600" />
            )}
            <span className={
              message.type === 'success' ? 'text-green-600' :
                message.type === 'info' ? 'text-blue-600' : 'text-red-600'
            }>
              {message.text}
            </span>
          </div>
        )}

        <div className="space-y-8">
          {/* Account Information */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-[#111111] mb-4 flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Account Information</span>
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#4B4B4B] mb-1">
                  User ID
                </label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-[#4B4B4B]">
                  {user?.id || 'Loading...'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4B4B4B] mb-1">
                  Package Type
                </label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-[#4B4B4B]">
                  {userProfile?.package_type || user?.user_metadata?.package_type || 'Individual'} (Free)
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4B4B4B] mb-1">
                  Member Since
                </label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-[#4B4B4B]">
                  {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                </div>
              </div>
            </div>
          </div>

          {/* Update Email */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-[#111111] mb-4 flex items-center space-x-2">
              <Mail className="h-5 w-5" />
              <span>Update Email</span>
            </h2>

            <form onSubmit={handleUpdateEmail} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#4B4B4B] mb-2">
                  New Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent"
                  placeholder="Enter new email address"
                  disabled={emailLoading}
                />
                <p className="text-xs text-[#4B4B4B] mt-1">
                  A verification email will be sent to confirm the change
                </p>
              </div>

              <button
                type="submit"
                disabled={emailLoading || email === user?.email || !email.trim()}
                className="flex items-center space-x-2 py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-[#2F80ED] hover:bg-[#2870CE] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2F80ED] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {emailLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span>{emailLoading ? 'Sending...' : 'Update Email'}</span>
              </button>
            </form>
          </div>

          {/* Update Password */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-[#111111] mb-4 flex items-center space-x-2">
              <Lock className="h-5 w-5" />
              <span>Update Password</span>
            </h2>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#4B4B4B] mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent"
                  placeholder="Enter your current password"
                  disabled={passwordLoading}
                  required
                />
                <p className="text-xs text-[#4B4B4B] mt-1">
                  Required for security verification
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4B4B4B] mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent"
                  placeholder="Enter new password"
                  disabled={passwordLoading}
                />
                <p className="text-xs text-[#4B4B4B] mt-1">
                  Must be at least 8 characters with uppercase, lowercase, number, and special character. A confirmation email will be sent after update.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#4B4B4B] mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent"
                  placeholder="Confirm new password"
                  disabled={passwordLoading}
                />
              </div>

              <button
                type="submit"
                disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                className="flex items-center space-x-2 py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-[#2F80ED] hover:bg-[#2870CE] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2F80ED] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {passwordLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                <span>{passwordLoading ? 'Updating...' : 'Update Password'}</span>
              </button>
            </form>
          </div>

          {/* Sign Out */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-[#111111] mb-4">Sign Out</h2>
            <p className="text-[#4B4B4B] mb-4">
              Sign out of your account on this device. You'll need to sign in again to access your account.
            </p>

            <button
              onClick={handleSignOut}
              className="py-2 px-4 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors font-medium"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}