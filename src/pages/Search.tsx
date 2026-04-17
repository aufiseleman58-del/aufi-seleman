import React, { useState } from 'react';
import { Search as SearchIcon, Users, FileText, ShoppingBag, ArrowRight, TrendingUp, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export default function Search() {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const trends = [
    '#LakeMalawi',
    '#ZathuMarket',
    '#MalawiMusic',
    '#LilongweNews',
    '#AgricultureMW'
  ];

  const recentSearches = [
    'Solar panels',
    'Kondwani Phiri',
    'Chambo fish recipes'
  ];

  return (
    <div className="p-4 space-y-6 pb-20">
      {/* Search Bar */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
        <Input 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Zathu..." 
          className="pl-10 bg-surface border-border h-12 rounded-2xl shadow-sm text-base focus-visible:ring-primary"
          autoFocus
        />
      </div>

      {!query ? (
        <>
          {/* Trends */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-text-muted">
              <TrendingUp size={16} />
              <h3 className="text-xs font-bold uppercase tracking-wider">Trending in Malawi</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {trends.map((trend) => (
                <button key={trend} className="px-4 py-2 bg-surface border border-border rounded-xl text-sm font-medium hover:border-primary hover:text-primary transition-colors">
                  {trend}
                </button>
              ))}
            </div>
          </div>

          {/* Recent */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-text-muted">
              <Clock size={16} />
              <h3 className="text-xs font-bold uppercase tracking-wider">Recent Searches</h3>
            </div>
            <div className="bg-surface rounded-2xl border border-border overflow-hidden divide-y divide-border">
              {recentSearches.map((search) => (
                <button key={search} className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-sm">
                  <span>{search}</span>
                  <ArrowRight size={14} className="text-text-muted" />
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-border">
            {['all', 'people', 'posts', 'market', 'videos'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${
                  activeTab === tab ? 'bg-primary text-white' : 'text-text-muted hover:bg-slate-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Results Placeholder */}
          <div className="space-y-4">
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                <Users size={24} />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm">Kondwani Phiri</h4>
                <p className="text-[11px] text-text-muted">@kondwani • 1.2k followers</p>
              </div>
              <Button size="sm" className="bg-primary text-white rounded-full h-8 text-[11px]">Follow</Button>
            </div>

            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                  <ShoppingBag size={18} />
                </div>
                <h4 className="font-bold text-sm">Solar Panel 100W</h4>
              </div>
              <p className="text-[11px] text-text-muted line-clamp-2">High quality solar panels available in Lilongwe. Perfect for home use...</p>
              <div className="flex justify-between items-center">
                <span className="text-primary font-bold text-xs">MWK 45,000</span>
                <Link to="/marketplace">
                  <Button variant="link" className="text-primary text-[11px] p-0 h-auto">View in Market</Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
