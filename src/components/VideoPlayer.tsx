import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { useSettings } from '../SettingsContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, limit, getDocs, updateDoc, doc, increment } from 'firebase/firestore';
import { toast } from 'sonner';

interface VideoPlayerProps {
  src: string;
  isActive: boolean;
  onLike?: () => void;
  videoId?: string;
}

export default function VideoPlayer({ src, isActive, onLike, videoId }: VideoPlayerProps) {
  const { dataSaver } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showHeart, setShowHeart] = useState(false);
  const [heartPos, setHeartPos] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState(0);

  // Ad State
  const [ad, setAd] = useState<any>(null);
  const [showAd, setShowAd] = useState(false);
  const [adTimeLeft, setAdTimeLeft] = useState(0);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    if (isActive && !ad && !showAd) {
      const fetchAd = async () => {
        try {
          const adsRef = collection(db, 'ads');
          const q = query(
            adsRef, 
            where('placement', '==', 'video_preroll'), 
            where('status', '==', 'active'),
            limit(1)
          );
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const adData = { ...snapshot.docs[0].data(), id: snapshot.docs[0].id };
            setAd(adData);
            setShowAd(true);
            setAdTimeLeft(15); // Assume 15s ad
            
            // Track Impression
            await updateDoc(doc(db, 'ads', adData.id), {
              impressions: increment(1)
            });
          }
        } catch (error) {
          console.error("Ad fetch error:", error);
        }
      };
      fetchAd();
    }
  }, [isActive]);

  useEffect(() => {
    let timer: any;
    if (showAd && adTimeLeft > 0) {
      timer = setInterval(() => {
        setAdTimeLeft(prev => {
          if (prev <= 10) setCanSkip(true);
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [showAd, adTimeLeft]);

  const handleSkipAd = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAd(false);
  };

  const handleAdClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ad?.targetUrl) {
      window.open(ad.targetUrl, '_blank');
      await updateDoc(doc(db, 'ads', ad.id), {
        clicks: increment(1)
      });
    }
  };

  useEffect(() => {
    if (videoRef.current && !showAd) {
      if (isActive) {
        if (dataSaver) {
          setIsPlaying(false);
          videoRef.current.pause();
        } else {
          setIsPlaying(true);
          videoRef.current.play().catch(() => {
            setIsPlaying(false);
          });
        }
      } else {
        setIsPlaying(false);
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isActive, dataSaver]);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch(e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          if (videoRef.current) {
            if (videoRef.current.paused) videoRef.current.play();
            else videoRef.current.pause();
            setIsPlaying(!videoRef.current.paused);
          }
          break;
        case 'm':
          e.preventDefault();
          setIsMuted(prev => !prev);
          break;
        case 'arrowleft':
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5);
          }
          break;
        case 'arrowright':
          e.preventDefault();
          if (videoRef.current) {
            videoRef.current.currentTime = Math.min(videoRef.current.duration, videoRef.current.currentTime + 5);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const p = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(p);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (videoRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clickedPos = (x / rect.width);
      videoRef.current.currentTime = clickedPos * videoRef.current.duration;
    }
  };

  const handleVideoTouch = (e: React.MouseEvent | React.TouchEvent) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (now - lastTap < DOUBLE_TAP_DELAY) {
      // Double tap detected
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      
      setHeartPos({ x: clientX, y: clientY });
      setShowHeart(true);
      onLike?.();
      setTimeout(() => setShowHeart(false), 800);
    } else {
      // Single tap
      togglePlay();
    }
    setLastTap(now);
  };

  return (
    <div 
      className="relative h-full w-full flex items-center justify-center bg-black cursor-pointer group"
      onClick={handleVideoTouch}
    >
      <video
        ref={videoRef}
        src={src || undefined}
        className="h-full w-full object-contain"
        loop
        muted={isMuted}
        playsInline
        onTimeUpdate={handleTimeUpdate}
      />

      {/* Ad Overlay */}
      <AnimatePresence>
        {showAd && ad && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {ad.videoUrl ? (
              <video 
                src={ad.videoUrl} 
                autoPlay 
                className="w-full h-full object-contain"
                onEnded={() => setShowAd(false)}
              />
            ) : (
              <img src={ad.imageUrl} className="w-full h-full object-cover opacity-50 blur-sm absolute inset-0" alt="" />
            )}
            
            <div className="relative z-10 p-8 text-center space-y-6 flex flex-col items-center max-w-sm">
              <span className="bg-primary/20 text-primary border border-primary/20 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] backdrop-blur-md">
                Sponsored Video
              </span>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-white leading-tight">{ad.title}</h2>
                <p className="text-white/60 text-sm font-medium leading-relaxed">{ad.description}</p>
              </div>

              <Button 
                onClick={handleAdClick}
                className="bg-primary hover:bg-emerald-600 text-white rounded-2xl h-14 w-full font-black text-sm shadow-xl shadow-primary/20"
              >
                {ad.ctaText || 'Learn More'}
              </Button>

              <div className="flex justify-between items-center w-full pt-4">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                  Ad ends in {adTimeLeft}s
                </div>
                {canSkip && (
                  <button 
                    onClick={handleSkipAd}
                    className="flex items-center gap-2 text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl border border-white/10 transition-all font-bold text-[11px] uppercase tracking-widest"
                  >
                    Skip Ad
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Play/Pause Overlay Icon */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute z-20 pointer-events-none"
          >
            <div className="p-6 bg-black/40 backdrop-blur-sm rounded-full">
              <Play className="text-white fill-current" size={64} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Double Tap Heart Animation */}
      <AnimatePresence>
        {showHeart && (
          <motion.div
            initial={{ opacity: 1, scale: 0, y: 0 }}
            animate={{ opacity: 0, scale: 2.5, y: -100 }}
            exit={{ opacity: 0 }}
            style={{ 
              position: 'fixed', 
              left: heartPos.x - 50, 
              top: heartPos.y - 50, 
              zIndex: 100,
              pointerEvents: 'none'
            }}
          >
            <Heart className="text-accent fill-accent" size={100} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mute Toggle */}
      <button 
        onClick={toggleMute}
        className="absolute bottom-24 right-4 z-30 p-2 bg-black/30 backdrop-blur-md rounded-full border border-white/10 text-white"
      >
        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* Progress Bar */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-40 transition-all hover:h-2"
        onClick={handleProgressClick}
      >
        <div 
          className="h-full bg-primary relative" 
          style={{ width: `${progress}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 shadow-lg" />
        </div>
      </div>
    </div>
  );
}
