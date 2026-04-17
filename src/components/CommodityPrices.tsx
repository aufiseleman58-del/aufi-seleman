import React, { useEffect, useState } from 'react';
import { useSettings } from '../SettingsContext';
import { TrendingUp, TrendingDown, MapPin, Clock, ShieldCheck, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchOfficialCommodityPrices, CommodityPrice } from '../services/commodityPriceService';

export default function CommodityPrices() {
  const { t } = useSettings();
  const [prices, setPrices] = useState<CommodityPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const loadPrices = async () => {
    setLoading(true);
    try {
      const data = await fetchOfficialCommodityPrices();
      setPrices(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrices();
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <TrendingUp size={16} className="text-primary" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider">{t('market.commodityPrices')}</h3>
            <p className="text-[8px] font-black text-primary uppercase tracking-widest flex items-center gap-1">
              <ShieldCheck size={8} />
              Ministry of Agriculture verified
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono">
            <Clock size={10} />
            {lastUpdated || 'Updating...'}
          </div>
          <button 
            onClick={loadPrices}
            disabled={loading}
            className="p-1.5 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      
      <div className="divide-y divide-slate-100 min-h-[100px] relative">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              key="loading"
              className="py-12 flex flex-col items-center justify-center gap-3"
            >
              <Loader2 className="animate-spin text-primary" size={24} />
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Checking AMIS Malawi...</p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              key="content"
              className="divide-y divide-slate-100"
            >
              {prices.map((item, i) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={item.id} 
                  className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-800">{item.name}</p>
                    <div className="flex items-center gap-2 text-[9px] text-slate-400 uppercase font-bold tracking-tighter">
                      <MapPin size={10} />
                      {item.district}
                      <span className="mx-1 opacity-20">•</span>
                      <span className="text-slate-300">{item.source}</span>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <p className="text-xs font-mono font-black text-slate-900">MWK {item.price}</p>
                      {item.trend === 'up' ? (
                        <TrendingUp size={12} className="text-red-500" />
                      ) : item.trend === 'down' ? (
                        <TrendingDown size={12} className="text-emerald-500" />
                      ) : (
                        <div className="w-3 h-0.5 bg-slate-300 rounded-full" />
                      )}
                    </div>
                    <p className="text-[9px] text-slate-400 italic lowercase tracking-tight">{item.unit}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
