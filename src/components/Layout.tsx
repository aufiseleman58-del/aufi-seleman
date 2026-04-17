import React from 'react';
import Navbar from './Navbar';
import VideoUploadModal from './VideoUploadModal';
import { useAuth } from '../AuthContext';
import { Link } from 'react-router-dom';
import { Search, Plus, Bell } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signIn, logout } = useAuth();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('read', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.docs.length);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/notifications`);
    });
    return () => unsubscribe();
  }, [user]);

  return (
    <div className="min-h-screen bg-bg-main lg:p-6 lg:flex lg:justify-center lg:gap-6">
      {/* Left Sidebar: Mission Control (Desktop Only) */}
      <aside className="hidden lg:flex flex-col w-72 bg-surface rounded-xl border border-border overflow-hidden h-[calc(100vh-48px)] sticky top-6 shadow-sm">
        <div className="p-4 border-b border-border bg-slate-50 flex justify-between items-center">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Mission Control</h2>
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
        </div>
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[10px] font-bold text-text-muted">
              <span>SERVER LOAD</span>
              <span className="text-emerald-600">24%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 w-[24%] transition-all duration-1000" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-[10px] font-bold text-text-muted">
              <span>AI MODERATION LATENCY</span>
              <span className="text-emerald-600">420ms</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 w-[12%] transition-all duration-1000" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="bg-slate-50 p-3 rounded-xl border border-border">
              <p className="text-[9px] text-text-muted mb-1 uppercase font-bold">Active Users</p>
              <p className="font-mono text-base font-bold text-primary">1.4k</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-border">
              <p className="text-[9px] text-text-muted mb-1 uppercase font-bold">TX Volume</p>
              <p className="font-mono text-base font-bold text-primary">450M</p>
            </div>
          </div>

          {user && (
            <Button 
              onClick={() => setIsUploadModalOpen(true)}
              className="w-full bg-primary hover:bg-emerald-700 text-white rounded-xl h-12 font-bold text-xs gap-2 shadow-sm"
            >
              <Plus size={16} />
              Create Video
            </Button>
          )}

          <div className="space-y-3 pt-4">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">System Logs</h3>
            <div className="p-3 bg-slate-900 rounded-xl font-mono text-[9px] text-emerald-400 space-y-1.5 overflow-hidden">
              <p className="opacity-50">&gt; Initializing Gemini 1.5 Flash...</p>
              <p className="text-emerald-300">&gt; Content moderation: ACTIVE</p>
              <p className="text-emerald-300">&gt; Fraud detection: ACTIVE</p>
              <p className="opacity-50">&gt; Monitoring Lilongwe node...</p>
              <p className="animate-pulse">&gt; _</p>
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-border bg-slate-50">
          <div className="flex items-center gap-2 text-[10px] font-bold text-text-muted">
            <div className="w-1.5 h-1.5 bg-primary rounded-full" />
            <span>MALAWIAN NODE: OPTIMAL</span>
          </div>
        </div>
      </aside>

      {/* Center: Mobile App Frame */}
      <div className="relative w-full max-w-md mx-auto lg:mx-0 lg:w-[380px] lg:h-[calc(100vh-48px)] lg:bg-slate-900 lg:rounded-[40px] lg:p-3 lg:shadow-2xl lg:border-4 lg:border-slate-700">
        <div className="bg-surface h-full w-full lg:rounded-[30px] overflow-hidden flex flex-col relative shadow-sm">
          <header className="px-4 pt-10 pb-3 bg-surface border-b border-border flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <div className="font-extrabold text-primary text-2xl tracking-tighter">Zathu</div>
              <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-sm shadow-primary/40" />
            </div>
            <div className="flex items-center gap-3">
              {user && (
                <Link to="/notifications" className="relative p-2 hover:bg-slate-100 rounded-full transition-colors text-text-muted group">
                  <Bell size={20} className="group-hover:text-primary transition-colors" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-surface shadow-sm ring-1 ring-red-500/10">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>
              )}
              <Link to="/search" className="p-2 hover:bg-slate-100 rounded-full transition-colors text-text-muted group">
                <Search size={18} className="group-hover:text-primary transition-colors" />
              </Link>
              <div className="hidden sm:flex bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ring-1 ring-emerald-100">Lite</div>
            </div>
          </header>
          
          <div className="flex-1 overflow-y-auto scrollbar-hide pb-16 lg:pb-0">
            {children}
          </div>

          <Navbar />
          
          {user && (
            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="absolute bottom-20 right-4 w-12 h-12 bg-primary text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40 lg:hidden"
              title="Create Video"
            >
              <Plus size={24} />
            </button>
          )}

          <VideoUploadModal 
            isOpen={isUploadModalOpen} 
            onClose={() => setIsUploadModalOpen(false)} 
          />
        </div>
      </div>

      {/* Right Sidebar: Market & Payments (Desktop Only) */}
      <aside className="hidden lg:flex flex-col w-72 bg-surface rounded-xl border border-border overflow-hidden h-[calc(100vh-48px)] sticky top-6">
        <div className="p-4 border-bottom border-border bg-slate-50">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Local Marketplace</h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex gap-3 items-center">
            <div className="w-12 h-12 bg-slate-100 rounded-lg shrink-0" />
            <div>
              <h4 className="text-xs font-semibold">Fertilizer (50kg)</h4>
              <p className="text-primary font-bold text-[11px]">MK 65,000</p>
              <p className="text-[9px] text-text-muted">Blantyre Central</p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <div className="w-12 h-12 bg-slate-100 rounded-lg shrink-0" />
            <div>
              <h4 className="text-xs font-semibold">Solar Pump Kit</h4>
              <p className="text-primary font-bold text-[11px]">MK 120,000</p>
              <p className="text-[9px] text-text-muted">Zomba Area</p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border bg-slate-50">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Integrated Payments</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[11px]">Airtel Money</span>
            <div className="w-8 h-4 bg-red-600 rounded" />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[11px]">TNM Mpamba</span>
            <div className="w-8 h-4 bg-emerald-600 rounded" />
          </div>
          <div className="mt-4 bg-indigo-50 text-indigo-600 text-[10px] px-2 py-1 rounded font-medium inline-block">
            AI: Scam protection active
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-border text-[10px] text-text-muted leading-relaxed italic">
          <strong>Architect Note:</strong> Optimized for React Native/Web. Images compressed to 40KB max.
        </div>
      </aside>
    </div>
  );
}
