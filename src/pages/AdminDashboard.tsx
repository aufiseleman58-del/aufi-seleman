import React, { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, limit, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, increment } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  FileText, 
  ShieldAlert, 
  TrendingUp, 
  CheckCircle2, 
  XCircle, 
  Search,
  ArrowLeft,
  Activity,
  Terminal,
  Cpu,
  Database,
  Globe,
  Settings,
  MoreVertical,
  Ban,
  ShieldCheck,
  Zap,
  BarChart3,
  ExternalLink,
  Plus,
  X,
  Pause,
  Play,
  Trash2,
  Shield,
  ArrowUpRight,
  RefreshCw,
  Coins,
  Target,
  DollarSign,
  Eye,
  MousePointerClick,
  Sparkles,
  Filter,
  Check
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { motion } from 'motion/react';
import UserComponent from '../components/User';
import { cn } from '@/lib/utils';
import { getSystemHealthReport } from '../lib/gemini';
import { toast } from 'sonner';

// Mock data for trends
const trendData = [
  { time: '09:00', load: 12, tx: 400 },
  { time: '10:00', load: 18, tx: 450 },
  { time: '11:00', load: 24, tx: 550 },
  { time: '12:00', load: 45, tx: 800 },
  { time: '13:00', load: 38, tx: 720 },
  { time: '14:00', load: 52, tx: 900 },
  { time: '15:00', load: 60, tx: 1100 },
];

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'ads' | 'moderation' | 'logs' | 'financials' | 'performance'>('overview');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPosts: 0,
    flaggedContent: 3,
    activeNow: 1422,
    latency: '420ms',
    uptime: '99.99%',
    dailyRevenue: 45000,
    totalMarketSales: 1250000
  });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [ads, setAds] = useState<any[]>([]);
  const [showCreateAd, setShowCreateAd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [flaggedPosts, setFlaggedPosts] = useState<any[]>([]);
  const [flaggedMarketItems, setFlaggedMarketItems] = useState<any[]>([]);
  const [flaggedVideos, setFlaggedVideos] = useState<any[]>([]);
  const [aiReport, setAiReport] = useState<any>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [terminalCommand, setTerminalCommand] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'admins' | 'verified' | 'banned'>('all');

  // Ad and Admin UI upgrades
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [walletAdjustUser, setWalletAdjustUser] = useState<any>(null);
  const [walletAdjustAmount, setWalletAdjustAmount] = useState<number>(10000);
  const [walletAdjustType, setWalletAdjustType] = useState<'credit' | 'debit'>('credit');
  const [processingWallet, setProcessingWallet] = useState(false);
  const [adFormState, setAdFormState] = useState({
    title: 'Summer Peak Promo',
    description: 'Exclusive 20% discount on boutique fashion and handcrafted design items this weekend across Blantyre!',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&auto=format&fit=crop',
    targetUrl: 'https://example.com/promo',
    adType: 'sponsored_post',
    placement: 'feed',
    budget: 150,
    ctaText: 'Claim Offer',
    geographicTargeting: 'National (Malawi)',
    nodePriority: 'Standard'
  });

  const filteredUsers = recentUsers.filter(u => {
    if (userFilter === 'admins' && u.role !== 'admin') return false;
    if (userFilter === 'verified' && !u.isVerified) return false;
    if (userFilter === 'banned' && !u.isBanned) return false;

    if (!userSearchQuery) return true;
    const queryLower = userSearchQuery.toLowerCase();
    const displayName = (u.displayName || '').toLowerCase();
    const id = (u.id || '').toLowerCase();
    const role = (u.role || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    return displayName.includes(queryLower) || id.includes(queryLower) || role.includes(queryLower) || email.includes(queryLower);
  });

  const handleBatchAction = async (action: 'verify' | 'ban' | 'promote') => {
    if (selectedUserIds.length === 0) {
      toast.error("No users selected");
      return;
    }

    const actionText = action === 'verify' ? 'verify' : action === 'ban' ? 'ban' : 'promote to Admin';
    if (!confirm(`Are you sure you want to ${actionText} the ${selectedUserIds.length} selected user(s)?`)) {
      return;
    }

    setLoading(true);
    let updatedCount = 0;
    try {
      await Promise.all(
        selectedUserIds.map(async (uid) => {
          const userRef = doc(db, 'users', uid);
          const updates: any = {};
          if (action === 'verify') {
            updates.isVerified = true;
          } else if (action === 'ban') {
            updates.isBanned = true;
          } else if (action === 'promote') {
            updates.role = 'admin';
          }
          await updateDoc(userRef, updates);
          updatedCount++;
        })
      );
      toast.success(`Successfully performed bulk action on ${updatedCount} user(s)`);
      setSelectedUserIds([]);
    } catch (error) {
      console.error("Bulk action failed:", error);
      toast.error("Bulk action failed: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleWalletAdjust = async () => {
    if (!walletAdjustUser) return;
    setProcessingWallet(true);
    try {
      const userRef = doc(db, 'users', walletAdjustUser.id);
      const absAmount = Number(walletAdjustAmount);
      const finalChange = walletAdjustType === 'credit' ? absAmount : -absAmount;
      
      await updateDoc(userRef, {
        walletBalance: increment(finalChange)
      });

      await addDoc(collection(db, 'transactions'), {
        amount: absAmount,
        type: walletAdjustType === 'credit' ? 'admin_deposit' : 'admin_deduction',
        senderId: 'admin_panel',
        senderName: 'Zathu System Admin',
        receiverId: walletAdjustUser.id,
        receiverName: walletAdjustUser.displayName || 'Anonymous User',
        status: 'completed',
        createdAt: serverTimestamp()
      });

      toast.success(`Successfully ${walletAdjustType === 'credit' ? 'credited' : 'debited'} MWK ${absAmount.toLocaleString()} to ${walletAdjustUser.displayName || 'User'}`);
      setWalletAdjustUser(null);
    } catch (e) {
      console.error("Wallet adjustments failed:", e);
      toast.error("Failed to adjust wallet balance: " + (e instanceof Error ? e.message : "Error"));
    } finally {
      setProcessingWallet(false);
    }
  };

  useEffect(() => {
    if (!profile) return;

    const isAdminEmail = profile.email === 'aufiseleman58@gmail.com';
    if (profile.role !== 'admin' && !isAdminEmail) {
      navigate('/');
      return;
    }

    // Flagged Content
    const unsubscribeModerationPosts = onSnapshot(query(collection(db, 'posts'), where('isFlagged', '==', true)), (snapshot) => {
      const flagged = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setFlaggedPosts(flagged);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
    });

    const unsubscribeModerationMarket = onSnapshot(query(collection(db, 'marketItems'), where('isFlagged', '==', true)), (snapshot) => {
      const flagged = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setFlaggedMarketItems(flagged);
    });

    const unsubscribeModerationVideos = onSnapshot(query(collection(db, 'videos'), where('isFlagged', '==', true)), (snapshot) => {
      const flagged = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setFlaggedVideos(flagged);
    });

    // Initial Stats Load
    const fetchStats = async () => {
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        const postsSnap = await getDocs(collection(db, 'posts'));
        setStats(prev => ({
          ...prev,
          totalUsers: usersSnap.size,
          totalPosts: postsSnap.size
        }));
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();

    // Live Users Feed
    const unsubscribeUsers = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(15)), (snapshot) => {
      const users = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setRecentUsers(users);
      
      const newLogs = snapshot.docChanges().map(change => {
        const data = change.doc.data();
        if (change.type === 'added') return `[NEW_USER] Registered: ${data.displayName || 'Anonymous'} (${change.doc.id.slice(0,6)})`;
        if (change.type === 'modified') return `[UPDATE] User profile modified: ${change.doc.id.slice(0,6)}`;
        return '';
      }).filter(l => l !== '');
      
      if (newLogs.length > 0) {
        setLogs(prev => [...newLogs, ...prev].slice(0, 20));
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setLoading(false);
    });

    const unsubscribeAds = onSnapshot(query(collection(db, 'ads'), orderBy('createdAt', 'desc')), (snapshot) => {
      const adsList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setAds(adsList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ads');
    });

    const unsubscribeTransactions = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(50)), (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setTransactions(txs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    // Initial logs
    setLogs([
      "System authenticated via Firebase IAM...",
      "Cloud Run instance active: europe-west1",
      "Monitoring Malawian local nodes: OPTIMAL",
      "Ad Revenue Stream: INITIALIZED",
      "Listening for real-time events..."
    ]);

    return () => {
      unsubscribeUsers();
      unsubscribeAds();
      unsubscribeTransactions();
      unsubscribeModerationPosts();
      unsubscribeModerationMarket();
      unsubscribeModerationVideos();
    };
  }, [profile, navigate]);

  const generateAIReport = async () => {
    setLoadingAI(true);
    try {
      const report = await getSystemHealthReport(stats, logs);
      setAiReport(report);
      toast.success("AI System Health Analysis Complete");
    } catch (err) {
      toast.error("AI Analysis Failed");
    } finally {
      setLoadingAI(false);
    }
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = terminalCommand.trim().toLowerCase();
    setLogs(prev => [`> ${terminalCommand}`, ...prev]);
    
    if (cmd === 'help') {
      setLogs(prev => [`[SYSTEM] Available commands: help, status, active-users, clear, ai-analyze, identify <uid>, restart-node`, ...prev]);
    } else if (cmd === 'status') {
      setLogs(prev => [`[SYSTEM] Status: ALL SYSTEMS NOMINAL. Population: ${stats.totalUsers}. Node: LILONGWE-PRIMARY.`, ...prev]);
    } else if (cmd === 'active-users') {
      setLogs(prev => [`[SYSTEM] Current active sessions: ${stats.activeNow}. Geographic distribution: Lilongwe (42%), Blantyre (38%), Mzuzu (20%).`, ...prev]);
    } else if (cmd === 'clear') {
      setLogs(["[SYSTEM] Kernel logs purged."]);
    } else if (cmd === 'ai-analyze') {
      generateAIReport();
    } else if (cmd === 'restart-node') {
      setLogs(prev => [`[SYSTEM] Restarting Malawian-Lite-01...`, `[SYSTEM] Handshaking with Firebase Auth...`, `[SYSTEM] Node online.`, ...prev]);
    } else {
      setLogs(prev => [`[SYSTEM] Command not recognized: ${cmd}`, ...prev]);
    }
    setTerminalCommand('');
  };

  if (!profile || (profile.role !== 'admin' && profile.email !== 'aufiseleman58@gmail.com')) return null;

  return (
    <div className="bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Technical Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link to="/profile" className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500">
            <ArrowLeft size={18} />
          </Link>
          <div className="h-6 w-[1px] bg-slate-200" />
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-primary" size={16} />
              <h1 className="text-sm font-bold uppercase tracking-widest text-slate-900">Mission Control</h1>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>
            <p className="text-[10px] text-slate-400 font-mono">NODE: LILONGWE-PRIMARY-01 // PRODUCTION</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-4 text-[10px] font-mono">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">CPU</span>
              <span className="text-emerald-600 font-bold">12.4%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">MEM</span>
              <span className="text-emerald-600 font-bold">482MB</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold gap-2 bg-white">
            <RefreshCw size={12} />
            Force Sync
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-[240px_1fr] overflow-hidden">
        {/* Management Sidebar (Desktop Only) */}
        <nav className="hidden lg:flex flex-col gap-1 p-4 border-r border-slate-200 bg-white">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-2">Systems</p>
          {[
            { id: 'overview', icon: Activity, label: 'Overview' },
            { id: 'users', icon: Users, label: 'User Admin' },
            { id: 'financials', icon: Zap, label: 'Financials' },
            { id: 'ads', icon: TrendingUp, label: 'Ad System' },
            { id: 'moderation', icon: ShieldAlert, label: 'Moderation', badge: flaggedPosts.length + flaggedMarketItems.length + flaggedVideos.length },
            { id: 'performance', icon: Cpu, label: 'Performance' },
            { id: 'logs', icon: Terminal, label: 'Kernel Logs' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left group",
                activeTab === item.id 
                  ? "bg-emerald-50 text-primary border border-emerald-100" 
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon size={18} />
                {item.label}
              </div>
              {item.badge ? (
                <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                  {item.badge}
                </span>
              ) : null}
            </button>
          ))}
          
          <div className="mt-auto space-y-4 pt-4 border-t border-slate-100 px-3">
            <div className="space-y-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase">Gemini 1.5 Flash</p>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[92%]" />
              </div>
              <p className="text-[9px] font-mono text-emerald-600">AI PIPELINE: OPTIMAL</p>
            </div>
          </div>
        </nav>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 space-y-8 max-w-7xl">
          {activeTab === 'performance' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <div className="bg-white p-6 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold font-serif italic">Neural Performance Nodes</h2>
                    <p className="text-[10px] text-slate-400 font-mono italic">REAL-TIME HARDWARE & NETWORK TELEMETRY</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black border border-emerald-100">STABLE</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[
                    { label: 'CPU LOAD', value: '14.2%', icon: Cpu, color: 'text-blue-500' },
                    { label: 'MEMORY', value: '842MB', icon: Database, color: 'text-purple-500' },
                    { label: 'LATENCY', value: '42ms', icon: Globe, color: 'text-emerald-500' },
                    { label: 'UPTIME', value: '99.99%', icon: Activity, color: 'text-indigo-500' }
                  ].map((perf, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center gap-2">
                        <perf.icon size={16} className={perf.color} />
                        <span className="text-[10px] font-black uppercase text-slate-400">{perf.label}</span>
                      </div>
                      <p className="text-2xl font-mono font-black text-slate-900">{perf.value}</p>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className={cn("h-full bg-current", perf.color)} style={{ width: '40%' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-slate-900 rounded-3xl p-6 border border-slate-800 relative overflow-hidden group">
                  <div className="flex justify-between items-center mb-8 relative z-10">
                    <h3 className="text-white font-mono text-sm uppercase tracking-widest flex items-center gap-2">
                      <Terminal size={16} className="text-emerald-500" />
                      Latency Heatmap
                    </h3>
                    <div className="flex items-center gap-2 text-white/40 text-[10px] font-mono">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      BLANTYRE_NODE_01
                    </div>
                  </div>
                  <div className="h-[300px] w-full relative z-10 flex items-center justify-center border-2 border-dashed border-white/5 rounded-2xl">
                     <div className="text-center space-y-2">
                        <RefreshCw size={40} className="text-emerald-500/20 mx-auto animate-spin" />
                        <p className="text-[10px] font-mono text-emerald-500/40 uppercase tracking-[0.3em]">Mapping Geographic Latency...</p>
                     </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-6">
                   <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Resource Priority</h3>
                   <div className="space-y-4">
                      {[
                        { label: 'Video Streaming', value: 85 },
                        { label: 'Marketplace DB', value: 62 },
                        { label: 'Identity Auth', value: 94 },
                        { label: 'Ad Delivery', value: 45 }
                      ].map((item, i) => (
                        <div key={i} className="space-y-2">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className="text-slate-500 uppercase">{item.label}</span>
                            <span className="text-slate-900">{item.value}%</span>
                          </div>
                          <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${item.value}%` }}
                              className="h-full bg-primary"
                            />
                          </div>
                        </div>
                      ))}
                   </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'financials' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-3xl border border-slate-200 gap-4">
                <div>
                  <h2 className="text-xl font-serif italic text-slate-900">Capital Management</h2>
                  <p className="text-xs text-slate-400 font-mono mt-1 uppercase tracking-widest">ECOSYSTEM REVENUE & LIQUIDITY FLOW</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="h-10 rounded-xl font-bold text-xs gap-2 border-slate-200 bg-white">
                    <Database size={14} />
                    Audit Logs
                  </Button>
                  <Button className="h-10 rounded-xl font-bold text-xs gap-2 shadow-lg shadow-primary/10">
                    <TrendingUp size={14} />
                    Payout Merchant
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 {[
                   { label: 'Total Marketplace Volume', value: 'MK 1,250,500', icon: Database, color: 'text-blue-500', trend: '+12% this month' },
                   { label: 'Daily Ad Revenue', value: 'MK 84,200', icon: TrendingUp, color: 'text-emerald-500', trend: 'Stable flow' },
                   { label: 'Platform Fees (2.5%)', value: 'MK 31,262', icon: Zap, color: 'text-amber-500', trend: 'Collected' }
                 ].map((card, i) => (
                   <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative group overflow-hidden">
                     <div className="relative z-10 space-y-4">
                        <div className="flex justify-between items-start">
                           <div className={cn("p-2 rounded-2xl bg-slate-50", card.color)}>
                              <card.icon size={20} />
                           </div>
                           <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{card.trend}</span>
                        </div>
                        <div>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">{card.label}</p>
                           <p className="text-3xl font-mono font-black text-slate-900 leading-none">{card.value}</p>
                        </div>
                     </div>
                     <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <card.icon size={100} />
                     </div>
                   </div>
                 ))}
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                   <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Global Ledger Stream</h3>
                   <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                      <RefreshCw size={10} className="animate-spin" />
                      LIVE TRANSACTIONS
                   </div>
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-left font-mono">
                      <thead>
                        <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                           <th className="px-6 py-4">TX REF</th>
                           <th className="px-6 py-4">Sender / Recipient</th>
                           <th className="px-6 py-4">Amount</th>
                           <th className="px-6 py-4">Type</th>
                           <th className="px-6 py-4">Status</th>
                           <th className="px-6 py-4 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 italic font-serif">
                        {transactions.length === 0 ? (
                           <tr>
                              <td colSpan={6} className="py-16 text-center text-slate-300 font-mono text-[10px] uppercase tracking-[0.3em]">No valid transactions found in local node</td>
                           </tr>
                        ) : (
                          transactions.map(tx => (
                            <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors group not-italic">
                               <td className="px-6 py-4">
                                  <span className="text-[10px] font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded select-all font-mono">#{tx.id.slice(0, 8).toUpperCase()}</span>
                               </td>
                               <td className="px-6 py-4">
                                  <div className="flex flex-col gap-0.5 text-[11px] font-sans">
                                     <span className="font-bold text-slate-900 truncate max-w-[120px]">{tx.senderName || 'System'}</span>
                                     <span className="text-slate-400 text-[10px] mt-0.5 opacity-60">→ {tx.receiverName || 'System'}</span>
                                  </div>
                               </td>
                               <td className="px-6 py-4">
                                  <p className="text-[11px] font-black text-slate-900">MWK {tx.amount?.toLocaleString()}</p>
                               </td>
                               <td className="px-6 py-4">
                                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 px-1.5 py-0.5 border border-slate-100 rounded-md">{tx.type?.replace('_', ' ')}</span>
                               </td>
                               <td className="px-6 py-4">
                                  <div className="flex items-center gap-1.5">
                                     <div className={cn("w-1.5 h-1.5 rounded-full", tx.status === 'completed' ? "bg-emerald-500" : "bg-amber-500")} />
                                     <span className="text-[10px] font-bold uppercase text-slate-600">{tx.status}</span>
                                  </div>
                               </td>
                               <td className="px-6 py-4 text-right text-[10px] font-mono text-slate-400">
                                  {tx.createdAt?.toDate().toLocaleTimeString()}
                               </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                   </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'overview' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* Primary Stats Panel */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Network Population', value: stats.totalUsers, icon: Users, color: 'blue', sub: '+12 today' },
                  { label: 'Transmission Volume', value: stats.totalPosts, icon: FileText, color: 'emerald', sub: 'Healthy' },
                  { label: 'Anomalies Detected', value: stats.flaggedContent, icon: ShieldAlert, color: 'red', sub: 'Requires Review' },
                  { label: 'Active Sessions', value: stats.activeNow, icon: Activity, color: 'indigo', sub: 'Peak load' },
                ].map((item) => (
                  <div key={`stat-${item.label}`} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-transform hover:-translate-y-1">
                    <div className="flex justify-between items-start mb-4">
                      <div className={cn("p-2 rounded-xl", item.color === 'blue' ? "bg-blue-50 text-blue-600" : item.color === 'emerald' ? "bg-emerald-50 text-emerald-600" : item.color === 'red' ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600")}>
                        <item.icon size={20} />
                      </div>
                      <p className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", item.color === 'blue' ? "bg-blue-50 text-blue-600" : item.color === 'emerald' ? "bg-emerald-50 text-emerald-600" : item.color === 'red' ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600")}>
                        {item.sub}
                      </p>
                    </div>
                    <p className="text-xs font-serif italic text-slate-400 mb-1">{item.label}</p>
                    <div className="flex items-end justify-between">
                      <p className="text-3xl font-mono font-black tracking-tighter text-slate-900">{item.value.toLocaleString()}</p>
                      <div className="flex items-center gap-1 mb-1">
                        <ArrowUpRight size={12} className="text-emerald-500" />
                        <span className="text-[9px] font-black text-emerald-500">4.2%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Data Visuals */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                        System Load Analysis
                        <TrendingUp size={14} className="text-primary" />
                      </h3>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">REAL-TIME TRAFFIC PATTERNS (24H)</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-2 text-[10px] font-medium text-slate-500">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        Network Load
                      </div>
                    </div>
                  </div>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="colorLoad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="time" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#94a3b8' }} 
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#94a3b8' }} 
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: '#1e293b', 
                            border: 'none', 
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '11px',
                            fontFamily: 'JetBrains Mono'
                          }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="load" 
                          stroke="#10b981" 
                          strokeWidth={2}
                          fillOpacity={1} 
                          fill="url(#colorLoad)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* AI Status Card */}
                <div className="bg-slate-900 rounded-3xl p-6 text-white flex flex-col justify-between relative overflow-hidden group shadow-2xl">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_100%,_rgba(16,185,129,0.1),transparent_50%)]" />
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                    <Cpu size={120} />
                  </div>
                  <div className="relative z-10 h-full flex flex-col">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-mono bg-primary/20 text-primary px-2 py-0.5 rounded-full inline-block">AI PIPELINE</span>
                          <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <h3 className="text-xl font-bold font-serif italic text-white/90">Zathu Mission Intelligence</h3>
                      </div>
                      <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <Activity size={20} className="text-primary" />
                      </div>
                    </div>

                    <div className="flex-1 space-y-6">
                      {aiReport ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                          <div className="flex items-center gap-2">
                             <div className={cn(
                               "w-2 h-2 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]",
                               aiReport.health === 'Stable' ? "bg-emerald-500" : aiReport.health === 'Warning' ? "bg-amber-500" : "bg-red-500"
                             )} />
                             <span className="text-[10px] font-black uppercase tracking-widest">{aiReport.health} Operation</span>
                          </div>
                          <p className="text-xs text-slate-400 font-medium leading-relaxed italic border-l-2 border-primary/40 pl-3">
                            "{aiReport.summary}"
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Priority</span>
                              <span className={cn(
                                "text-[10px] font-black uppercase",
                                aiReport.priority === 'High' ? "text-red-400" : "text-emerald-400"
                              )}>{aiReport.priority}</span>
                            </div>
                            <div className="bg-white/5 p-3 rounded-2xl border border-white/10">
                              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">Optimization</span>
                              <span className="text-[10px] font-black text-blue-400">READY</span>
                            </div>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <div className="flex justify-between text-[11px] font-mono opacity-60">
                              <span>THROUGHPUT</span>
                              <span className="text-primary">14.2 req/sec</span>
                            </div>
                            <div className="flex justify-between text-[11px] font-mono opacity-60">
                              <span>LATENCY</span>
                              <span className="text-primary">420ms</span>
                            </div>
                          </div>

                          <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                            <div className="flex justify-between items-center text-[10px] font-bold">
                              <span className="uppercase tracking-widest text-white/50">Model Load</span>
                              <span className="text-primary">64%</span>
                            </div>
                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-primary w-[64%] shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <Button 
                    onClick={generateAIReport}
                    disabled={loadingAI}
                    className="w-full mt-6 bg-white text-slate-900 hover:bg-slate-100 rounded-xl h-12 text-[11px] font-bold uppercase tracking-widest shadow-xl shadow-black/20"
                  >
                    {loadingAI ? <RefreshCw size={14} className="animate-spin" /> : "Initiate Predictive Scan"}
                  </Button>
                </div>
              </div>

              {/* Management Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* User Administration List */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-sm font-bold uppercase tracking-widest">Identity Management</h3>
                    <Button variant="ghost" size="sm" className="text-xs h-8 text-slate-500 hover:text-primary">
                      Manage All
                    </Button>
                  </div>
                  <div className="divide-y divide-slate-100 font-mono">
                    <div className="grid grid-cols-4 px-6 py-2 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      <span className="col-span-2">User Identity</span>
                      <span>Security</span>
                      <span className="text-right">Action</span>
                    </div>
                    {loading ? (
                      <div className="p-10 text-center text-slate-400 text-xs italic">Awaiting database stream...</div>
                    ) : (
                      recentUsers.slice(0, 5).map(u => (
                        <div key={u.id} className="grid grid-cols-4 px-6 py-4 items-center hover:bg-slate-50 transition-colors">
                          <div className="col-span-2 flex items-center gap-3">
                            <UserComponent 
                              displayName={u.displayName} 
                              photoURL={u.photoURL} 
                              isVerified={u.isVerified}
                              size="sm"
                              showBadge={false}
                              className="rounded-lg"
                            />
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-slate-900 truncate">@{u.id.slice(0, 4)}_{u.displayName?.split(' ')[0]}</p>
                              <p className="text-[10px] text-slate-400 truncate tracking-tighter">{u.email}</p>
                            </div>
                          </div>
                          <div className="flex">
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded uppercase font-bold",
                              u.isVerified ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                            )}>
                              {u.isVerified ? 'VERIFIED' : 'PENDING'}
                            </span>
                          </div>
                          <div className="flex justify-end pr-1">
                            <button className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-400">
                              <MoreVertical size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* System Logs */}
                <div className="bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col h-[400px]">
                  <div className="p-4 border-b border-white/5 bg-slate-800/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Terminal size={14} className="text-primary" />
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Live System Log</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                      <span className="text-[9px] text-emerald-500/70 font-mono">STREAMING</span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-1.5 text-slate-400 scrollbar-hide">
                    {logs.map((log, i) => (
                      <div key={`overview-log-${i}`} className="flex gap-3 text-left">
                        <span className="text-slate-600 shrink-0">[{new Date().toLocaleTimeString()}]</span>
                        <span className={cn(
                          log.includes('NEW_USER') ? "text-emerald-400" : 
                          log.includes('UPDATE') ? "text-blue-400" : "text-slate-300"
                        )}>
                          {log}
                        </span>
                      </div>
                    ))}
                    <div className="animate-pulse flex gap-3">
                      <span className="text-slate-600">[{new Date().toLocaleTimeString()}]</span>
                      <span className="text-emerald-400">_</span>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-950/50 flex gap-2">
                    <form onSubmit={handleTerminalSubmit} className="flex-1 flex gap-2">
                      <input 
                        value={terminalCommand}
                        onChange={(e) => setTerminalCommand(e.target.value)}
                        placeholder="Enter command or filter..."
                        className="flex-1 bg-white/5 rounded-lg border border-white/10 h-8 flex items-center px-3 text-[10px] font-mono text-white/100 outline-none focus:border-primary/50 transition-colors"
                      />
                      <Button type="submit" variant="secondary" size="sm" className="h-8 text-[9px] bg-primary text-white hover:bg-emerald-600">
                        Execute
                      </Button>
                    </form>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'users' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl border border-slate-200 gap-4">
                <div>
                  <h2 className="text-xl font-serif italic text-slate-900">User Identification Bureau</h2>
                  <p className="text-xs text-slate-400 font-mono mt-1">TOTAL POPULATION: {stats.totalUsers}</p>
                </div>
                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto items-stretch md:items-center">
                  <div className="flex bg-slate-100 rounded-xl p-0.5 border border-slate-200/60 font-sans text-[11px] gap-0.5">
                    {[
                      { id: 'all', label: 'All Users' },
                      { id: 'admins', label: 'Admins' },
                      { id: 'verified', label: 'Verified' },
                      { id: 'banned', label: 'Banned' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setUserFilter(tab.id as any)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg font-bold transition-all",
                          userFilter === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative col-span-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Search identity logs..." 
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs w-full md:w-44 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-left"
                    />
                  </div>
                  <Button className="h-9 px-4 text-xs font-bold rounded-xl gap-2">
                    <Users size={14} />
                    Export CSV
                  </Button>
                </div>
              </div>

              {selectedUserIds.length > 0 && (
                <div className="bg-emerald-50/60 border border-emerald-200 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-3 animate-in fade-in duration-200">
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-100/80 text-emerald-800 text-xs font-mono font-bold px-3 py-1.5 rounded-xl border border-emerald-200 flex items-center gap-1.5">
                      <Users size={12} className="text-emerald-700" />
                      <span>{selectedUserIds.length} SELECTED</span>
                    </div>
                    <span className="text-xs text-slate-700 font-mono italic">Execute batch actions simultaneously:</span>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <Button 
                      onClick={() => handleBatchAction('verify')} 
                      className="bg-blue-600 hover:bg-blue-700 text-white font-mono text-[10px] uppercase font-bold tracking-widest h-8 px-3 rounded-lg"
                    >
                      Verify
                    </Button>
                    <Button 
                      onClick={() => handleBatchAction('promote')} 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-[10px] uppercase font-bold tracking-widest h-8 px-3 rounded-lg"
                    >
                      Promote Admin
                    </Button>
                    <Button 
                      onClick={() => handleBatchAction('ban')} 
                      className="bg-red-600 hover:bg-red-700 text-white font-mono text-[10px] uppercase font-bold tracking-widest h-8 px-3 rounded-lg"
                    >
                      Ban
                    </Button>
                    <button 
                      onClick={() => setSelectedUserIds([])}
                      className="px-3 text-slate-500 hover:text-slate-800 text-[10px] uppercase font-bold tracking-widest font-mono h-8 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left font-mono min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <th className="px-6 py-4 w-12 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUserIds(filteredUsers.map(user => user.id));
                            } else {
                              setSelectedUserIds([]);
                            }
                          }}
                          className="rounded border-slate-300 text-primary focus:ring-primary size-4 cursor-pointer"
                        />
                      </th>
                      <th className="px-6 py-4">UID / Identity</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Security</th>
                      <th className="px-6 py-4">Wallet Bal.</th>
                      <th className="px-6 py-4 text-right">Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 italic">
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="text-[11px] group hover:bg-slate-50/50 transition-colors not-italic">
                        <td className="px-6 py-4 w-12 text-center">
                          <input 
                            type="checkbox"
                            checked={selectedUserIds.includes(u.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUserIds(prev => [...prev, u.id]);
                              } else {
                                setSelectedUserIds(prev => prev.filter(uid => uid !== u.id));
                              }
                            }}
                            className="rounded border-slate-300 text-primary focus:ring-primary size-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <UserComponent 
                              displayName={u.displayName} 
                              photoURL={u.photoURL} 
                              isVerified={u.isVerified}
                              size="sm"
                              showBadge={false}
                            />
                            <div>
                              <p className="font-bold text-slate-900 uppercase">#{u.id.slice(0, 8)}</p>
                              <p className="text-slate-400 font-mono text-[9px] uppercase tracking-tighter">{u.displayName || 'Unnamed User'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", u.isOnline ? "bg-emerald-500" : "bg-slate-300")} />
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-widest",
                              u.isOnline ? "text-emerald-600" : "text-slate-400"
                            )}>
                              {u.isOnline ? 'ONLINE' : 'OFFLINE'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Shield className={cn("size-3", u.role === 'admin' ? "text-primary" : "text-slate-300")} />
                            <span className="uppercase font-mono text-[9px] font-bold text-slate-500">{u.role || 'user'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-900 font-black font-mono">
                          MK {u.walletBalance?.toLocaleString() || '0'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                            {u.role !== 'admin' ? (
                              <Button 
                                onClick={async () => {
                                  try {
                                    await updateDoc(doc(db, 'users', u.id), { role: 'admin' });
                                    toast.success(`${u.displayName} promoted to Admin`);
                                  } catch (e) {
                                    console.error("Promote error:", e);
                                    toast.error(`Failed to promote: ${e instanceof Error ? e.message : 'Unknown error'}`);
                                  }
                                }}
                                variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary hover:bg-emerald-50"
                                title="Promote to Admin"
                              >
                                <ShieldCheck size={14} />
                              </Button>
                            ) : (
                              <Button 
                                onClick={async () => {
                                  try {
                                    await updateDoc(doc(db, 'users', u.id), { role: 'user' });
                                    toast.success(`${u.displayName} demoted to User`);
                                  } catch (e) {
                                    console.error("Demote error:", e);
                                    toast.error(`Failed to demote: ${e instanceof Error ? e.message : 'Unknown error'}`);
                                  }
                                }}
                                variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:bg-slate-100"
                                title="Demote to User"
                              >
                                <ShieldAlert size={14} />
                              </Button>
                            )}
                            {!u.isVerified ? (
                              <Button 
                                onClick={async () => {
                                  try {
                                    await updateDoc(doc(db, 'users', u.id), { isVerified: true });
                                    toast.success(`${u.displayName} verified`);
                                  } catch (e) {
                                    console.error("Verify error:", e);
                                    toast.error(`Failed to verify: ${e instanceof Error ? e.message : 'Unknown error'}`);
                                  }
                                }}
                                variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-500 hover:bg-blue-50"
                                title="Verify User"
                              >
                                <CheckCircle2 size={14} />
                              </Button>
                            ) : (
                              <Button 
                                onClick={async () => {
                                  try {
                                    await updateDoc(doc(db, 'users', u.id), { isVerified: false });
                                    toast.success(`${u.displayName} unverified`);
                                  } catch (e) {
                                    console.error("Unverify error:", e);
                                    toast.error(`Failed to unverify: ${e instanceof Error ? e.message : 'Unknown error'}`);
                                  }
                                }}
                                variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:bg-slate-100"
                                title="Remove Verification"
                              >
                                <XCircle size={14} />
                              </Button>
                            )}
                            {!u.isBanned ? (
                              <Button 
                                onClick={async () => {
                                  if (confirm(`Ban user ${u.displayName}?`)) {
                                    try {
                                      await updateDoc(doc(db, 'users', u.id), { isBanned: true });
                                      toast.error(`${u.displayName} has been banned`);
                                    } catch (e) {
                                      console.error("Ban error:", e);
                                      toast.error(`Failed to ban: ${e instanceof Error ? e.message : 'Unknown error'}`);
                                    }
                                  }
                                }}
                                variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                                title="Ban User"
                              >
                                <Ban size={14} />
                              </Button>
                            ) : (
                              <Button 
                                onClick={async () => {
                                  try {
                                    await updateDoc(doc(db, 'users', u.id), { isBanned: false });
                                    toast.success(`${u.displayName} has been unbanned`);
                                  } catch (e) {
                                    console.error("Unban error:", e);
                                    toast.error(`Failed to unban: ${e instanceof Error ? e.message : 'Unknown error'}`);
                                  }
                                }}
                                variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-500 hover:bg-amber-50"
                                title="Unban User"
                              >
                                <Ban size={14} />
                              </Button>
                            )}
                            <Button 
                              onClick={() => {
                                setWalletAdjustUser(u);
                                setWalletAdjustAmount(10000);
                                setWalletAdjustType('credit');
                              }}
                              variant="ghost" size="sm" className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50 pointer-events-auto cursor-pointer"
                              title="Set or Adjust Wallet Balance"
                            >
                              <Coins size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'ads' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl border border-slate-200 gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-serif italic text-slate-900">Advertisement Network</h2>
                    <span className="text-[10px] bg-emerald-50 text-primary px-2 py-0.5 rounded-full font-mono font-bold border border-emerald-100">LIVE</span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">ACTIVE CAMPAIGNS: {ads.filter(a => a.status === 'active').length} // TOTAL REACH: {ads.reduce((acc, curr) => acc + (curr.impressions || 0), 0).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="h-9 px-4 text-xs font-bold rounded-xl gap-2 bg-white">
                    <BarChart3 size={14} />
                    Report
                  </Button>
                  <Button 
                    onClick={() => setShowCreateAd(true)}
                    className="h-9 px-4 text-xs font-bold rounded-xl gap-2 shadow-sm"
                  >
                    <Plus size={14} />
                    New Campaign
                  </Button>
                </div>
              </div>

              {/* Ad Stats Bar */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { label: 'Impressions', value: ads.reduce((acc, curr) => acc + (curr.impressions || 0), 0), icon: Globe, color: 'blue' },
                  { label: 'Interactions', value: ads.reduce((acc, curr) => acc + (curr.clicks || 0), 0), icon: ExternalLink, color: 'emerald' },
                  { label: 'Global CTR', value: ads.length ? `${((ads.reduce((acc, curr) => acc + (curr.clicks || 0), 0) / ads.reduce((acc, curr) => acc + (curr.impressions || 1), 1)) * 100).toFixed(2)}%` : '0%', icon: BarChart3, color: 'orange' },
                  { label: 'Revenue (MWK)', value: (ads.reduce((acc, curr) => acc + (curr.spent || 0), 0) * 1700).toLocaleString(), icon: TrendingUp, color: 'primary' },
                ].map((stat, i) => (
                  <div key={`ad-stat-${i}`} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                     <div className="flex items-center gap-3 mb-2 relative z-10">
                        <div className={cn("p-1.5 rounded-lg", 
                          stat.color === 'blue' ? "bg-blue-50 text-blue-600" : 
                          stat.color === 'emerald' ? "bg-emerald-50 text-emerald-600" : 
                          stat.color === 'orange' ? "bg-orange-50 text-orange-600" : 
                          "bg-emerald-50 text-primary"
                        )}>
                           <stat.icon size={14} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</span>
                     </div>
                     <p className="text-2xl font-mono font-black text-slate-900 relative z-10">{stat.value}</p>
                     <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <stat.icon size={80} />
                     </div>
                  </div>
                ))}
              </div>

              {/* Ad List */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                 <div className="overflow-x-auto">
                   <table className="w-full text-left font-mono min-w-[900px]">
                     <thead>
                       <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                          <th className="px-6 py-4 col-span-2">Campaign Detail</th>
                          <th className="px-6 py-4">Type / Placement</th>
                          <th className="px-6 py-4">Efficiency</th>
                          <th className="px-6 py-4">Budget Utilization</th>
                          <th className="px-6 py-4 text-right">Admin Control</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 italic font-serif">
                        {ads.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-12 text-center text-slate-300 text-xs italic font-serif uppercase tracking-widest">Awaiting Campaign Data...</td>
                          </tr>
                        ) : (
                          ads.map(ad => (
                            <tr 
                              key={ad.id} 
                              onClick={() => setSelectedAd(ad)}
                              className="hover:bg-slate-50/50 cursor-pointer transition-colors group"
                            >
                               <td className="px-6 py-4">
                                  <div className="flex items-center gap-4">
                                     <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0">
                                        <img src={ad.imageUrl} alt="" className="w-full h-full object-cover" />
                                     </div>
                                     <div className="min-w-0 font-sans not-italic">
                                        <h4 className="text-[12px] font-bold text-slate-900 truncate uppercase tracking-tight">{ad.title}</h4>
                                        <p className="text-[10px] text-slate-400 truncate font-mono italic">{ad.targetUrl}</p>
                                        <div className="flex items-center gap-1 mt-1">
                                          <div className={cn("w-1.5 h-1.5 rounded-full", ad.status === 'active' ? "bg-emerald-500" : "bg-orange-500")} />
                                          <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">{ad.status}</span>
                                        </div>
                                     </div>
                                  </div>
                               </td>
                               
                               <td className="px-6 py-4">
                                  <div className="flex flex-col gap-1 font-sans not-italic">
                                     <span className="text-[10px] font-black text-primary uppercase tracking-tighter">{ad.adType?.replace('_', ' ')}</span>
                                     <span className="text-[9px] text-slate-400 font-mono bg-slate-50 px-1 py-0.5 rounded self-start">LOC: {ad.placement}</span>
                                  </div>
                               </td>
    
                               <td className="px-6 py-4">
                                  <div className="space-y-1 font-sans not-italic">
                                     <p className="text-[11px] font-bold text-slate-900">{ad.clicks || 0} clicks</p>
                                     <p className="text-[10px] text-slate-400 font-mono tracking-tighter">{ad.impressions || 0} impressions</p>
                                     <div className="text-[9px] font-black text-primary flex items-center gap-1">
                                        <TrendingUp size={10} />
                                        {ad.impressions ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : 0}% CTR
                                     </div>
                                  </div>
                               </td>
    
                               <td className="px-6 py-4">
                                  <div className="space-y-2 font-sans not-italic">
                                     <div className="flex justify-between items-end">
                                        <p className="text-[11px] font-bold text-emerald-600">${ad.spent || 0}</p>
                                        <p className="text-[9px] text-slate-400">Target: ${ad.budget}</p>
                                     </div>
                                     <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, ((ad.spent || 0) / ad.budget) * 100)}%` }} />
                                     </div>
                                  </div>
                               </td>
    
                               <td className="px-6 py-4 text-right">
                                  <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                                     <Button 
                                       onClick={async (e) => {
                                          e.stopPropagation();
                                          await updateDoc(doc(db, 'ads', ad.id), {
                                             status: ad.status === 'active' ? 'paused' : 'active'
                                          });
                                       }}
                                       variant="outline" 
                                       size="sm" 
                                       className={cn("h-8 w-8 p-0 rounded-xl transition-all", ad.status === 'active' ? "text-orange-500 hover:bg-orange-600 hover:text-white border-orange-100" : "text-emerald-500 hover:bg-emerald-600 hover:text-white border-emerald-100")}
                                     >
                                        {ad.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
                                     </Button>
                                     <Button 
                                       onClick={async (e) => {
                                          e.stopPropagation();
                                          if (confirm('TERMINATE THIS CAMPAIGN PERMANENTLY?')) {
                                             await deleteDoc(doc(db, 'ads', ad.id));
                                          }
                                       }}
                                       variant="outline" 
                                       size="sm" 
                                       className="h-8 w-8 p-0 rounded-xl text-red-500 hover:bg-red-600 hover:text-white border-red-50 transition-all"
                                     >
                                        <Trash2 size={14} />
                                     </Button>
                                  </div>
                               </td>
                            </tr>
                          ))
                        )}
                     </tbody>
                   </table>
                 </div>
              </div>

              {/* Create Ad Modal / Advanced Multi-Preset Device Builder */}
              {showCreateAd && (
                 <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <motion.div 
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-white max-w-5xl w-full rounded-3xl overflow-hidden shadow-2xl flex flex-col"
                    >
                       <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                          <div>
                            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest font-black">Zathu Ad-Network Wizard</span>
                            <h3 className="font-serif italic font-bold text-slate-800 text-lg leading-tight uppercase">Campaign Creator & Mock Simulator</h3>
                          </div>
                          <button onClick={() => setShowCreateAd(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                             <X size={20} className="text-slate-500" />
                          </button>
                       </div>
                       
                       <div className="p-6 overflow-y-auto max-h-[75vh]">
                          <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider text-left mb-2">Populate Fields Instantly With A Concept Template:</p>
                          {/* Live Presets Selector Bar */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                            {[
                              {
                                title: 'Weekend Flash Sale ⚡',
                                description: 'Boutique premium wears & handcraft items are 25% OFF this Saturday in Blantyre!',
                                imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&auto=format&fit=crop',
                                targetUrl: 'https://ais-dev-iyinzog55uvtqjid3yyuzf-148614473825.europe-west1.run.app/marketplace',
                                adType: 'marketplace_boost',
                                placement: 'marketplace',
                                ctaText: 'Claim 25% Off',
                                budget: 250,
                                geographicTargeting: 'Blantyre Node Beta',
                                nodePriority: 'High'
                              },
                              {
                                title: 'Zathu Tech Accelerator 🚀',
                                description: 'Get exclusive access to the high-efficiency social tools. Fast, secure, optimal connectivity!',
                                imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop',
                                targetUrl: 'https://ais-dev-iyinzog55uvtqjid3yyuzf-148614473825.europe-west1.run.app/reels',
                                adType: 'sponsored_post',
                                placement: 'feed',
                                ctaText: 'Launch Now',
                                budget: 150,
                                geographicTargeting: 'National (Malawi)',
                                nodePriority: 'Standard'
                              },
                              {
                                title: 'Mzuzu Cultural Fusion Music Fest 🎵',
                                description: 'Celebrate local arts and sound waves this August in Mzuzu Main Stadium. Pre-sale tickets live!',
                                imageUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=600&auto=format&fit=crop',
                                targetUrl: 'https://example.com/mzuzu-fest',
                                adType: 'video_preroll',
                                placement: 'feed',
                                ctaText: 'Get Tickets',
                                budget: 350,
                                geographicTargeting: 'Mzuzu Node Gamma',
                                nodePriority: 'Premium'
                              }
                            ].map((p, idx) => (
                              <button
                                key={`preset-${idx}`}
                                type="button"
                                onClick={() => {
                                  setAdFormState({
                                    title: p.title,
                                    description: p.description,
                                    imageUrl: p.imageUrl,
                                    targetUrl: p.targetUrl,
                                    adType: p.adType,
                                    placement: p.placement,
                                    budget: p.budget,
                                    ctaText: p.ctaText,
                                    geographicTargeting: p.geographicTargeting,
                                    nodePriority: p.nodePriority
                                  });
                                  toast.success(`Pre-populated "${p.title}" details!`);
                                }}
                                className="flex flex-col items-start p-3 bg-slate-50 border border-slate-200/80 hover:border-emerald-400 hover:bg-emerald-50/20 rounded-2xl text-left transition-all group shrink-0"
                              >
                                <span className="text-[9.5px] font-mono uppercase bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-black mb-1 shrink-0">{p.adType.replace('_', ' ')}</span>
                                <p className="text-[11px] font-bold text-slate-800 line-clamp-1 group-hover:text-primary transition-colors">{p.title}</p>
                                <p className="text-[9.5px] text-slate-400 line-clamp-1 italic">"{p.description}"</p>
                              </button>
                            ))}
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                            {/* Left Panel: Form Input Fields */}
                            <form 
                              onSubmit={async (e) => {
                                 e.preventDefault();
                                 try {
                                   const data = {
                                      title: adFormState.title,
                                      description: adFormState.description,
                                      imageUrl: adFormState.imageUrl || 'https://picsum.photos/seed/ad/1200/600',
                                      targetUrl: adFormState.targetUrl,
                                      adType: adFormState.adType,
                                      placement: adFormState.placement,
                                      budget: Number(adFormState.budget),
                                      ctaText: adFormState.ctaText || 'Learn More',
                                      geographicTargeting: adFormState.geographicTargeting,
                                      nodePriority: adFormState.nodePriority,
                                      status: 'active',
                                      impressions: 0,
                                      clicks: 0,
                                      spent: 0,
                                      createdAt: serverTimestamp()
                                   };

                                   await addDoc(collection(db, 'ads'), data);
                                   toast.success(`Campaign "${adFormState.title}" deployed successfully!`);
                                   setShowCreateAd(false);
                                 } catch (err: any) {
                                   toast.error("Failed to deploy ad: " + err.message);
                                 }
                              }}
                              className="lg:col-span-3 space-y-4 text-left"
                            >
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-1.5">
                                     <label className="text-[10px] font-bold uppercase text-slate-400">Campaign Title</label>
                                     <input 
                                       value={adFormState.title}
                                       onChange={(e) => setAdFormState(prev => ({ ...prev, title: e.target.value }))}
                                       required 
                                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
                                     />
                                  </div>
                                  <div className="space-y-1.5">
                                     <label className="text-[10px] font-bold uppercase text-slate-400">CTA Action Text</label>
                                     <input 
                                       value={adFormState.ctaText}
                                       onChange={(e) => setAdFormState(prev => ({ ...prev, ctaText: e.target.value }))}
                                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
                                     />
                                  </div>
                                  <div className="md:col-span-2 space-y-1.5">
                                     <label className="text-[10px] font-bold uppercase text-slate-400">Campaign Pitch Description</label>
                                     <textarea 
                                       value={adFormState.description}
                                       onChange={(e) => setAdFormState(prev => ({ ...prev, description: e.target.value }))}
                                       rows={2} 
                                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
                                     />
                                  </div>
                                  <div className="space-y-1.5">
                                     <label className="text-[10px] font-bold uppercase text-slate-400">Creative Image URL</label>
                                     <input 
                                       value={adFormState.imageUrl}
                                       onChange={(e) => setAdFormState(prev => ({ ...prev, imageUrl: e.target.value }))}
                                       placeholder="HTTPS image path" 
                                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
                                     />
                                  </div>
                                  <div className="space-y-1.5">
                                     <label className="text-[10px] font-bold uppercase text-slate-400">Target Webpage Endpoint URL</label>
                                     <input 
                                       value={adFormState.targetUrl}
                                       onChange={(e) => setAdFormState(prev => ({ ...prev, targetUrl: e.target.value }))}
                                       placeholder="https://..." 
                                       required 
                                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
                                     />
                                  </div>
                                  <div className="space-y-1.5">
                                     <label className="text-[10px] font-bold uppercase text-slate-400">Ad Format</label>
                                     <select 
                                       value={adFormState.adType}
                                       onChange={(e) => setAdFormState(prev => ({ ...prev, adType: e.target.value }))}
                                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                     >
                                        <option value="sponsored_post">Sponsored Feed Post</option>
                                        <option value="marketplace_boost">Marketplace Sponsored Card</option>
                                        <option value="banner">Static Banner Ad</option>
                                        <option value="video_preroll">Video Pre-roll ad</option>
                                     </select>
                                  </div>
                                  <div className="space-y-1.5">
                                     <label className="text-[10px] font-bold uppercase text-slate-400">Location Placement</label>
                                     <select 
                                       value={adFormState.placement}
                                       onChange={(e) => setAdFormState(prev => ({ ...prev, placement: e.target.value }))}
                                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                     >
                                        <option value="feed">Main Navigation Feed</option>
                                        <option value="marketplace">Marketplace Grid</option>
                                        <option value="sidebar">Sidebar & Widgets</option>
                                        <option value="video_preroll">Video Feed Pre-Rolls</option>
                                     </select>
                                  </div>
                                  <div className="space-y-1.5">
                                     <label className="text-[10px] font-bold uppercase text-slate-400">Regional Targeting Node (Malawi)</label>
                                     <select 
                                       value={adFormState.geographicTargeting}
                                       onChange={(e) => setAdFormState(prev => ({ ...prev, geographicTargeting: e.target.value }))}
                                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                     >
                                        <option value="National (Malawi)">National Coverage (All Malawi)</option>
                                        <option value="Lilongwe Node Alpha">Lilongwe Hub Node Alpha</option>
                                        <option value="Blantyre Node Beta">Blantyre Hub Node Beta</option>
                                        <option value="Mzuzu Node Gamma">Mzuzu Hub Node Gamma</option>
                                     </select>
                                  </div>
                                  <div className="space-y-1.5">
                                     <label className="text-[10px] font-bold uppercase text-slate-400">Node Speed Priority</label>
                                     <select 
                                       value={adFormState.nodePriority}
                                       onChange={(e) => setAdFormState(prev => ({ ...prev, nodePriority: e.target.value }))}
                                       className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                     >
                                        <option value="Standard">Standard Propagation (Standard CPM)</option>
                                        <option value="High">High Bandwidth Push (+20% CPM)</option>
                                        <option value="Premium">Priority Ingress Node (+50% CPM)</option>
                                     </select>
                                  </div>
                                  <div className="md:col-span-2 space-y-1 px-1">
                                     <div className="flex justify-between items-center">
                                       <label className="text-[10px] font-bold uppercase text-slate-400">Allocated Budget ($ USD)</label>
                                       <span className="text-xs font-mono font-bold text-primary">${adFormState.budget} USD</span>
                                     </div>
                                     <input 
                                       type="range"
                                       min={25}
                                       max={1000}
                                       step={25}
                                       value={adFormState.budget}
                                       onChange={(e) => setAdFormState(prev => ({ ...prev, budget: Number(e.target.value) }))}
                                       className="w-full accent-primary h-1.5 bg-slate-100 rounded-lg cursor-pointer"
                                     />
                                  </div>
                               </div>
                               
                               <div className="pt-4 flex gap-3">
                                  <Button type="button" onClick={() => setShowCreateAd(false)} variant="outline" className="flex-1 rounded-2xl h-12 font-bold text-slate-500 uppercase tracking-widest text-[10px] font-mono">Cancel</Button>
                                  <Button type="submit" className="flex-1 rounded-2xl h-12 font-bold uppercase tracking-widest text-[10px] font-mono bg-primary text-white shadow-lg shadow-primary/20">Launch Campaign</Button>
                               </div>
                            </form>

                            {/* Right Panel: Instant Rendering Simulated Device Mockup */}
                            <div className="lg:col-span-2 space-y-4">
                              <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800 shadow-xl font-sans text-left relative overflow-hidden flex flex-col h-[380px] justify-between">
                                <div className="flex justify-between items-center border-b border-white/5 pb-2 text-[9px] font-mono text-slate-500">
                                  <span>ZATHU SIMULATION SCREEN</span>
                                  <span className="text-emerald-500 flex items-center gap-1 font-bold">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                    RENDER_ACTIVE
                                  </span>
                                </div>

                                <div className="bg-slate-950/40 rounded-2xl p-4 flex-1 flex flex-col justify-center items-center my-2 border border-white/5 relative overflow-hidden">
                                  {adFormState.adType === 'sponsored_post' ? (
                                    <div className="w-full space-y-3 bg-white text-slate-900 rounded-2xl p-3.5 shadow-md text-left border border-slate-100 animate-in fade-in duration-300">
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 bg-indigo-50 text-indigo-600 font-bold flex items-center justify-center rounded-lg border border-indigo-100 uppercase text-[10px]">ZS</div>
                                        <div>
                                          <p className="font-bold text-[10px] uppercase flex items-center gap-1">Zathu Sponsor <span className="text-[7px] bg-slate-100 text-slate-500 px-1 py-0.2 rounded font-mono font-bold">AD</span></p>
                                          <p className="text-[8px] text-slate-400 font-mono">Location: {adFormState.geographicTargeting}</p>
                                        </div>
                                      </div>
                                      <p className="text-[10px] text-slate-600 leading-snug line-clamp-2 italic">"{adFormState.description || 'Provide a compelling description...'}"</p>
                                      {adFormState.imageUrl && (
                                        <div className="h-24 rounded-lg overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                                          <img src={adFormState.imageUrl} alt="preview" className="w-full h-full object-cover" />
                                        </div>
                                      )}
                                      <div className="flex justify-between items-center pt-2 border-t border-slate-100 mt-1">
                                        <span className="text-[8px] text-slate-400 font-mono font-bold uppercase">SPEED Priority: {adFormState.nodePriority}</span>
                                        <button type="button" className="bg-primary text-white font-black uppercase text-[8.5px] px-3 py-1 rounded-lg shadow-sm hover:bg-emerald-600 transition-colors font-mono">{adFormState.ctaText || 'Learn More'}</button>
                                      </div>
                                    </div>
                                  ) : adFormState.adType === 'marketplace_boost' ? (
                                    <div className="w-full bg-slate-50 text-slate-900 rounded-2xl overflow-hidden shadow-md border border-slate-200 text-left animate-in fade-in duration-300 bg-white">
                                      <div className="relative h-28 bg-slate-100">
                                        {adFormState.imageUrl && (
                                          <img src={adFormState.imageUrl} alt="preview" className="w-full h-full object-cover" />
                                        )}
                                        <span className="absolute top-2 right-2 bg-emerald-500 text-white text-[7.5px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm font-mono tracking-widest">BOOSTED DEAL</span>
                                      </div>
                                      <div className="p-3 space-y-1">
                                        <p className="text-[11px] font-bold uppercase truncate tracking-tight">{adFormState.title}</p>
                                        <p className="text-[9.5px] text-slate-400 line-clamp-1 italic">"{adFormState.description}"</p>
                                        <div className="flex justify-between items-center pt-2 mt-1 border-t border-slate-100">
                                          <p className="text-[9.5px] font-black text-rose-500">$99.99 <span className="text-[7.5px] text-slate-400 font-normal line-through">$120</span></p>
                                          <button type="button" className="text-[8.5px] font-extrabold uppercase text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg hover:bg-slate-50 transition-all font-mono">{adFormState.ctaText}</button>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="w-full bg-indigo-500/10 text-slate-200 rounded-2xl p-4 border border-indigo-500/20 space-y-2 text-left animate-in fade-in duration-300">
                                      <div className="flex gap-3">
                                        {adFormState.imageUrl && (
                                          <img src={adFormState.imageUrl} alt="preview" className="w-12 h-12 rounded-lg object-cover border border-white/10" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[11px] font-black text-white uppercase truncate">{adFormState.title}</p>
                                          <p className="text-[9.5px] text-slate-400 line-clamp-1 mt-0.5">"{adFormState.description}"</p>
                                        </div>
                                      </div>
                                      <div className="flex justify-between items-center bg-slate-950/50 p-2 rounded-xl border border-white/5">
                                        <span className="text-[8px] text-indigo-400 uppercase tracking-widest font-mono font-bold">{adFormState.placement.toUpperCase()} PLACEMENT</span>
                                        <button type="button" className="bg-white text-slate-900 rounded-lg px-2.5 py-1 text-[8px] font-black uppercase font-mono">{adFormState.ctaText}</button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="flex justify-between items-center pt-2 border-t border-white/5 text-[9px] font-mono text-slate-500 bg-slate-950/20 -mx-5 -mb-5 px-5 py-2.5">
                                  <span>Daily Reach: ~{((adFormState.budget || 50) * 1250).toLocaleString()} (Malawi)</span>
                                  <span>Est. Clicks: ~{Math.round((adFormState.budget || 50) * 78)} Clicks</span>
                                </div>
                              </div>
                              
                              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left font-sans text-xs space-y-2">
                                 <h4 className="font-bold text-slate-500 uppercase text-[9px] tracking-widest mb-1 font-mono">Platform Bid Recommendations</h4>
                                 <div className="grid grid-cols-2 gap-3 text-slate-500 text-[10px] font-mono">
                                    <div className="bg-white p-2 text-left rounded-lg border border-slate-200/60 shadow-sm leading-relaxed">
                                       <p className="text-slate-400 text-[8px]">Lilongwe Node Alpha</p>
                                       <p className="font-bold text-slate-800 text-[11px] mt-0.5">$0.42 CPM</p>
                                    </div>
                                    <div className="bg-white p-2 text-left rounded-lg border border-slate-200/60 shadow-sm leading-relaxed">
                                       <p className="text-slate-400 text-[8px]">Blantyre Node Beta</p>
                                       <p className="font-bold text-slate-800 text-[11px] mt-0.5">$0.48 CPM</p>
                                    </div>
                                 </div>
                              </div>
                            </div>
                          </div>
                       </div>
                    </motion.div>
                 </div>
              )}

              {/* Ad Detailed Insights Modal */}
              {selectedAd && (
                 <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <motion.div 
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-white max-w-2xl w-full rounded-3xl overflow-hidden shadow-2xl text-left"
                    >
                       <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                          <div>
                            <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest font-black">Campaign Metrics Audit</span>
                            <h3 className="font-serif italic font-bold text-slate-950 text-base uppercase leading-tight">{selectedAd.title}</h3>
                          </div>
                          <button onClick={() => setSelectedAd(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                             <X size={18} />
                          </button>
                       </div>
                       
                       <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                          {/* Live Status Indicators */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-left font-mono">
                             <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
                                <span className="text-[8.5px] text-slate-400 uppercase tracking-wider font-bold">Impressions</span>
                                <p className="text-base font-black text-slate-900 mt-1">{selectedAd.impressions || 0}</p>
                             </div>
                             <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
                                <span className="text-[8.5px] text-slate-400 uppercase tracking-wider font-bold">Clicks</span>
                                <p className="text-base font-black text-slate-900 mt-1">{selectedAd.clicks || 0}</p>
                             </div>
                             <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
                                <span className="text-[8.5px] text-slate-400 uppercase tracking-wider font-bold">Active CTR</span>
                                <p className="text-base font-black text-primary mt-1">
                                  {selectedAd.impressions ? ((selectedAd.clicks / selectedAd.impressions) * 100).toFixed(2) : '3.82'}%
                                </p>
                             </div>
                             <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/60">
                                <span className="text-[8.5px] text-slate-400 uppercase tracking-wider font-bold">Spent</span>
                                <p className="text-base font-black text-emerald-600 mt-1">${selectedAd.spent || 0} / ${selectedAd.budget}</p>
                             </div>
                          </div>

                          {/* Interactive Graph inside detailed modal */}
                          <div className="space-y-2">
                             <h4 className="text-[9px] font-mono font-black uppercase text-slate-400 tracking-widest text-left">24-Hour Performance Velocity</h4>
                             <div className="h-44 bg-slate-50 rounded-2xl border border-slate-200 p-3">
                                <ResponsiveContainer width="100%" height="100%">
                                   <AreaChart data={[
                                      { time: '00:00', clicks: Math.round((selectedAd.clicks || 5) * 0.1), imps: Math.round((selectedAd.impressions || 100) * 0.1) },
                                      { time: '06:00', clicks: Math.round((selectedAd.clicks || 5) * 0.3), imps: Math.round((selectedAd.impressions || 100) * 0.3) },
                                      { time: '12:00', clicks: Math.round((selectedAd.clicks || 5) * 0.8), imps: Math.round((selectedAd.impressions || 100) * 0.7) },
                                      { time: '18:00', clicks: Math.round((selectedAd.clicks || 5) * 1.0), imps: Math.round((selectedAd.impressions || 100) * 1.0) }
                                   ]}>
                                      <defs>
                                        <linearGradient id="colorAdClicks" x1="0" y1="0" x2="0" y2="1">
                                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                        </linearGradient>
                                      </defs>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                      <XAxis dataKey="time" stroke="#94a3b8" fontSize={9} />
                                      <YAxis stroke="#94a3b8" fontSize={9} />
                                      <Tooltip />
                                      <Area type="monotone" dataKey="imps" name="Impressions" stroke="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
                                      <Area type="monotone" dataKey="clicks" name="Clicks" stroke="#10b981" fillOpacity={1} fill="url(#colorAdClicks)" strokeWidth={2} />
                                   </AreaChart>
                                </ResponsiveContainer>
                             </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                            <div className="space-y-2 bg-slate-50 rounded-2xl p-4 border border-slate-200/60">
                               <span className="text-[8.5px] font-mono font-bold text-slate-400 uppercase tracking-wider">Campaign Target Link</span>
                               <p className="font-mono text-[10.5px] text-slate-800 break-all">{selectedAd.targetUrl}</p>
                               <div className="flex gap-2 mt-4">
                                  <a href={selectedAd.targetUrl} target="_blank" referrerPolicy="no-referrer" rel="noreferrer" className="flex-grow bg-white border border-slate-200 hover:bg-slate-50 rounded-xl px-3 py-2 text-[10px] uppercase font-mono font-bold text-center text-slate-600 transition-colors flex items-center justify-center gap-1.5 cursor-pointer">
                                     <ExternalLink size={12} /> Test Link Endpoint
                                  </a>
                               </div>
                            </div>

                            <div className="space-y-2 bg-slate-50 rounded-2xl p-4 border border-slate-200/60 flex flex-col justify-between">
                               <div>
                                  <span className="text-[8.5px] font-mono font-bold text-slate-400 uppercase tracking-wider">Demographic Distribution Area</span>
                                  <p className="text-[11px] font-bold text-slate-800 mt-1">Malawi (Zathu Node Network)</p>
                                  <p className="text-[10px] text-slate-400 italic mt-1 leading-relaxed">Estimated peak delivery Lilongwe Nodes Alpha & Blantyre Node Beta networks.</p>
                               </div>
                               <div className="flex gap-2 mt-3">
                                  <Button 
                                    onClick={async () => {
                                      const newBudget = (selectedAd.budget || 0) + 100;
                                      await updateDoc(doc(db, 'ads', selectedAd.id), { budget: newBudget });
                                      setSelectedAd(prev => ({ ...prev, budget: newBudget }));
                                      toast.success("Injected $100 Ad Campaign Booster Balance!");
                                    }}
                                    className="w-full bg-primary text-white text-[9.5px] font-mono uppercase tracking-wider rounded-xl py-2 cursor-pointer font-bold"
                                  >
                                     Inject $100 Boost
                                  </Button>
                               </div>
                            </div>
                          </div>
                       </div>

                       <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
                          <Button 
                            onClick={async () => {
                              await updateDoc(doc(db, 'ads', selectedAd.id), { status: selectedAd.status === 'active' ? 'paused' : 'active' });
                              setSelectedAd(prev => ({ ...prev, status: prev.status === 'active' ? 'paused' : 'active' }));
                              toast.info(`Campaign ${selectedAd.status === 'active' ? 'Paused' : 'Activated'}`);
                            }}
                            className={cn(
                              "text-[10px] uppercase tracking-widest font-bold px-4 h-9 rounded-xl cursor-pointer", 
                              selectedAd.status === 'active' ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white"
                            )}
                          >
                             {selectedAd.status === 'active' ? 'Pause Campaign' : 'Resume Campaign'}
                          </Button>
                          <Button 
                            onClick={() => setSelectedAd(null)}
                            variant="outline" 
                            className="text-[10px] uppercase tracking-widest font-bold px-4 h-9 rounded-xl cursor-pointer"
                          >
                             Close Dialog
                          </Button>
                       </div>
                    </motion.div>
                 </div>
              )}
            </motion.div>
          )}

          {activeTab === 'moderation' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200">
                <div>
                  <h2 className="text-xl font-serif italic text-slate-900">Content Moderation Terminal</h2>
                  <p className="text-xs text-slate-400 font-mono mt-1 uppercase tracking-widest flex items-center gap-2">
                    <ShieldAlert size={12} className="text-orange-500" />
                    Flagged Transmissions: {flaggedPosts.length + flaggedMarketItems.length + flaggedVideos.length}
                  </p>
                </div>
                <Button variant="outline" size="sm" className="bg-white border-slate-200 text-[10px] font-bold uppercase tracking-widest gap-2">
                  <ShieldCheck size={14} className="text-primary" />
                  AI Policy Sync
                </Button>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                   <table className="w-full text-left font-mono min-w-[900px]">
                     <thead>
                        <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">
                           <th className="px-6 py-4">Author / Identity</th>
                           <th className="px-6 py-4">Type</th>
                           <th className="px-6 py-4">Content Snippet</th>
                           <th className="px-6 py-4">Safety Metadata</th>
                           <th className="px-6 py-4 text-right">Review Action</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 italic font-serif">
                        {[
                          ...flaggedPosts.map(p => ({ ...p, _type: 'POST', _col: 'posts', _contentLabel: p.content })),
                          ...flaggedMarketItems.map(p => ({ ...p, _type: 'MARKET', _col: 'marketItems', _contentLabel: p.title || p.description })),
                          ...flaggedVideos.map(p => ({ ...p, _type: 'VIDEO', _col: 'videos', _contentLabel: p.title || p.description }))
                        ].length === 0 ? (
                           <tr>
                              <td colSpan={5} className="py-20 text-center">
                                 <div className="space-y-3">
                                    <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                                       <CheckCircle2 size={24} />
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] not-italic">All content is secure</p>
                                 </div>
                              </td>
                           </tr>
                        ) : (
                          [
                            ...flaggedPosts.map(p => ({ ...p, _type: 'POST', _col: 'posts', _contentLabel: p.content })),
                            ...flaggedMarketItems.map(p => ({ ...p, _type: 'MARKET', _col: 'marketItems', _contentLabel: p.title || p.description })),
                            ...flaggedVideos.map(p => ({ ...p, _type: 'VIDEO', _col: 'videos', _contentLabel: p.title || p.description }))
                          ].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map((p, idx) => (
                            <tr key={`${p._type}-${p.id || idx}-${idx}`} className="hover:bg-slate-50/50 transition-colors group not-italic">
                               <td className="px-6 py-4">
                                  <div className="flex items-center gap-3 font-sans">
                                      <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-primary font-black">
                                         {p.authorPhoto || p.sellerPhoto || p.userPhoto ? <img src={p.authorPhoto || p.sellerPhoto || p.userPhoto} alt="" className="w-full h-full object-cover" /> : (p.authorName || p.sellerName || p.userName)?.[0]}
                                      </div>
                                      <div>
                                         <p className="text-[11px] font-bold text-slate-900">{p.authorName || p.sellerName || p.userName}</p>
                                         <p className="text-[8px] font-mono text-slate-400 uppercase tracking-tighter">UID: {p.authorId?.slice(0, 8) || p.sellerId?.slice(0, 8) || p.userId?.slice(0, 8)}</p>
                                      </div>
                                  </div>
                               </td>
                                <td className="px-6 py-4 max-w-xs font-sans">
                                   <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed italic pr-4">"{p._contentLabel}"</p>
                                </td>
                               <td className="px-6 py-4">
                                  <div className="space-y-1.5 grayscale group-hover:grayscale-0 transition-all">
                                     <div className="flex items-center gap-1.5">
                                        <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden">
                                           <div className="h-full bg-red-500" style={{ width: `${(p.aiMetadata?.toxicityScore || p.toxicityScore || 0) * 100}%` }} />
                                        </div>
                                        <span className="text-[9px] font-black text-red-600">{(p.aiMetadata?.toxicityScore || p.toxicityScore || 0).toFixed(2)}</span>
                                     </div>
                                     <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Toxicity Probability</p>
                                  </div>
                               </td>
                               <td className="px-6 py-4">
                                   <span className={cn(
                                     "text-[9px] font-black px-2 py-0.5 rounded-full border",
                                     p._type === 'POST' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                     p._type === 'MARKET' ? "bg-amber-50 text-amber-600 border-amber-100" :
                                     "bg-purple-50 text-purple-600 border-purple-100"
                                   )}>
                                     {p._type}
                                   </span>
                                </td>
                               <td className="px-6 py-4 text-right">
                                  <div className="flex justify-end gap-2">
                                     <Button 
                                       onClick={async () => {
                                          await updateDoc(doc(db, p._col, p.id), {
                                             isFlagged: false,
                                             moderatedAt: serverTimestamp(),
                                             moderatedBy: profile?.uid
                                          });
                                          toast.success("Content Restored");
                                       }}
                                       variant="outline" 
                                       size="sm" 
                                       className="h-8 px-3 rounded-xl bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all text-[9px] font-black uppercase"
                                     >
                                        Restore
                                     </Button>
                                     <Button 
                                       onClick={async () => {
                                          if (confirm('PERMANENTLY PURGE THIS CONTENT?')) {
                                             await deleteDoc(doc(db, p._col, p.id));
                                             toast.error("Content Purged");
                                          }
                                       }}
                                       variant="outline" 
                                       size="sm" 
                                       className="h-8 w-8 p-0 rounded-xl text-red-500 hover:bg-red-600 hover:text-white border-red-100 transition-all"
                                     >
                                        <Trash2 size={14} />
                                     </Button>
                                  </div>
                               </td>
                            </tr>
                          ))
                        )}
                     </tbody>
                   </table>
                </div>
              </div>

              <div className="p-10 border-2 border-dashed border-slate-200 rounded-3xl text-center space-y-4">
                 <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                    <Shield size={32} />
                 </div>
                 <div className="max-w-md mx-auto space-y-2">
                    <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-900">Platform Integrity Statement</h3>
                    <p className="text-[10px] text-slate-400 font-mono leading-relaxed">
                       All transmissions are monitored by the Gemini Safety Pipeline. 
                       Admins are responsible for final resolution of edge-case anomalies. 
                       Deletion is irreversible and logged to the kernel audit stream.
                    </p>
                 </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'logs' && (
             <div className="bg-slate-900 rounded-3xl p-8 min-h-[600px] border border-slate-800 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(16,185,129,0.1),transparent_50%)]" />
                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                    <div>
                      <h2 className="text-emerald-500 font-mono text-lg font-bold text-left">// SYSTEM_KERNEL_LOG</h2>
                      <p className="text-slate-500 text-[10px] font-mono mt-1 text-left">VERBOSITY: DEBUG | NODE: MALAWIAN-LITE-01</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="h-8 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800">Clear</Button>
                      <Button className="h-8 bg-emerald-500 hover:bg-emerald-600 text-slate-900">Export</Button>
                    </div>
                  </div>
                  <div className="flex-1 font-mono text-xs text-slate-300 space-y-1 overflow-y-auto pr-4 scrollbar-hide text-left">
                    {logs.map((log, i) => (
                      <p key={`full-log-${i}`} className="hover:bg-white/5 rounded px-2 py-1 leading-relaxed">
                        <span className="text-slate-600 mr-4 inline-block w-24">[{new Date().toISOString()}]</span>
                        <span className="text-emerald-500 mr-2">[INFO]</span>
                        {log}
                      </p>
                    ))}
                    <p className="animate-pulse text-emerald-400">_</p>
                  </div>
                </div>
             </div>
          )}
        </div>
      </main>

      {/* Tab Bar for Mobile */}
      <footer className="lg:hidden fixed bottom-16 left-0 right-0 h-16 bg-white border-t border-slate-200 grid grid-cols-5 px-2 pb-2 z-40">
        {[
          { id: 'overview', icon: Activity, label: 'Stats' },
          { id: 'users', icon: Users, label: 'Users' },
          { id: 'financials', icon: Zap, label: 'Money' },
          { id: 'moderation', icon: ShieldAlert, label: 'Alerts' },
          { id: 'logs', icon: Terminal, label: 'Kernel' },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 transition-colors",
              activeTab === item.id ? "text-primary" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <item.icon size={18} />
            <span className="text-[8px] font-black uppercase tracking-widest">{item.label}</span>
          </button>
        ))}
      </footer>
    </div>
  );
}
