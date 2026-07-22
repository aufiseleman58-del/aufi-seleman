import React, { useState, useEffect, useRef } from 'react';
import { Play, Heart, MessageSquare, Share2, Music2, ShieldCheck, Plus, X, Loader2, Upload, Camera, TrendingUp, Smile } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import VideoUploadModal from '../components/VideoUploadModal';
import VideoPlayer from '../components/VideoPlayer';
import VideoCommentsModal from '../components/VideoCommentsModal';
import PromotionModal from '../components/PromotionModal';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { setDoc, deleteDoc, increment, updateDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface VideoData {
  id: string;
  userId: string;
  caption: string;
  videoUrl: string;
  likesCount: number;
  commentsCount: number;
  createdAt: any;
  userProfile?: {
    displayName: string;
    photoURL: string;
    isVerified: boolean;
  };
  fireCount?: number;
  laughCount?: number;
  loveCount?: number;
  isPromoted?: boolean;
}

interface FloatingReaction {
  id: string;
  videoId: string;
  emoji: string;
  left: number;
  scale: number;
  swayX: number[];
}

export default function Videos() {
  const { user, profile, signIn } = useAuth();
  const { t, dataSaver } = useSettings();
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [myVideos, setMyVideos] = useState<VideoData[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [likedVideos, setLikedVideos] = useState<Record<string, boolean>>({});
  const [showCommentsFor, setShowCommentsFor] = useState<string | null>(null);
  const [showPromoteFor, setShowPromoteFor] = useState<any>(null);
  const [showTopPanels, setShowTopPanels] = useState(false);
  const [activeReactionPicker, setActiveReactionPicker] = useState<string | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const emojis = {
    fire: '🔥',
    laugh: '😂',
    love: '❤️'
  };

  const handleReact = async (videoId: string, type: 'fire' | 'laugh' | 'love') => {
    const emoji = emojis[type];
    const reactionId = `${Date.now()}_${Math.random()}`;
    const left = 35 + Math.random() * 30; // 35% to 65% for central spread
    const scale = 0.8 + Math.random() * 0.6; // 0.8 to 1.4 scale factor
    
    // Random back and forth sway keyframes on the X-axis
    const sway1 = (Math.random() - 0.5) * 80;
    const sway2 = (Math.random() - 0.5) * 120;
    const sway3 = (Math.random() - 0.5) * 60;

    setFloatingReactions((prev) => [
      ...prev,
      {
        id: reactionId,
        videoId,
        emoji,
        left,
        scale,
        swayX: [0, sway1, sway2, sway3, 0]
      }
    ]);

    // Cleanup floating animation when finished
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== reactionId));
    }, 2200);

    // Save increment to Firestore
    try {
      const fieldName = `${type}Count`;
      await updateDoc(doc(db, 'videos', videoId), {
        [fieldName]: increment(1)
      });
    } catch (error) {
      console.error("Firestore Reaction update failed:", error);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-video-id');
            setActiveVideoId((prev) => {
              if (prev && prev !== id) {
                setShowTopPanels(false);
                setActiveReactionPicker(null);
              }
              return id;
            });
          }
        });
      },
      { threshold: 0.6 }
    );

    const videoElements = document.querySelectorAll('[data-video-id]');
    videoElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [videos]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'videos'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as VideoData));
      setMyVideos(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `videos?userId=${user?.uid}`);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const videosData = snapshot.docs.map((vDoc) => {
        const data = vDoc.data();
        return {
          ...data,
          id: vDoc.id,
          userProfile: data.userProfile || { displayName: 'User', photoURL: '', isVerified: false }
        } as any;
      });

      // Show promoted videos first
      const sortedVideos = [...videosData].sort((a, b) => {
        if (a.isPromoted && !b.isPromoted) return -1;
        if (!a.isPromoted && b.isPromoted) return 1;
        return 0; // Maintain original order if both same
      });

      setVideos(sortedVideos);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'videos');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Fetch user's likes for all videos
    const q = query(
      collection(db, 'videoLikes'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const likes: Record<string, boolean> = {};
      snapshot.docs.forEach(doc => {
        likes[doc.data().videoId] = true;
      });
      setLikedVideos(likes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'videoLikes');
    });

    return () => unsubscribe();
  }, [user]);

  const handleShare = async (video: VideoData) => {
    const shareData = {
      title: 'Check out this video on Zathu',
      text: video.caption,
      url: window.location.origin + `/videos?id=${video.id}`
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        toast.success('Shared successfully!');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          toast.error('Could not share');
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        toast.success('Link copied to clipboard!');
      } catch (err) {
        toast.error('Failed to copy link');
      }
    }
  };

  const handleRepostToFeed = async (video: VideoData) => {
    if (!user) {
      signIn();
      return;
    }

    try {
      await addDoc(collection(db, 'posts'), {
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName || 'Anonymous',
        authorPhoto: profile?.photoURL || user.photoURL || '',
        authorVerified: profile?.isVerified || false,
        content: `Shared a video: ${video.caption}`,
        media: [video.videoUrl],
        category: 'Videos',
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        viewsCount: 0,
        createdAt: serverTimestamp(),
        isModerated: true,
        sourceVideoId: video.id
      });

      await updateDoc(doc(db, 'videos', video.id), {
        sharesCount: increment(1)
      });

      toast.success('Shared to your feed!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'posts');
      toast.error('Failed to share to feed');
    }
  };

  const toggleLike = async (videoId: string) => {
    if (!user) {
      signIn();
      return;
    }

    const isLiked = likedVideos[videoId];
    const likeId = `${user.uid}_${videoId}`;

    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'videoLikes', likeId));
        await updateDoc(doc(db, 'videos', videoId), {
          likesCount: increment(-1)
        });
      } else {
        await setDoc(doc(db, 'videoLikes', likeId), {
          videoId,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'videos', videoId), {
          likesCount: increment(1)
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'videoLikes');
    }
  };

  const touchStartY = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const dragStartY = useRef<number>(0);
  const lastWheelTime = useRef<number>(0);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateVideo(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateVideo(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeVideoId, videos]);

  const getActiveVideoIndex = () => {
    return videos.findIndex(v => v.id === activeVideoId);
  };

  const navigateVideo = (direction: number) => {
    const currentIndex = getActiveVideoIndex();
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < videos.length) {
      const nextVideo = videos[nextIndex];
      const el = document.querySelector(`[data-video-id="${nextVideo.id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // Wheel helper
  const handleWheel = (e: React.WheelEvent) => {
    const now = Date.now();
    if (now - lastWheelTime.current < 650) return;

    if (Math.abs(e.deltaY) > 20) {
      if (e.deltaY > 0) {
        navigateVideo(1);
        lastWheelTime.current = now;
      } else {
        navigateVideo(-1);
        lastWheelTime.current = now;
      }
    }
  };

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndY.current = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY.current;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        navigateVideo(1);
      } else {
        navigateVideo(-1);
      }
    }
  };

  // Drag simulations for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, video, a, input, textarea')) return;
    isDragging.current = true;
    dragStartY.current = e.clientY;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const dragEndY = e.clientY;
    const diff = dragStartY.current - dragEndY;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        navigateVideo(1);
      } else {
        navigateVideo(-1);
      }
    }
  };

  if (loading) {
    return (
      <div className="h-full bg-black scrollbar-hide flex flex-col snap-y snap-mandatory overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div key={`video-skeleton-${i}`} className="h-full w-full snap-start relative bg-slate-900 animate-pulse flex flex-col justify-end p-6 gap-4">
            <div className="w-48 h-6 bg-slate-800 rounded-lg" />
            <div className="w-64 h-4 bg-slate-800 rounded-lg" />
            <div className="w-32 h-8 bg-slate-800 rounded-full" />
            
            <div className="absolute bottom-10 right-4 flex flex-col gap-6 items-center">
              <div className="w-12 h-12 bg-slate-800 rounded-2xl" />
              <div className="w-10 h-10 bg-slate-800 rounded-2xl" />
              <div className="w-10 h-10 bg-slate-800 rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      className="h-full bg-black snap-y snap-mandatory overflow-y-scroll scrollbar-hide relative select-none"
    >
      {/* Top Navigation / Collapsible Stories Drawer */}
      <div className="absolute top-0 left-0 right-0 z-50 p-2 pointer-events-none flex flex-col gap-2">
        <div className="flex items-center justify-between pointer-events-auto bg-black/40 backdrop-blur-lg border border-white/10 rounded-2xl p-3 mx-2 mt-2 shadow-lg shadow-black/20">
          <div className="flex items-center gap-2">
            <h1 className="text-white font-black text-sm tracking-tight">{t('nav.videos')}</h1>
            {dataSaver && (
              <span className="flex items-center gap-0.5 text-primary text-[7px] font-black uppercase tracking-widest bg-emerald-500/20 px-1.5 py-0.5 rounded-full">
                DS
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowTopPanels(!showTopPanels)}
              className={cn(
                "px-2.5 py-1 rounded-xl text-[9px] font-extrabold uppercase tracking-widest transition-all border shrink-0 flex items-center gap-1.5",
                showTopPanels 
                  ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                  : "bg-white/10 text-white/90 border-white/10 hover:bg-white/20"
              )}
            >
              <TrendingUp size={11} className={cn(showTopPanels && "animate-pulse")} />
              <span>Explore</span>
              <motion.span 
                animate={{ rotate: showTopPanels ? 180 : 0 }} 
                className="inline-block text-[8px]"
              >
                ▼
              </motion.span>
            </button>

            {user && (
              <button 
                onClick={() => setShowUpload(true)}
                className="h-7 w-7 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90"
                title="Upload Visual"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Content */}
        <AnimatePresence>
          {showTopPanels && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -15 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="mx-2 overflow-hidden bg-black/75 backdrop-blur-xl border border-white/10 rounded-2xl p-3 space-y-4 pointer-events-auto shadow-2xl text-left"
            >
              {myVideos.length > 0 && (
                <div className="space-y-1.5 text-left">
                  <h2 className="text-[9px] font-black uppercase tracking-widest text-white/50 px-1 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    My Stories
                  </h2>
                  <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1 px-1">
                    {myVideos.map((v, index) => (
                      <div 
                        key={`${v.id}-${index}`} 
                        className="shrink-0 w-12 h-18 rounded-xl border border-white/10 overflow-hidden bg-slate-800 relative group transition-all hover:scale-105 active:scale-95 cursor-pointer"
                        onMouseEnter={(e) => {
                          const video = e.currentTarget.querySelector('video');
                          if (video) video.play().catch(() => {});
                        }}
                        onMouseLeave={(e) => {
                          const video = e.currentTarget.querySelector('video');
                          if (video) {
                            video.pause();
                            video.currentTime = 0;
                          }
                        }}
                      >
                        <video src={v.videoUrl || undefined} muted loop playsInline className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 pointer-events-none">
                          <Play size={12} className="text-white fill-current" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {videos.some(v => v.isPromoted) && (
                <div className="space-y-1.5 text-left">
                  <h2 className="text-[9px] font-black uppercase tracking-widest text-primary px-1 flex items-center gap-1.5">
                    <TrendingUp size={11} className="animate-pulse" />
                    Featured Vision
                  </h2>
                  <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1 px-1">
                    {videos.filter(v => v.isPromoted).map((v, index) => (
                      <div 
                        key={`boost-story-${v.id}-${index}`}
                        onClick={() => {
                          const el = document.querySelector(`[data-video-id="${v.id}"]`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth' });
                            setShowTopPanels(false);
                          }
                        }}
                        className="shrink-0 w-16 h-22 rounded-xl border-2 border-primary/40 overflow-hidden bg-slate-900 relative group transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
                      >
                        <video src={v.videoUrl || undefined} muted loop playsInline className="w-full h-full object-cover opacity-80" />
                        <div className="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent" />
                        <div className="absolute bottom-1 left-1.5 right-1.5">
                          <p className="text-[7px] font-black text-white truncate uppercase tracking-tighter">@{v.userProfile?.displayName}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {videos.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-white p-8 text-center space-y-4">
          <Play size={60} className="text-slate-700" />
          <h2 className="text-xl font-bold">No videos yet</h2>
          <p className="text-slate-400 text-sm">Be the first to share a video with the community!</p>
          <Button onClick={() => user ? setShowUpload(true) : signIn()} className="bg-primary hover:bg-emerald-700 rounded-full px-8">
            Upload Video
          </Button>
        </div>
      ) : (
        videos.map((video, index) => (
          <div 
            key={`${video.id}-${index}`} 
            data-video-id={video.id}
            className="relative h-full w-full snap-start flex items-center justify-center overflow-hidden bg-black"
          >
            <VideoPlayer 
              src={video.videoUrl || ''} 
              isActive={activeVideoId === video.id}
              onLike={() => toggleLike(video.id)}
            />

            {/* Floating Reactions Overlay */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-30">
              <AnimatePresence>
                {floatingReactions
                  .filter((r) => r.videoId === video.id)
                  .map((r) => (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: '80%', scale: 0.3 }}
                      animate={{
                        opacity: [0, 1, 1, 0],
                        y: '-25%',
                        x: r.swayX,
                        scale: [0.3, r.scale, r.scale, 0.4],
                        rotate: [0, -15, 15, -10, 0]
                      }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 2.2,
                        ease: "easeOut"
                      }}
                      style={{
                        position: 'absolute',
                        left: `${r.left}%`,
                        bottom: '40px',
                        transform: 'translateX(-50%)',
                      }}
                      className="text-4xl filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] select-none pointer-events-none"
                    >
                      {r.emoji}
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>
            
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/80 pointer-events-none" />

            {/* Bottom Info */}
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              className="absolute bottom-4 left-4 right-16 text-white space-y-3 z-10"
            >
              <div className="flex items-center gap-2">
                <div className="p-0.5 rounded-lg bg-gradient-to-tr from-primary to-accent">
                   <div className="bg-black rounded-md px-2 py-0.5 flex items-center gap-1.5">
                     <h3 className="font-bold text-[13px]">@{video.userProfile?.displayName}</h3>
                     {video.userProfile?.isVerified && <ShieldCheck size={12} className="text-primary fill-current" />}
                   </div>
                </div>
                {video.isPromoted && (
                  <span className="text-[9px] font-black uppercase text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20 backdrop-blur-sm">
                    Sponsored
                  </span>
                )}
              </div>
              <p className="text-[13px] leading-relaxed line-clamp-2 font-medium drop-shadow-md">
                {video.caption}
              </p>
              <div className="flex items-center gap-2 text-[10px] bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full w-fit border border-white/10">
                <Music2 size={10} className="animate-spin-slow" />
                <span className="truncate max-w-[150px] font-semibold tracking-wide uppercase">Zathu Original • {video.userProfile?.displayName}</span>
              </div>
            </motion.div>

            {/* Right Actions */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              className="absolute bottom-6 right-3 flex flex-col items-center gap-6 text-white z-10"
            >
              <div className="relative mb-2">
                <div className="w-11 h-11 rounded-2xl border-2 border-white overflow-hidden shadow-lg bg-slate-800">
                  {video.userProfile?.photoURL ? (
                    <img src={video.userProfile.photoURL} alt="Avatar" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-primary font-bold">
                      {video.userProfile?.displayName?.[0]}
                    </div>
                  )}
                </div>
                {user && video.userId === user.uid && !video.isPromoted && (
                  <div 
                    onClick={() => setShowPromoteFor(video)}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary rounded-full w-5 h-5 flex items-center justify-center border-2 border-black cursor-pointer shadow-lg hover:scale-110 active:scale-95 transition-all"
                  >
                    <Plus size={12} className="text-white" />
                  </div>
                )}
              </div>

              {user && video.userId === user.uid && !video.isPromoted && (
                <button 
                  onClick={() => setShowPromoteFor(video)}
                  className="flex flex-col items-center gap-1 group"
                >
                  <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:bg-primary transition-colors">
                    <TrendingUp size={22} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Boost</span>
                </button>
              )}
              
              <button 
                onClick={() => toggleLike(video.id)}
                className="flex flex-col items-center gap-1 group"
              >
                <div className={cn(
                  "p-2.5 bg-black/20 backdrop-blur-md rounded-2xl group-active:scale-90 transition-transform border border-white/10",
                  likedVideos[video.id] && "bg-accent/20 border-accent/40"
                )}>
                  <Heart 
                    size={24} 
                    className={cn(
                      "text-white transition-colors",
                      likedVideos[video.id] && "text-accent fill-accent"
                    )} 
                  />
                </div>
                <span className="text-[10px] font-bold shadow-sm">{video.likesCount}</span>
              </button>

              {/* Reactions Button with Trigger */}
              <div className="relative flex flex-col items-center">
                {/* Horizontal Expandable Reaction Picker Menu */}
                <AnimatePresence>
                  {activeReactionPicker === video.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.85, x: 20 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.85, x: 20 }}
                      transition={{ type: "spring", damping: 15, stiffness: 200 }}
                      className="absolute right-14 top-1/2 -translate-y-1/2 bg-black/75 backdrop-blur-xl border border-white/15 rounded-2xl p-2.5 flex items-center gap-3 shadow-[0_10px_30px_rgba(0,0,0,0.6)] z-30 pointer-events-auto min-w-[150px]"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReact(video.id, 'fire');
                        }}
                        className="flex-1 flex flex-col items-center gap-1 hover:scale-135 transition-transform active:scale-90"
                        title="Fire"
                      >
                        <span className="text-2xl select-none leading-none">🔥</span>
                        <span className="text-[10px] font-black tracking-tight text-white/90">
                          {video.fireCount || 0}
                        </span>
                      </button>

                      <div className="h-6 w-[1px] bg-white/20 self-center" />

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReact(video.id, 'laugh');
                        }}
                        className="flex-1 flex flex-col items-center gap-1 hover:scale-135 transition-transform active:scale-90"
                        title="Laugh"
                      >
                        <span className="text-2xl select-none leading-none">😂</span>
                        <span className="text-[10px] font-black tracking-tight text-white/90">
                          {video.laughCount || 0}
                        </span>
                      </button>

                      <div className="h-6 w-[1px] bg-white/20 self-center" />

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReact(video.id, 'love');
                        }}
                        className="flex-1 flex flex-col items-center gap-1 hover:scale-135 transition-transform active:scale-90"
                        title="Love"
                      >
                        <span className="text-2xl select-none leading-none">❤️</span>
                        <span className="text-[10px] font-black tracking-tight text-white/90">
                          {video.loveCount || 0}
                        </span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveReactionPicker(prev => prev === video.id ? null : video.id);
                  }}
                  className="flex flex-col items-center gap-1 group"
                  title="Express Sentiment"
                >
                  <div className={cn(
                    "p-2.5 bg-black/20 backdrop-blur-md rounded-2xl group-hover:bg-white/10 active:scale-90 transition-all border border-white/10",
                    activeReactionPicker === video.id && "bg-primary/20 border-primary/40 text-primary"
                  )}>
                    <Smile 
                      size={24} 
                      className={cn(
                        "text-white transition-colors",
                        activeReactionPicker === video.id && "text-primary"
                      )} 
                    />
                  </div>
                  <span className="text-[10px] font-bold shadow-sm">React</span>
                </button>
              </div>

              <button 
                onClick={() => setShowCommentsFor(video.id)}
                className="flex flex-col items-center gap-1 group"
              >
                <div className="p-2.5 bg-black/20 backdrop-blur-md rounded-2xl group-active:scale-90 transition-transform border border-white/10">
                  <MessageSquare size={24} className="text-white" />
                </div>
                <span className="text-[10px] font-bold shadow-sm">{video.commentsCount}</span>
              </button>

              <button 
                onClick={() => handleShare(video)}
                className="flex flex-col items-center gap-1 group"
              >
                <div className="p-2.5 bg-black/20 backdrop-blur-md rounded-2xl group-active:scale-90 transition-transform border border-white/10">
                  <Share2 size={24} className="text-white" />
                </div>
                <span className="text-[10px] font-bold shadow-sm">{t('video.share')}</span>
              </button>

              <div className="w-10 h-10 rounded-full border-4 border-slate-800/50 bg-slate-900 flex items-center justify-center animate-spin-slow mt-2 overflow-hidden">
                 <div className="w-full h-full bg-gradient-to-tr from-primary to-accent opacity-50" />
              </div>
            </motion.div>
          </div>
        ))
      )}

      {/* Upload Modal */}
      <VideoUploadModal 
        isOpen={showUpload} 
        onClose={() => setShowUpload(false)} 
      />

      {/* Comments Modal */}
      <VideoCommentsModal 
        isOpen={!!showCommentsFor}
        onClose={() => setShowCommentsFor(null)}
        videoId={showCommentsFor || ''}
      />

      {showPromoteFor && user && (
        <PromotionModal 
          itemId={showPromoteFor.id}
          itemType="video"
          title={showPromoteFor.caption || "Zathu Vision Video"}
          userId={user.uid}
          onClose={() => setShowPromoteFor(null)}
        />
      )}
    </div>
  );
}
