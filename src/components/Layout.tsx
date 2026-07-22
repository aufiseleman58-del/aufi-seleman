import React from 'react';
import Navbar from './Navbar';
import VideoUploadModal from './VideoUploadModal';
import TrendingSidebar from './TrendingSidebar';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Search, Plus, Bell, Play, Database, Shield, Zap, Globe, Cpu, Bot, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, signIn, logout } = useAuth();
  const settings = useSettings();
  const location = useLocation();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const isMessagesPage = location.pathname === '/messages';
  const isReelsPage = location.pathname === '/reels';
  const isVideosPage = location.pathname === '/videos';
  const isWalletPage = location.pathname === '/wallet';
  const isStudioPage = location.pathname === '/studio';
  const isAssistantPage = location.pathname === '/assistant';

  const shouldHideHeader = isReelsPage || isMessagesPage;

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
    <div className="h-screen lg:h-auto overflow-hidden lg:overflow-visible bg-bg-main lg:p-6 lg:flex lg:justify-center lg:gap-6">
      {/* Left Sidebar: System Diagnostics (Desktop Only) */}
      <aside className="hidden lg:flex flex-col w-72 bg-surface rounded-3xl border border-border overflow-hidden h-[calc(100vh-48px)] sticky top-6 shadow-xl shadow-slate-200/50">
        <div className="p-5 border-b border-border bg-slate-50/50 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-primary" />
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-main">System Core</h2>
          </div>
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
        </div>

        <div className="p-5 flex flex-col gap-4">
           {/* Dark Mode Toggle */}
           <div className="flex items-center justify-between p-4 bg-slate-900 rounded-2xl border border-white/5 shadow-inner">
              <div className="flex items-center gap-2">
                {settings.darkMode ? <Zap size={14} className="text-primary" /> : <Shield size={14} className="text-primary" />}
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Atmospheric Mode</span>
              </div>
              <button 
                onClick={() => settings.setDarkMode(!settings.darkMode)}
                className={cn(
                  "w-10 h-5 rounded-full relative transition-all duration-300",
                  settings.darkMode ? "bg-primary" : "bg-slate-700"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all duration-300 shadow-sm",
                  settings.darkMode ? "left-5.5" : "left-0.5"
                )} />
              </button>
           </div>
        </div>

        <div className="p-5 space-y-6 flex-1 overflow-y-auto scrollbar-hide">
          {/* Health Stats */}
          <div className="space-y-4">
             <div className="space-y-2">
               <div className="flex justify-between items-center text-[9px] font-black text-text-muted uppercase tracking-widest">
                 <div className="flex items-center gap-1.5">
                   <Database size={10} />
                   <span>Neural Load</span>
                 </div>
                 <span className="text-primary">24%</span>
               </div>
               <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                 <div className="h-full bg-primary w-[24%] transition-all duration-1000" />
               </div>
             </div>

             <div className="space-y-2">
               <div className="flex justify-between items-center text-[9px] font-black text-text-muted uppercase tracking-widest">
                  <div className="flex items-center gap-1.5">
                    <Zap size={10} />
                    <span>Sync Velocity</span>
                  </div>
                  <span className="text-primary">99.9%</span>
               </div>
               <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                 <div className="h-full bg-primary w-[99%] transition-all duration-1000" />
               </div>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-4 rounded-2xl border border-border hover:border-primary/20 transition-colors">
              <p className="text-[8px] text-text-muted mb-1 font-black uppercase tracking-widest">Global Ops</p>
              <p className="font-mono text-lg font-black text-primary tracking-tighter">1.4K</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-border hover:border-primary/20 transition-colors">
              <p className="text-[8px] text-text-muted mb-1 font-black uppercase tracking-widest">MWK Ticker</p>
              <p className="font-mono text-lg font-black text-primary tracking-tighter">1.7K</p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-text-muted px-1">
              <Shield size={10} />
              <span>Security Protocols</span>
            </div>
            <div className="p-4 bg-slate-900 rounded-2xl font-mono text-[9px] text-emerald-400 space-y-2 border border-white/5 shadow-inner">
              <p className="opacity-40 italic">-- BOOTING ZATHU CORE --</p>
              <p className="text-emerald-300">&gt;&gt; MODERATION: ACTIVE</p>
              <p className="text-emerald-300">&gt;&gt; FRAUD_GUARD: STATUS_OK</p>
              <p className="opacity-40 italic">-- SYNCING MALAWI NODES --</p>
              <p className="animate-pulse text-primary">&gt; _</p>
            </div>
          </div>

          {user && (
            <Button 
              onClick={() => setIsUploadModalOpen(true)}
              className="w-full bg-primary hover:bg-emerald-700 text-white rounded-2xl h-14 font-black text-[10px] uppercase tracking-[0.2em] gap-3 shadow-xl shadow-primary/20 transition-all active:scale-95 group"
            >
              <Plus size={18} className="group-hover:rotate-90 transition-transform" />
              Upload Visuals
            </Button>
          )}
        </div>

        <div className="p-5 border-t border-border bg-slate-50/50">
          <div className="flex items-center gap-2 text-[9px] font-black text-text-muted uppercase tracking-[0.15em]">
            <Globe size={12} className="text-primary animate-spin-slow" />
            <span>Node Status: Nominal</span>
          </div>
        </div>
      </aside>

          {/* Center: Mobile App Frame */}
      <div className="relative w-full h-full max-w-md mx-auto lg:mx-0 lg:w-[380px] lg:h-[calc(100vh-48px)] lg:bg-slate-900 lg:rounded-[48px] lg:p-4 lg:shadow-[0_40px_100px_rgba(0,0,0,0.25)] lg:border-[8px] lg:border-slate-800">
        <div className="bg-surface h-full w-full lg:rounded-[36px] overflow-hidden flex flex-col relative shadow-sm">
          {!shouldHideHeader && (
            <header className="px-3 md:px-4 py-2 bg-surface/95 backdrop-blur-md border-b border-border/80 flex justify-between items-center shrink-0 sticky top-0 z-50 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
              <div className="flex items-center gap-1.5 group cursor-pointer">
                <Link to="/" className="flex items-center gap-1">
                  <span className="font-black text-primary text-xl tracking-tighter transition-all group-hover:scale-105 active:scale-95 leading-none">Zathu</span>
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
                </Link>
              </div>
              
              <ul className="flex items-center gap-1 list-none pl-0 my-0 space-y-0 select-none border-0 overflow-x-auto scrollbar-hide max-w-[calc(100%-80px)]">
                {user && (
                   <>
                    <li className="p-0 m-0 before:content-none flex items-center">
                      <Link 
                        to="/studio" 
                        className={cn(
                          "px-2.5 py-1.5 rounded-xl transition-all duration-300 flex items-center gap-1 group active:scale-95 border-2 shadow-sm font-sans",
                          location.pathname === '/studio'
                            ? "bg-gradient-to-r from-emerald-500 to-primary text-white border-transparent"
                            : "bg-emerald-500/[0.04] border-emerald-500/10 hover:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/8"
                        )}
                        title="Art Studio (AI Generate)"
                      >
                        <Sparkles size={12} className={cn("transition-transform duration-500 group-hover:rotate-12", location.pathname === '/studio' ? "text-white animate-pulse" : "text-emerald-600 dark:text-emerald-400")} />
                        <span className="text-[9px] font-black uppercase tracking-wider">Studio</span>
                      </Link>
                    </li>
                    <li className="p-0 m-0 before:content-none flex items-center">
                      <Link 
                        to="/assistant" 
                        className={cn(
                          "px-2.5 py-1.5 rounded-xl transition-all duration-300 relative flex items-center gap-1 group active:scale-95 border-2 shadow-sm font-sans",
                          location.pathname === '/assistant'
                            ? "bg-gradient-to-r from-teal-500 to-primary text-white border-transparent"
                            : "bg-teal-500/[0.04] border-teal-500/10 hover:border-teal-500/20 text-teal-600 dark:text-teal-400 hover:bg-teal-500/8"
                        )}
                        title="AI Companion"
                      >
                        <Bot size={12} className={cn("transition-transform duration-500 group-hover:scale-110", location.pathname === '/assistant' ? "text-white" : "text-teal-600 dark:text-teal-400")} />
                        <span className="text-[9px] font-black uppercase tracking-wider">AI</span>
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full animate-ping opacity-75" />
                        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-primary rounded-full" />
                      </Link>
                    </li>
                  </>
                )}
                {!user && (
                  <li className="p-0 m-0 before:content-none flex items-center">
                     <Button 
                       onClick={signIn}
                       variant="default" 
                       size="sm" 
                       className="px-3 h-8 text-[9px] font-black uppercase tracking-widest text-white bg-gradient-to-r from-primary to-emerald-600 hover:opacity-95 rounded-xl transition-all active:scale-95 border-0"
                     >
                       Join Community
                     </Button>
                  </li>
                )}
                {user && (
                   <>
                    <li className="p-0 m-0 before:content-none flex items-center shrink-0">
                      <Link 
                        to="/reels" 
                        className={cn(
                          "px-2.5 py-1.5 rounded-xl transition-all duration-300 flex items-center gap-1 group active:scale-95 border-2 shadow-sm font-sans",
                          location.pathname === '/reels'
                            ? "bg-gradient-to-r from-violet-500 to-indigo-600 text-white border-transparent"
                            : "bg-violet-500/[0.04] border-violet-500/10 hover:border-violet-500/20 text-violet-600 dark:text-violet-400 hover:bg-violet-500/8"
                        )}
                        title="Reels (Short Videos)"
                      >
                        <Play size={12} className={cn("rotate-90 transition-transform duration-500 group-hover:rotate-[100deg]", location.pathname === '/reels' ? "text-white" : "text-violet-600 dark:text-violet-400")} />
                        <span className="text-[9px] font-black uppercase tracking-wider">Reels</span>
                      </Link>
                    </li>
                    <li className="p-0 m-0 before:content-none flex items-center shrink-0">
                      <Link 
                        to="/notifications" 
                        className={cn(
                          "px-2.5 py-1.5 rounded-xl transition-all duration-300 relative flex items-center gap-1 group active:scale-95 border-2 shadow-sm font-sans",
                          location.pathname === '/notifications'
                            ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-transparent"
                            : "bg-amber-500/[0.04] border-amber-500/10 hover:border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/8"
                        )}
                        title="Notifications"
                      >
                        <Bell size={12} className={cn("transition-transform duration-500 group-hover:rotate-12", location.pathname === '/notifications' ? "text-white" : "text-amber-600 dark:text-amber-400")} />
                        <span className="text-[9px] font-black uppercase tracking-wider">Alerts</span>
                        {unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 bg-accent text-white text-[7.5px] font-black rounded-full flex items-center justify-center border border-white dark:border-slate-950 shadow-md">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </span>
                        )}
                      </Link>
                    </li>
                  </>
                )}
                <li className="p-0 m-0 before:content-none flex items-center shrink-0">
                  <Link 
                    to="/search" 
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl transition-all duration-300 flex items-center gap-1 group active:scale-95 border-2 shadow-sm font-sans",
                      location.pathname === '/search'
                        ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-transparent"
                        : "bg-blue-500/[0.04] border-blue-500/10 hover:border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/8"
                    )}
                    title="Search Hub"
                  >
                    <Search size={12} className={cn("transition-transform duration-500 group-hover:scale-110", location.pathname === '/search' ? "text-white" : "text-blue-600 dark:text-blue-400")} />
                    <span className="text-[9px] font-black uppercase tracking-wider">Search</span>
                  </Link>
                </li>
              </ul>
            </header>
          )}
          
          <div className="flex-1 overflow-y-auto scrollbar-hide pb-24">
            {children}
          </div>

          <Navbar />
          
          {user && !isMessagesPage && (
            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="absolute bottom-20 right-4 w-14 h-14 bg-primary text-white rounded-2xl shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-40 lg:hidden"
              title="Create Video"
            >
              <Plus size={28} />
            </button>
          )}

          <VideoUploadModal 
            isOpen={isUploadModalOpen} 
            onClose={() => setIsUploadModalOpen(false)} 
          />
        </div>
      </div>

      {/* Right Sidebar: Dynamic Intelligence (Desktop Only) */}
      <aside className="hidden lg:flex flex-col w-72 bg-surface rounded-3xl border border-border overflow-hidden h-[calc(100vh-48px)] sticky top-6 shadow-xl shadow-slate-200/50">
        <TrendingSidebar />
      </aside>
    </div>
  );
}
