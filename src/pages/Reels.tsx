import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, increment, setDoc, deleteDoc, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { Heart, MessageSquare, Share2, Music2, UserPlus, ShieldCheck, Loader2, Play, Pause, Volume2, VolumeX, Plus, HelpCircle, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import CreatePostModal from '../components/CreatePostModal';
import VideoCommentsModal from '../components/VideoCommentsModal';

interface Reel {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  caption: string;
  videoUrl: string;
  musicName?: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  createdAt: any;
}

export default function Reels() {
  const { user, profile, signIn } = useAuth();
  const { t } = useSettings();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [likedReels, setLikedReels] = useState<Record<string, boolean>>({});
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeCommentsReelId, setActiveCommentsReelId] = useState<string | null>(null);
  
  // Shared volume mute state across reels
  const [globalMuted, setGlobalMuted] = useState<boolean>(() => {
    const saved = localStorage.getItem('reels_muted');
    return saved === 'true';
  });

  const containerRef = useRef<HTMLDivElement>(null);

  const toggleGlobalMute = () => {
    const newMuted = !globalMuted;
    setGlobalMuted(newMuted);
    localStorage.setItem('reels_muted', String(newMuted));
    toast.success(newMuted ? 'Sound muted' : 'Sound active', { duration: 1000 });
  };

  // Load Reels
  useEffect(() => {
    const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Reel[];
      setReels(data);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'videos');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load Likes
  useEffect(() => {
    if (!user) {
      setLikedReels({});
      return;
    }
    const q = query(collection(db, 'videoLikes'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liked: Record<string, boolean> = {};
      snapshot.docs.forEach(doc => {
        liked[doc.data().videoId] = true;
      });
      setLikedReels(liked);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'videoLikes');
    });
    return () => unsubscribe();
  }, [user]);

  // Load User's Following list
  useEffect(() => {
    if (!user) {
      setFollowingIds([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, 'users', user.uid, 'following'), (snapshot) => {
      const ids = snapshot.docs.map(doc => doc.id);
      setFollowingIds(ids);
    }, (err) => {
      console.error('Error fetching following list:', err);
    });
    return () => unsubscribe();
  }, [user]);

  const lastWheelTime = useRef<number>(0);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateReel(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateReel(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, reels.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollPos = e.currentTarget.scrollTop;
    const height = e.currentTarget.clientHeight;
    if (height === 0) return;
    const index = Math.round(scrollPos / height);
    if (index !== activeIndex && index >= 0 && index < reels.length) {
      setActiveIndex(index);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheelTime.current < 650) return;

    if (Math.abs(e.deltaY) > 20) {
      if (e.deltaY > 0) {
        navigateReel(1);
        lastWheelTime.current = now;
      } else {
        navigateReel(-1);
        lastWheelTime.current = now;
      }
    }
  };

  const navigateReel = (direction: number) => {
    const nextIndex = activeIndex + direction;
    if (nextIndex >= 0 && nextIndex < reels.length) {
      scrollToReel(nextIndex);
    }
  };

  const scrollToReel = (index: number) => {
    if (containerRef.current) {
      const height = containerRef.current.clientHeight;
      containerRef.current.scrollTo({
        top: index * height,
        behavior: 'smooth'
      });
      setActiveIndex(index);
    }
  };

  const handleShare = async (reel: Reel) => {
    const shareUrl = window.location.origin + `/reels?id=${reel.id}`;
    const shareData = {
      title: 'Check out this Reel on Zathu',
      text: reel.caption,
      url: shareUrl
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        toast.success('Shared successfully!');
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link copied to clipboard!');
      }
      
      // Update share count in Firestore
      await updateDoc(doc(db, 'videos', reel.id), { sharesCount: increment(1) });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast.error('Could not share');
      }
    }
  };

  const toggleLike = async (reelId: string) => {
    if (!user) {
      signIn();
      return;
    }
    const isLiked = likedReels[reelId];
    const likeId = `${user.uid}_${reelId}`;

    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'videoLikes', likeId));
        await updateDoc(doc(db, 'videos', reelId), { likesCount: increment(-1) });
      } else {
        await setDoc(doc(db, 'videoLikes', likeId), {
          videoId: reelId,
          userId: user.uid,
          createdAt: new Date()
        });
        await updateDoc(doc(db, 'videos', reelId), { likesCount: increment(1) });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'videoLikes');
    }
  };

  const toggleFollow = async (targetId: string) => {
    if (!user) {
      signIn();
      return;
    }
    const isFollowing = followingIds.includes(targetId);
    const myFollowingRef = doc(db, 'users', user.uid, 'following', targetId);
    try {
      if (isFollowing) {
        await deleteDoc(myFollowingRef);
        await updateDoc(doc(db, 'users', user.uid), { followingCount: increment(-1) });
        await updateDoc(doc(db, 'users', targetId), { followersCount: increment(-1) });
        toast.success('Unfollowed creator');
      } else {
        await setDoc(myFollowingRef, { createdAt: new Date() });
        await updateDoc(doc(db, 'users', user.uid), { followingCount: increment(1) });
        await updateDoc(doc(db, 'users', targetId), { followersCount: increment(1) });
        
        await addDoc(collection(db, 'users', targetId, 'notifications'), {
          type: 'follow',
          senderId: user.uid,
          senderName: profile?.displayName || user.displayName || 'A Creator',
          senderPhoto: profile?.photoURL || user.photoURL || '',
          message: `started following you`,
          isRead: false,
          createdAt: serverTimestamp()
        });
        toast.success('Successfully followed creator!');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'following');
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-2 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin" />
          <Loader2 className="animate-spin text-emerald-500 absolute top-1/2 left-1/2 -ml-3.5 -mt-3.5" size={28} />
        </div>
        <p className="text-white/70 text-xs font-black uppercase tracking-[0.2em] animate-pulse">Initializing Theatre Grid...</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-slate-950 flex items-center justify-center">
      {/* Cinematic Studio Device Bezel frame on Desktop layouts */}
      <div className="relative w-full max-w-[440px] h-full sm:h-[94vh] sm:rounded-[36px] sm:border-4 sm:border-slate-800/80 bg-black overflow-hidden sm:shadow-[0_0_80px_rgba(0,0,0,0.8)] sm:shadow-emerald-950/20 flex flex-col transition-all duration-300">
        
        <div 
          ref={containerRef}
          onScroll={handleScroll}
          onWheel={handleWheel}
          className="flex-1 overflow-y-auto scrollbar-hide scroll-smooth snap-y snap-mandatory select-none"
        >
          {reels.map((reel, index) => (
            <ReelItem 
              key={reel.id} 
              reel={reel} 
              isActive={index === activeIndex} 
              isLiked={!!likedReels[reel.id]}
              isFollowing={followingIds.includes(reel.userId)}
              isMuted={globalMuted}
              onToggleMute={toggleGlobalMute}
              onLike={async () => { await toggleLike(reel.id); }}
              onShare={() => handleShare(reel)}
              onFollow={async () => { await toggleFollow(reel.userId); }}
              showComments={() => setActiveCommentsReelId(reel.id)}
            />
          ))}

          {reels.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-white/50 p-8 text-center bg-slate-950">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-full mb-4">
                <Play size={36} className="text-emerald-500 opacity-80" />
              </div>
              <h3 className="font-bold text-lg text-white mb-2">No masterworks yet</h3>
              <p className="text-xs text-white/60 max-w-[280px] leading-relaxed">Let's populate the neural canvas! Be the absolute first to broadcast your high-definition short video clip.</p>
            </div>
          )}
        </div>

        {/* Global Video Comments Modal */}
        <VideoCommentsModal 
          isOpen={activeCommentsReelId !== null}
          onClose={() => setActiveCommentsReelId(null)}
          videoId={activeCommentsReelId || ''}
        />

        {/* Create Reel Button floating */}
        {user && (
          <button 
            onClick={() => setShowCreateModal(true)}
            id="fab-create-reel"
            className="absolute top-4 right-4 z-[90] w-11 h-11 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 active:scale-95 transition-all border border-emerald-400/25"
            title="Post a Reel"
          >
            <Plus size={22} />
          </button>
        )}

        <CreatePostModal 
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            toast.success("Broadcast broadcast completed!");
          }}
        />
      </div>
    </div>
  );
}

// Floating Notes generator for vinyl music aesthetic
const FloatingNotes = ({ isPlaying }: { isPlaying: boolean }) => {
  if (!isPlaying) return null;
  return (
    <div className="absolute right-0 bottom-0 pointer-events-none w-10 h-16 z-20 overflow-hidden">
      <motion.span
        initial={{ opacity: 0, y: 15, x: 5, scale: 0.5, rotate: 0 }}
        animate={{ 
          opacity: [0, 0.9, 0.9, 0], 
          y: [15, -15, -35, -55],
          x: [5, 12, -2, 8],
          scale: [0.5, 1, 0.8, 0.5],
          rotate: [0, 15, -15, 30]
        }}
        transition={{ duration: 2.8, repeat: Infinity, delay: 0, ease: "easeOut" }}
        className="absolute text-violet-400 text-xs font-bold"
      >
        🎵
      </motion.span>
      <motion.span
        initial={{ opacity: 0, y: 15, x: 0, scale: 0.5, rotate: 0 }}
        animate={{ 
          opacity: [0, 0.8, 0.8, 0], 
          y: [15, -10, -28, -48],
          x: [0, -8, 8, -4],
          scale: [0.5, 0.9, 0.7, 0.4],
          rotate: [0, -20, 10, -25]
        }}
        transition={{ duration: 2.8, repeat: Infinity, delay: 1.1, ease: "easeOut" }}
        className="absolute text-emerald-400 text-xs font-bold"
      >
        🎶
      </motion.span>
    </div>
  );
};

interface ReelItemProps {
  reel: Reel;
  isActive: boolean;
  isLiked: boolean;
  isFollowing: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onLike: () => void | Promise<void>;
  onShare: () => void;
  onFollow: () => void | Promise<void>;
  showComments: () => void;
}

const ReelItem: React.FC<ReelItemProps> = ({ 
  reel, 
  isActive, 
  isLiked, 
  isFollowing, 
  isMuted, 
  onToggleMute, 
  onLike, 
  onShare, 
  onFollow,
  showComments 
}) => {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [lastTap, setLastTap] = useState(0);
  const [showHeartOverlay, setShowHeartOverlay] = useState(false);
  const [heartPos, setHeartPos] = useState({ x: 150, y: 300 });
  const [showVolumeHUD, setShowVolumeHUD] = useState(false);

  // Playback auto toggle
  useEffect(() => {
    if (isActive) {
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch((err) => {
          console.log('Video play failed or interrupted:', err);
        });
      }
      setIsPlaying(true);
    } else {
      videoRef.current?.pause();
      setIsPlaying(false);
    }
  }, [isActive]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  // Click & Double Tap gesture
  const handleMediaControlAction = (e: React.MouseEvent<HTMLVideoElement>) => {
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 280;
    
    if (now - lastTap < DOUBLE_TAP_DELAY) {
      // Complete double tap logic
      if (!isLiked) {
        onLike();
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setHeartPos({ x, y });
      setShowHeartOverlay(true);
    } else {
      // Simple play/pause trigger
      togglePlay();
    }
    setLastTap(now);
  };

  useEffect(() => {
    if (showHeartOverlay) {
      const timer = setTimeout(() => setShowHeartOverlay(false), 800);
      return () => clearTimeout(timer);
    }
  }, [showHeartOverlay]);

  useEffect(() => {
    if (showVolumeHUD) {
      const timer = setTimeout(() => setShowVolumeHUD(false), 900);
      return () => clearTimeout(timer);
    }
  }, [showVolumeHUD]);

  const handleMutedTrigger = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleMute();
    setShowVolumeHUD(true);
  };

  return (
    <div 
      id={`reel-${reel.id}`}
      className="h-full w-full snap-start relative bg-slate-950 flex items-center justify-center overflow-hidden"
    >
      {/* Immersive cinematic overlays */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/75 to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10 pointer-events-none" />

      {/* Actual Reel Video Element */}
      <video 
        ref={videoRef}
        src={reel.videoUrl} 
        loop
        muted={isMuted}
        playsInline
        className="h-full w-full object-cover cursor-pointer select-none"
        onClick={handleMediaControlAction}
      />

      {/* Bursting Heart Animation Overlay on Double Tap */}
      <AnimatePresence>
        {showHeartOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.3, y: 0, rotate: Math.random() * 30 - 15 }}
            animate={{ 
              opacity: [0, 1, 1, 0], 
              scale: [0.3, 1.4, 1.2, 0.9],
              y: [0, -60, -80, -100]
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: "easeOut" }}
            style={{ left: heartPos.x - 40, top: heartPos.y - 40 }}
            className="absolute z-40 pointer-events-none text-red-500 drop-shadow-[0_10px_20px_rgba(239,68,68,0.6)]"
          >
            <Heart size={80} className="fill-current" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sound Volume Overlay Notification HUD */}
      <AnimatePresence>
        {showVolumeHUD && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute self-center justify-self-center pointer-events-none z-40 bg-black/70 backdrop-blur-md px-4 py-3 rounded-2xl flex flex-col items-center gap-1.5 border border-white/15 shadow-xl"
          >
            {isMuted ? <VolumeX size={28} className="text-white" /> : <Volume2 size={28} className="text-white" />}
            <span className="text-white text-[9px] uppercase font-black tracking-widest">{isMuted ? 'Muted' : 'Sound On'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content & Action Interface HUD */}
      <div className="absolute inset-x-0 bottom-0 p-5 pb-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex items-end justify-between z-20 pointer-events-none">
        
        {/* Left Hand: Creator Metadata Box */}
        <div className="flex-1 space-y-4 pointer-events-auto pr-6 max-w-[80%]">
          <div className="flex items-center gap-2.5">
            {/* Avatar container with status ring */}
            <div className="w-10 h-10 rounded-full ring-2 ring-emerald-500/80 p-[1.5px] bg-slate-900 overflow-hidden shrink-0 shadow-md">
              {reel.userPhoto ? (
                <img src={reel.userPhoto} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <div className="w-full h-full rounded-full flex items-center justify-center bg-emerald-950 text-emerald-400 font-black text-sm uppercase">
                  {reel.userName?.[0] || 'Z'}
                </div>
              )}
            </div>
            
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-white font-extrabold text-sm tracking-tight drop-shadow">{reel.userName}</span>
                <span className="inline-flex items-center justify-center p-[2px] bg-sky-500 text-white rounded-full scale-75" title="Verified Creator">
                  <ShieldCheck size={10} className="stroke-[3]" />
                </span>
              </div>
              <span className="text-white/60 text-[10px] uppercase font-bold tracking-wider">LILONGWE BEATS</span>
            </div>

            {/* Elastic Follow Toggle */}
            {user && user.uid !== reel.userId && (
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={onFollow}
                className={cn(
                  "ml-1.5 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full transition-all duration-300 border",
                  isFollowing 
                    ? "bg-white/10 text-white border-white/10 hover:bg-white/15" 
                    : "bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-400/20 shadow-md shadow-emerald-500/10"
                )}
              >
                {isFollowing ? (
                  <span className="flex items-center gap-0.5"><Check size={8} className="stroke-[4]" /> Following</span>
                ) : (
                  'Follow'
                )}
              </motion.button>
            )}
          </div>

          {/* Reel Caption */}
          <p className="text-white/95 text-xs font-semibold leading-relaxed drop-shadow-sm line-clamp-2 max-w-sm">
            {reel.caption || "Crafting visual symphonies on the Zathu platform."}
          </p>

          {/* Scrolling Marquee Audio Track Label & LP Spinner */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/5 p-2 rounded-xl backdrop-blur-md max-w-[210px] overflow-hidden">
            <Music2 size={12} className="text-emerald-400 shrink-0" />
            <div className="flex-1 w-24 overflow-hidden relative">
              <span className="inline-block whitespace-nowrap text-[11px] text-white/90 font-medium font-mono animate-[bounce_5s_infinite_linear]">
                {reel.musicName || 'Official Zathu Audio Track'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Hand: Action Button Hub (Vertical Row) */}
        <div className="flex flex-col items-center gap-5 pointer-events-auto pb-2 shrink-0 z-30">
          
          {/* Action Item: Like Button */}
          <div className="flex flex-col items-center">
            <motion.button 
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.85 }}
              onClick={onLike}
              className={cn(
                "p-3 rounded-2xl border transition-all duration-300 shadow-lg relative group overflow-hidden flex items-center justify-center",
                isLiked 
                  ? "bg-red-500/10 text-red-500 border-red-500/20 drop-shadow-[0_4px_12px_rgba(239,68,68,0.3)]" 
                  : "bg-black/40 text-white border-white/10 hover:bg-black/60 hover:border-white/20"
              )}
            >
              <Heart size={22} className={cn("transition-transform duration-300", isLiked && "fill-current scale-110")} />
              {isLiked && (
                <span className="absolute inset-0 bg-red-500/5 animate-pulse rounded-2xl" />
              )}
            </motion.button>
            <span className="text-white/90 text-[11px] font-black tracking-tighter mt-1 drop-shadow-sm font-mono">{reel.likesCount || 0}</span>
          </div>

          {/* Action Item: Comments Button */}
          <div className="flex flex-col items-center">
            <motion.button 
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.85 }}
              onClick={showComments}
              className="p-3 rounded-2xl bg-black/40 text-white border border-white/10 hover:bg-black/60 hover:border-white/20 transition-all duration-300 shadow-lg"
            >
              <MessageSquare size={22} />
            </motion.button>
            <span className="text-white/90 text-[11px] font-black tracking-tighter mt-1 drop-shadow-sm font-mono">{reel.commentsCount || 0}</span>
          </div>

          {/* Action Item: Share Button */}
          <div className="flex flex-col items-center">
            <motion.button 
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.85 }}
              onClick={onShare}
              className="p-3 rounded-2xl bg-black/40 text-white border border-white/10 hover:bg-black/60 hover:border-white/20 transition-all duration-300 shadow-lg"
            >
              <Share2 size={22} />
            </motion.button>
            <span className="text-white/90 text-[11px] font-black tracking-tighter mt-1 drop-shadow-sm font-mono">{reel.sharesCount || 0}</span>
          </div>

          {/* Action Item: Muted/Unmuted Indicator */}
          <motion.button 
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.85 }}
            onClick={handleMutedTrigger}
            className={cn(
              "p-3 rounded-2xl border transition-all duration-300 shadow-lg",
              isMuted 
                ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                : "bg-black/40 text-white border-white/10 hover:bg-black/60 hover:border-white/20"
            )}
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </motion.button>

          {/* Vinyl Disc Spin visual details & Floating bubbles/notes */}
          <div className="relative w-12 h-12 flex items-center justify-center mt-2 pointer-events-auto">
            <FloatingNotes isPlaying={isPlaying} />
            <motion.div
              animate={isPlaying ? { rotate: 360 } : {}}
              transition={{ repeat: Infinity, duration: 4.5, ease: "linear" }}
              className="w-10 h-10 rounded-full border border-zinc-700 bg-gradient-to-r from-zinc-900 via-zinc-950 to-zinc-900 p-1 flex items-center justify-center shrink-0 shadow-lg"
            >
              <div className="w-full h-full rounded-full bg-gradient-to-tr from-zinc-800 to-black flex items-center justify-center relative p-[3px]">
                {/* Simulated center label */}
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <div className="w-1 h-1 rounded-full bg-black" />
                </div>
              </div>
            </motion.div>
          </div>

        </div>
      </div>

      {/* Floating play/pause indicator hub */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.4 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
          >
            <div className="p-5 rounded-3xl bg-black/65 backdrop-blur-md border border-white/10 shadow-2xl">
              <Play size={44} className="text-white pl-1 drop-shadow" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
