import React, { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, limit, getDocs } from 'firebase/firestore';
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
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  Shield
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';
import { motion } from 'motion/react';
import UserComponent from '../components/User';
import { cn } from '@/lib/utils';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'moderation' | 'logs'>('overview');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalPosts: 0,
    flaggedContent: 3,
    activeNow: 1422,
    latency: '420ms',
    uptime: '99.99%'
  });
  const [recentUsers, setRecentUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const isAdminEmail = profile?.email === 'aufiseleman58@gmail.com';
    if (profile && profile.role !== 'admin' && !isAdminEmail) {
      navigate('/');
      return;
    }

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
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setRecentUsers(users);
      
      // Generate some mock logs when new data comes in
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

    // Initial logs
    setLogs([
      "System authenticated via Firebase IAM...",
      "Cloud Run instance active: europe-west1",
      "Monitoring Malawian local nodes: OPTIMAL",
      "AI Moderation pipeline initialized (Gemini 1.5 Flash)",
      "Listening for real-time events..."
    ]);

    return () => unsubscribe();
  }, [profile, navigate]);

  if (!profile || (profile.role !== 'admin' && profile.email !== 'aufiseleman58@gmail.com')) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 pb-20 lg:pb-0">
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
            { id: 'moderation', icon: ShieldAlert, label: 'Moderation' },
            { id: 'logs', icon: Terminal, label: 'System Logs' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left",
                activeTab === item.id 
                  ? "bg-emerald-50 text-primary border border-emerald-100" 
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <item.icon size={18} />
              {item.label}
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
                ].map((item, i) => (
                  <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm transition-transform hover:-translate-y-1">
                    <div className="flex justify-between items-start mb-4">
                      <div className={cn("p-2 rounded-xl", item.color === 'blue' ? "bg-blue-50 text-blue-600" : item.color === 'emerald' ? "bg-emerald-50 text-emerald-600" : item.color === 'red' ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600")}>
                        <item.icon size={20} />
                      </div>
                      <p className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", item.color === 'blue' ? "bg-blue-50 text-blue-600" : item.color === 'emerald' ? "bg-emerald-50 text-emerald-600" : item.color === 'red' ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600")}>
                        {item.sub}
                      </p>
                    </div>
                    <p className="text-xs font-serif italic text-slate-400 mb-1">{item.label}</p>
                    <p className="text-3xl font-mono font-black tracking-tighter text-slate-900">{item.value.toLocaleString()}</p>
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
                <div className="bg-slate-900 rounded-3xl p-6 text-white flex flex-col justify-between relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                    <Cpu size={120} />
                  </div>
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-8">
                      <div>
                        <span className="text-[10px] font-mono bg-primary/20 text-primary px-2 py-0.5 rounded-full mb-2 inline-block">AI PIPELINE</span>
                        <h3 className="text-xl font-bold font-serif italic text-white/90">Gemini Moderation</h3>
                      </div>
                      <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <Activity size={20} className="text-primary" />
                      </div>
                    </div>

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
                        <div className="flex justify-between text-[11px] font-mono opacity-60">
                          <span>UPTIME</span>
                          <span className="text-primary">100%</span>
                        </div>
                      </div>

                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-3">
                        <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className="uppercase tracking-widest text-white/50">Model Load</span>
                          <span className="text-primary">64%</span>
                        </div>
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary w-[64%]" />
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <Button className="w-full mt-6 bg-white text-slate-900 hover:bg-slate-100 rounded-xl h-10 text-[11px] font-bold uppercase tracking-wider">
                    Tune Parameters
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
                      <div key={i} className="flex gap-3 text-left">
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
                    <div className="flex-1 bg-white/5 rounded-lg border border-white/10 h-8 flex items-center px-3 text-[10px] font-mono text-white/40 text-left">
                      Enter command or filter...
                    </div>
                    <Button variant="secondary" size="sm" className="h-8 text-[9px] bg-primary text-white hover:bg-emerald-600">
                      Execute
                    </Button>
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
                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Search identity logs..." 
                      className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs w-full md:w-64 focus:ring-2 focus:ring-primary/20 outline-none transition-all text-left"
                    />
                  </div>
                  <Button className="h-9 px-4 text-xs font-bold rounded-xl gap-2">
                    <Users size={14} />
                    Export CSV
                  </Button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
                <table className="w-full text-left font-mono min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <th className="px-6 py-4">UID / Identity</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Security Level</th>
                      <th className="px-6 py-4">TX Count</th>
                      <th className="px-6 py-4 text-right">Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentUsers.map(u => (
                      <tr key={u.id} className="text-[11px] group hover:bg-slate-50/50 transition-colors">
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
                              <p className="text-slate-400">{u.displayName || 'Unnamed User'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[9px] font-bold",
                            u.isOnline ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                          )}>
                            {u.isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Shield className={cn("size-3", u.role === 'admin' ? "text-primary" : "text-slate-300")} />
                            <span className="uppercase">{u.role || 'user'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {Math.floor(Math.random() * 400)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Settings size={14} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'moderation' && (
            <div className="flex items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                  <ShieldAlert size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-serif italic text-left">Moderation Terminal</h3>
                  <p className="text-sm text-slate-400 text-left">All flagged transmissions have been processed by AI.</p>
                </div>
                <Button variant="outline" className="rounded-xl font-bold">Refresh Stream</Button>
              </div>
            </div>
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
                      <p key={i} className="hover:bg-white/5 rounded px-2 py-1 leading-relaxed">
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
      <footer className="lg:hidden fixed bottom-16 left-0 right-0 h-16 bg-white border-t border-slate-200 grid grid-cols-4 px-2 pb-2 z-40">
        {[
          { id: 'overview', icon: Activity, label: 'Stats' },
          { id: 'users', icon: Users, label: 'Users' },
          { id: 'moderation', icon: ShieldAlert, label: 'Alerts' },
          { id: 'logs', icon: Terminal, label: 'Logs' },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 transition-colors",
              activeTab === item.id ? "text-primary" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <item.icon size={20} />
            <span className="text-[9px] font-bold uppercase tracking-wider">{item.label}</span>
          </button>
        ))}
      </footer>
    </div>
  );
}
