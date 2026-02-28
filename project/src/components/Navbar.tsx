import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Settings, Menu, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../lib/supabase';
import { WalletConnector } from './WalletConnector';

export function Navbar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await authService.signOut();
    navigate('/signin');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 bg-[#002d68] border-b border-[#60a5fa]/20 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <span className="text-white text-xl font-bold">Forg3t Protocol</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {user && (
              <>
                <Link
                  to="/dashboard"
                  className={`text-sm font-medium transition-colors ${
                    isActive('/dashboard')
                      ? 'text-[#60a5fa]'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  to="/settings"
                  className={`text-sm font-medium transition-colors ${
                    isActive('/settings')
                      ? 'text-[#60a5fa]'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  <Settings className="h-4 w-4" />
                </Link>
              </>
            )}
            {/* Always show WalletConnector, it will handle connected/disconnected states internally */}
            <WalletConnector />
            {user && (
              <button
                onClick={handleSignOut}
                className="text-gray-300 hover:text-white transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center space-x-2">
            <div className="md:hidden">
              <WalletConnector />
            </div>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-300 hover:text-white"
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && user && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 border-t border-[#60a5fa]/20">
              <Link
                to="/dashboard"
                className={`block px-3 py-2 text-base font-medium transition-colors ${
                  isActive('/dashboard')
                    ? 'text-[#60a5fa] bg-[#60a5fa]/10'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                to="/settings"
                className={`block px-3 py-2 text-base font-medium transition-colors ${
                  isActive('/settings')
                    ? 'text-[#60a5fa] bg-[#60a5fa]/10'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                Settings
              </Link>
              <button
                onClick={() => {
                  handleSignOut();
                  setIsMenuOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-base font-medium text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}