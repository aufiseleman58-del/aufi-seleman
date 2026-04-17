import React, { useState, useEffect, useRef } from 'react';
import { Play, Heart, MessageSquare, Share2, Music2, ShieldCheck, Plus, X, Loader2, Upload, Camera } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import VideoUploadModal from '../components/VideoUploadModal';
import VideoPlayer from '../components/VideoPlayer';
import VideoCommentsModal from '../components/VideoCommentsModal';
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
}

export default function Videos() {
  const { user, profile } = useAuth();
  const { t, dataSaver } = useSettings();
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [myVideos, setMyVideos] = useState<VideoData[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [likedVideos, setLikedVideos] = useState<Record<string, boolean>>({});
  const [showCommentsFor, setShowCommentsFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveVideoId(entry.target.getAttribute('data-video-id'));
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
      handleFirestoreError(error, OperationType.LIST, `videos?userId=${user.uid}`);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const videosData = await Promise.all(snapshot.docs.map(async (vDoc) => {
        const data = vDoc.data();
        let userProfile = { displayName: 'User', photoURL: '', isVerified: false };
        
        try {
          const userDoc = await getDoc(doc(db, 'users', data.userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userProfile = {
              displayName: userData.displayName || 'User',
              photoURL: userData.photoURL || '',
              isVerified: userData.isVerified || false
            };
          }
        } catch (e) {
          console.error("Error fetching user profile for video:", e);
        }

        return {
          ...data,
          id: vDoc.id,
          userProfile
        } as VideoData;
      }));
      setVideos(videosData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'videos');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || videos.length === 0) return;

    // Fetch user's likes for current videos
    const q = query(
      collection(db, 'videoLikes'),
      where('userId', '==', user.uid),
      where('videoId', 'in', videos.slice(0, 10).map(v => v.id)) // Firestore limit is 10 for 'in'
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
  }, [user, videos]);

  const toggleLike = async (videoId: string) => {
    if (!user) {
      toast.error("Please login to like videos");
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

  if (loading) {
    return (
      <div className="h-full bg-black scrollbar-hide flex flex-col snap-y snap-mandatory overflow-hidden">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-full w-full snap-start relative bg-slate-900 animate-pulse flex flex-col justify-end p-6 gap-4">
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
    <div className="h-full bg-black snap-y snap-mandatory overflow-y-scroll scrollbar-hide relative">
      {/* Top Navigation / My Videos Scroll */}
      <div className="absolute top-0 left-0 right-0 z-50 p-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
        <div className="flex items-center justify-between mb-4 pointer-events-auto">
          <div className="flex flex-col">
            <h1 className="text-white font-bold text-lg">{t('nav.videos')}</h1>
            {dataSaver && (
              <div className="flex items-center gap-1 text-primary text-[8px] font-bold uppercase tracking-widest bg-emerald-500/20 px-2 py-0.5 rounded-full w-fit">
                <ShieldCheck size={10} />
                {t('settings.dataSaver')} ON
              </div>
            )}
          </div>
        </div>
        
        {myVideos.length > 0 && (
          <div className="space-y-2 pointer-events-auto mt-2">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-white/60 px-1 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              My Stories
            </h2>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 px-1">
              {myVideos.map((v) => (
                <div key={v.id} className="shrink-0 w-16 h-24 rounded-2xl border border-white/10 overflow-hidden bg-slate-800 relative group ring-white/20 transition-all hover:ring-2 active:scale-95 cursor-pointer">
                  <video src={v.videoUrl || undefined} className="w-full h-full object-cover opacity-60" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                    <Play size={16} className="text-white fill-current" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {videos.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-white p-8 text-center space-y-4">
          <Play size={60} className="text-slate-700" />
          <h2 className="text-xl font-bold">No videos yet</h2>
          <p className="text-slate-400 text-sm">Be the first to share a video with the community!</p>
          <Button onClick={() => setShowUpload(true)} className="bg-primary hover:bg-emerald-700 rounded-full px-8">
            Upload Video
          </Button>
        </div>
      ) : (
        videos.map((video) => (
          <div 
            key={video.id} 
            data-video-id={video.id}
            className="relative h-full w-full snap-start flex items-center justify-center overflow-hidden bg-black"
          >
            <VideoPlayer 
              src={video.videoUrl || ''} 
              isActive={activeVideoId === video.id}
              onLike={() => toggleLike(video.id)}
            />
            
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
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary rounded-full w-5 h-5 flex items-center justify-center border-2 border-black">
                  <Plus size={12} className="text-white" />
                </div>
              </div>
              
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

              <button 
                onClick={() => setShowCommentsFor(video.id)}
                className="flex flex-col items-center gap-1 group"
              >
                <div className="p-2.5 bg-black/20 backdrop-blur-md rounded-2xl group-active:scale-90 transition-transform border border-white/10">
                  <MessageSquare size={24} className="text-white" />
                </div>
                <span className="text-[10px] font-bold shadow-sm">{video.commentsCount}</span>
              </button>

              <button className="flex flex-col items-center gap-1 group">
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
    </div>
  );
}
