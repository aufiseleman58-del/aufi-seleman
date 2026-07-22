import React, { useEffect, useState, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, increment } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { ExternalLink, Info, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Ad {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  targetUrl: string;
  adType: 'sponsored_post' | 'banner' | 'marketplace_boost' | 'video_preroll';
  ctaText?: string;
  videoUrl?: string;
  placement: string;
}

interface AdPlacementProps {
  placement: 'feed' | 'sidebar' | 'marketplace' | 'banner' | 'video_preroll';
  className?: string;
  key?: string | number;
}

export default function AdPlacement({ placement, className }: AdPlacementProps) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAds = async () => {
      try {
        const q = query(
          collection(db, 'ads'),
          where('placement', '==', placement),
          where('status', '==', 'active')
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const adsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ad));
          // Shuffle ads to give variety
          setAds(adsData.sort(() => Math.random() - 0.5));
          
          // Count initial impression for the first visible one
          const firstAd = adsData[0];
          await updateDoc(doc(db, 'ads', firstAd.id), {
            impressions: increment(1)
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, `ads?placement=${placement}`);
      } finally {
        setLoading(false);
      }
    };

    fetchAds();
  }, [placement]);

  const handleNext = async () => {
    if (ads.length <= 1) return;
    const nextIndex = (currentIndex + 1) % ads.length;
    setCurrentIndex(nextIndex);
    
    // Log impression for the new ad shown
    try {
      await updateDoc(doc(db, 'ads', ads[nextIndex].id), {
        impressions: increment(1)
      });
    } catch (e) {
      console.error("Ad impression log failed", e);
    }
  };

  const handlePrev = () => {
    if (ads.length <= 1) return;
    setCurrentIndex(prev => (prev - 1 + ads.length) % ads.length);
  };

  const handleAdClick = async (ad: Ad) => {
    try {
      await updateDoc(doc(db, 'ads', ad.id), {
        clicks: increment(1)
      });
      window.open(ad.targetUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error("Error recording click:", error);
    }
  };

  if (loading || ads.length === 0) return null;

  const currentAd = ads[currentIndex];

  if (placement === 'banner') {
     return (
        <div className="relative group">
           <AnimatePresence mode="wait">
            <motion.div 
              key={currentAd.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => handleAdClick(currentAd)}
              className={cn(
                "bg-slate-100 rounded-xl overflow-hidden cursor-pointer group relative border border-border",
                className
              )}
            >
              <img src={currentAd.imageUrl} alt={currentAd.title} className="w-full h-28 object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-black/30 flex flex-col justify-end p-3">
                 <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest bg-black/40 w-fit px-2 py-0.5 rounded backdrop-blur-sm mb-1">Sponsored</span>
                 <h4 className="text-white font-bold text-xs truncate">{currentAd.title}</h4>
              </div>
            </motion.div>
          </AnimatePresence>
          
          {ads.length > 1 && (
            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                className="w-6 h-6 rounded-full bg-white/80 flex items-center justify-center text-primary shadow-sm hover:bg-white"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                className="w-6 h-6 rounded-full bg-white/80 flex items-center justify-center text-primary shadow-sm hover:bg-white"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
     );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {ads.length > 1 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">Promoted Content</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-bold text-text-muted mr-1">{currentIndex + 1}/{ads.length}</span>
            <button onClick={handlePrev} className="p-1 rounded-lg hover:bg-slate-100 text-text-muted"><ChevronLeft size={12} /></button>
            <button onClick={handleNext} className="p-1 rounded-lg hover:bg-slate-100 text-text-muted"><ChevronRight size={12} /></button>
          </div>
        </div>
      )}

      <motion.div 
        key={currentAd.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-md transition-all h-full"
      >
        <div className="p-4 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
               <Info size={12} className="text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-text-main">
                {currentAd.adType === 'sponsored_post' ? 'Sponsored Post' : 
                 currentAd.adType === 'marketplace_boost' ? 'Featured Listing' : 'Partner Recommendation'}
              </p>
              <p className="text-[9px] text-text-muted font-bold">Based on your interests</p>
            </div>
          </div>
          <button className="text-text-muted hover:text-text-main p-1">
            <MoreHorizontal size={14} />
          </button>
        </div>

        <div onClick={() => handleAdClick(currentAd)} className="cursor-pointer group">
          <div className="aspect-[16/9] overflow-hidden relative bg-slate-100">
            <img 
              src={currentAd.imageUrl} 
              alt={currentAd.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
              referrerPolicy="no-referrer"
            />
            <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg shadow-sm">
               <ExternalLink size={12} className="text-primary" />
            </div>
          </div>
          
          <div className="p-4 space-y-2">
            <h3 className="font-bold text-sm text-text-main group-hover:text-primary transition-colors truncate">{currentAd.title}</h3>
            <p className="text-xs text-text-muted leading-relaxed line-clamp-2 min-h-[32px]">
              {currentAd.description}
            </p>
            
            <div className="pt-2">
              <button className="w-full bg-slate-50 hover:bg-emerald-50 text-primary border border-border hover:border-primary/30 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                {currentAd.ctaText || 'Learn More'}
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
