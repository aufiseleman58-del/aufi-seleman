import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { useSettings } from '../SettingsContext';

interface VideoPlayerProps {
  src: string;
  isActive: boolean;
  onLike?: () => void;
}

export default function VideoPlayer({ src, isActive, onLike }: VideoPlayerProps) {
  const { dataSaver } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showHeart, setShowHeart] = useState(false);
  const [heartPos, setHeartPos] = useState({ x: 0, y: 0 });
  const [lastTap, setLastTap] = useState(0);

  useEffect(() => {
    if (videoRef.current) {
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
