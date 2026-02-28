import React, { useState } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, Menu, X, User, LogOut, Settings as SettingsIcon, Brain } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { authService } from '../lib/supabase';
import { WalletConnector } from './WalletConnector';

interface LayoutProps { children: React.ReactNode; }

export function Layout({ children }: LayoutProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const publicRoutes = ['/signin', '/signup', '/onboarding'];
  const isPublicRoute = publicRoutes.includes(location.pathname);

  const menuItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, exact: true },
    { name: 'Suppression', href: '/unlearning', icon: Brain },
    { name: 'Settings', href: '/settings', icon: SettingsIcon },
  ];

  const handleSignOut = async () => { await authService.signOut(); };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-900">Loading...</div></div>;
  if (!user && !isPublicRoute) return <Navigate to="/signin" replace />;
  if (user && isPublicRoute && location.pathname !== '/onboarding' && location.pathname !== '/signup') return <Navigate to="/dashboard" replace />;
  if (isPublicRoute) return <div className="min-h-screen bg-white">{children}</div>;

  const NavItems = ({ onClick }: { onClick?: () => void }) => (
    <>
      {menuItems.map((item) => {
        const Icon = item.icon;
        const isActive = (item as any).exact ? location.pathname === item.href : location.pathname.startsWith(item.href);
        return (
          <Link key={item.name} to={item.href} onClick={onClick}>
            <div className={`${isActive ? 'bg-[#2F80ED]/10 text-[#2F80ED]' : 'text-[#4B4B4B] hover:bg-gray-50 hover:text-[#111111]'} group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors`}>
              <Icon className={`mr-3 flex-shrink-0 h-5 w-5 ${isActive ? 'text-[#2F80ED]' : 'text-gray-400 group-hover:text-[#111111]'}`} />
              {item.name}
            </div>
          </Link>
        );
      })}
    </>
  );

  const LogoBar = () => (
    <div className="flex items-center space-x-3">
      <img src="/assets/forg3t-logo.png" alt="Forg3t Protocol" className="h-8 w-auto" />
      <span className="text-gray-300">×</span>
      <img src="/assets/avax-logo.webp" alt="Avalanche" className="h-8 w-auto" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 md:hidden">
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
            <motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="relative flex-1 flex flex-col max-w-xs w-full bg-white border-r border-gray-200">
              <div className="absolute top-0 right-0 -mr-12 pt-2">
                <button className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white" onClick={() => setSidebarOpen(false)}>
                  <X className="h-6 w-6 text-white" />
                </button>
              </div>
              <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
                <div className="flex-shrink-0 flex items-center px-4 mb-5"><LogoBar /></div>
                <nav className="px-2 space-y-1"><NavItems onClick={() => setSidebarOpen(false)} /></nav>
              </div>
              <div className="px-4 mb-4"><WalletConnector /></div>
              <div className="px-4 mb-2">
                <a href="https://forg3t.io" target="_blank" rel="noopener noreferrer" className="block text-center text-sm text-[#4B4B4B] hover:text-[#2F80ED] transition-colors">Built on Avalanche</a>
              </div>
              <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
                <button onClick={handleSignOut} className="flex-shrink-0 w-full group block">
                  <div className="flex items-center"><div className="ml-3"><p className="text-sm font-medium text-[#4B4B4B] group-hover:text-[#111111]">Sign out</p></div><LogOut className="ml-auto h-5 w-5 text-gray-400 group-hover:text-[#111111]" /></div>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex-1 flex flex-col min-h-0 bg-white border-r border-gray-200">
          <div className="flex items-center h-16 px-4 border-b border-gray-200 shrink-0"><LogoBar /></div>
          <div className="flex-1 h-0 overflow-y-auto">
            <nav className="px-2 py-4 space-y-1"><NavItems /></nav>
          </div>
          <div className="px-4 mb-4"><WalletConnector /></div>
          <div className="px-4 mb-2">
            <a href="https://forg3t.io" target="_blank" rel="noopener noreferrer" className="block text-center text-sm text-[#4B4B4B] hover:text-[#2F80ED] transition-colors">Built on Avalanche</a>
          </div>
          <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
            <div className="w-full">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500"><User className="h-4 w-4" /></div>
                  <div className="ml-3 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate max-w-[120px]">{user?.email || 'User'}</p>
                    <p className="text-xs text-gray-500 truncate">Pro Plan</p>
                  </div>
                </div>
              </div>
              <button onClick={handleSignOut} className="flex w-full items-center px-2 py-2 text-sm text-gray-500 hover:text-[#111111] hover:bg-gray-50 rounded-md transition-colors">
                <LogOut className="mr-2 h-4 w-4" />Sign out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="md:pl-64 flex flex-col flex-1">
        <div className="sticky top-0 z-10 md:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-white border-b border-gray-200 flex justify-between items-center px-4 h-16">
          <button type="button" className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-500 focus:outline-none" onClick={() => setSidebarOpen(true)}>
            <span className="sr-only">Open sidebar</span>
            <Menu className="h-6 w-6 text-[#111111]" />
          </button>
          <span className="text-lg font-bold text-[#111111]">Forg3t</span>
          <div className="w-12" />
        </div>
        <main className="flex-1 py-6 px-4 sm:px-6 md:px-8">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}