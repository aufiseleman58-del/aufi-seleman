import React from 'react';
import { motion } from 'motion/react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  CreditCard, 
  History, 
  TrendingUp, 
  ChevronRight,
  Wallet as WalletIcon,
  ArrowRight,
  Bell,
  Search,
  Settings
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

const data = [
  { name: 'Mon', income: 4000, expense: 2400 },
  { name: 'Tue', income: 3000, expense: 1398 },
  { name: 'Wed', income: 2000, expense: 9800 },
  { name: 'Thu', income: 2780, expense: 3908 },
  { name: 'Fri', income: 1890, expense: 4800 },
  { name: 'Sat', income: 2390, expense: 3800 },
  { name: 'Sun', income: 3490, expense: 4300 },
];

const transactions = [
  { id: 1, type: 'receive', title: 'Market Sell: Maize', amount: 45000, date: 'Today, 2:45 PM', category: 'Market' },
  { id: 2, type: 'send', title: 'Airtel Airtime', amount: -5000, date: 'Today, 10:15 AM', category: 'Bills' },
  { id: 3, type: 'send', title: 'Luso Video Tip', amount: -2000, date: 'Yesterday, 8:20 PM', category: 'Social' },
  { id: 4, type: 'receive', title: 'Wallet Topup', amount: 10000, date: 'Yesterday, 9:00 AM', category: 'Transfer' },
  { id: 5, type: 'send', title: 'Electricity Bill', amount: -15000, date: 'Mar 14, 4:30 PM', category: 'Utilities' },
];

export default function Wallet() {
  const { userData } = useAuth();
  const { t } = useSettings();

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Professional Navbar */}
      <div className="bg-white border-b border-border sticky top-0 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/profile" className="w-8 h-8 rounded-full overflow-hidden border border-border">
              <img src={userData?.photoURL || undefined} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </Link>
            <h1 className="text-sm font-black uppercase tracking-tighter">Zathu Wallet</h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-slate-100 rounded-full transition-colors relative">
              <Bell size={18} className="text-text-main" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <button className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <Settings size={18} className="text-text-main" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Main Balance Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 text-white"
        >
          {/* Abstract background shapes */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-3xl -mr-16 -mt-16" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -ml-12 -mb-12" />
          
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">{t('wallet.balanceAvailable')}</p>
          <div className="flex items-baseline gap-1 mb-6">
            <span className="text-2xl font-black text-primary">MWK</span>
            <h2 className="text-4xl font-black tracking-tight tracking-tighter tabular-nums">124,500</h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <ArrowDownLeft size={10} className="text-emerald-500" />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{t('wallet.income')}</span>
              </div>
              <p className="text-sm font-black tabular-nums">+55,000</p>
            </div>
            <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
                  <ArrowUpRight size={10} className="text-red-500" />
                </div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{t('wallet.expense')}</span>
              </div>
              <p className="text-sm font-black tabular-nums">-12,400</p>
            </div>
          </div>
        </motion.div>

        {/* Action Grid */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: <ArrowUpRight className="text-indigo-500" />, label: t('wallet.send'), color: 'bg-indigo-50' },
            { icon: <Plus className="text-emerald-500" />, label: t('wallet.topup'), color: 'bg-emerald-50' },
            { icon: <CreditCard className="text-orange-500" />, label: t('wallet.bills'), color: 'bg-orange-50' },
            { icon: <ArrowDownLeft className="text-purple-500" />, label: t('wallet.cashout'), color: 'bg-purple-50' }
          ].map((action, i) => (
            <motion.button 
              whileTap={{ scale: 0.95 }}
              key={i} 
              className="flex flex-col items-center gap-2"
            >
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border border-transparent hover:border-border transition-all", action.color)}>
                {action.icon}
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tighter text-text-muted">{action.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Analytics Section */}
        <div className="bg-white rounded-3xl border border-border p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-[12px] font-black uppercase tracking-tighter flex items-center gap-2">
                <TrendingUp size={14} className="text-primary" />
                {t('wallet.spendingTrends')}
              </h3>
              <p className="text-[10px] text-text-muted font-bold tracking-tight">{t('wallet.last30days')}</p>
            </div>
            <button className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1 hover:gap-2 transition-all">
              Details <ArrowRight size={12} />
            </button>
          </div>
          
          <div className="h-48 w-full -ml-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: '1px solid #e2e8f0',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="income" 
                  stroke="#8b5cf6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorIncome)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[12px] font-black uppercase tracking-tighter flex items-center gap-2">
              <History size={14} className="text-text-muted" />
              {t('wallet.recentTransactions')}
            </h3>
            <button className="text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-text-main flex items-center gap-1">
              View All <ChevronRight size={12} />
            </button>
          </div>

          <div className="space-y-2">
            {transactions.map((tx) => (
              <motion.div 
                whileHover={{ x: 5 }}
                key={tx.id} 
                className="bg-white p-4 rounded-2xl border border-border flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    tx.type === 'receive' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-600"
                  )}>
                    {tx.type === 'receive' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black tracking-tight">{tx.title}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">{tx.category}</span>
                      <span className="text-[9px] text-text-muted">•</span>
                      <span className="text-[9px] font-bold text-text-muted">{tx.date}</span>
                    </div>
                  </div>
                </div>
                <p className={cn(
                  "text-sm font-black tabular-nums",
                  tx.type === 'receive' ? "text-emerald-600" : "text-text-main"
                )}>
                  {tx.type === 'receive' ? '+' : ''}{tx.amount.toLocaleString()}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Connected Methods */}
        <div className="bg-slate-900 rounded-3xl p-6 text-white space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              {t('wallet.paymentMethods')}
            </h3>
            <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all">
              <Plus size={16} />
            </button>
          </div>
          
          <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 min-w-[200px] shrink-0 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-[8px] font-black">airtel</div>
                <span className="text-xs font-bold tracking-tight">Airtel Money</span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 leading-none">**** **** 8271</p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 min-w-[200px] shrink-0 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-[8px] font-black text-black">tnm</div>
                <span className="text-xs font-bold tracking-tight">TNM Mpamba</span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 leading-none">**** **** 4492</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
