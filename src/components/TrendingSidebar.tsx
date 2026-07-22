import React, { useState, useEffect } from 'react';
import { TrendingUp, Search, ExternalLink, Globe, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

export default function TrendingSidebar() {
  const [trends, setTrends] = useState([
    { id: 1, tag: 'MalawiBudget2026', posts: '12.4k', growth: '+12%' },
    { id: 2, tag: 'LilongweMusicFest', posts: '8.2k', growth: '+5%' },
    { id: 3, tag: 'MaizePricing', posts: '5.1k', growth: '-2%' },
    { id: 4, tag: 'ZanthuLaunch', posts: '3.9k', growth: '+45%' },
    { id: 5, tag: 'LakeMalawi', posts: '2.8k', growth: '+1%' },
  ]);

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="p-5 border-b border-border bg-slate-50/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
           <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-text-main">Global Intel</h2>
        </div>
        <TrendingUp size={14} className="text-text-muted" />
      </div>

      {/* Real-time Ticker */}
      <div className="bg-slate-900 overflow-hidden py-2 border-b border-slate-800">
        <motion.div 
          animate={{ x: [0, -500] }}
          transition={{ repeat: Infinity, duration: 20, ease: 'linear' }}
          className="flex whitespace-nowrap gap-8 text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-widest"
        >
          <span>LIVE: Harvesting season starts in Southern Region</span>
          <span>•</span>
          <span>MWK/USD: 1,734.20 (+0.5%)</span>
          <span>•</span>
          <span>WEATHER: Blantyre 24°C Sunny</span>
          <span>•</span>
          <span>NEW POSTS: 12.4/min</span>
          <span>•</span>
        </motion.div>
      </div>

      {/* Trends List - Recipe 1 Inspired */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="mt-2 space-y-1">
          <div className="grid grid-cols-4 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-text-muted opacity-40 italic">
            <span className="col-span-2">Concept</span>
            <span className="text-right">Volume</span>
            <span className="text-right">Delta</span>
          </div>

          {trends.map((item) => (
            <motion.div 
              key={item.id}
              whileHover={{ backgroundColor: 'rgba(16, 185, 129, 0.05)' }}
              className="grid grid-cols-4 px-3 py-4 border-b border-border/40 group cursor-pointer transition-all items-center"
            >
              <div className="col-span-2 space-y-0.5">
                <p className="text-[11px] font-black text-text-main group-hover:text-primary transition-colors">#{item.tag}</p>
                <div className="flex items-center gap-1">
                  <span className="text-[8px] font-bold text-text-muted uppercase tracking-tighter">Verified Stream</span>
                  <div className="w-1 h-1 bg-slate-300 rounded-full" />
                </div>
              </div>
              <div className="text-right font-mono text-[10px] font-bold text-text-main">
                {item.posts}
              </div>
              <div className={`text-right font-mono text-[10px] font-bold ${item.growth.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>
                {item.growth}
              </div>
            </motion.div>
          ))}
        </div>

        {/* AI Insight Card */}
        <div className="m-3 mt-6 p-4 bg-slate-50 border border-border rounded-[24px] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-[80px] -mr-8 -mt-8" />
          <div className="relative z-10 space-y-3">
             <div className="flex items-center gap-2 text-primary font-black text-[9px] uppercase tracking-widest">
                <Sparkles size={12} />
                <span>AI Agent Intel</span>
             </div>
             <p className="text-[11px] font-medium leading-relaxed text-text-main">
                Content volume for <span className="text-primary font-bold">#MaizePricing</span> is spiking in Lilongwe. Local commerce suggests a 4% increase in trade velocity.
             </p>
             <button className="text-[9px] font-black uppercase tracking-widest text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                Dive Deeper <ExternalLink size={10} />
             </button>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-border bg-slate-50/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
          <input 
            placeholder="Search Global intel..." 
            className="w-full bg-white border border-border/60 h-9 rounded-xl pl-9 text-[11px] font-medium placeholder:opacity-50 focus:ring-1 focus:ring-primary/20 outline-none"
          />
        </div>
      </div>
    </div>
  );
}
