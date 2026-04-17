import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { Heart, MessageSquare, Share2, Settings, ShieldCheck, MapPin, Calendar, User as UserIcon, X, Globe, Moon, Bell, Shield, LogOut, ChevronRight, Camera, RefreshCw, Upload, Play, ArrowDownLeft, ArrowUpRight, History, Check, Wallet as WalletIcon, Bookmark } from 'lucide-react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import User from '../components/User';
import { cn } from '@/lib/utils';

export default function Profile() {
  const { userId: paramId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user, profile: myProfile, logout, updateProfile, verifyIdentity } = useAuth();
  const { language, setLanguage, dataSaver, setDataSaver, t } = useSettings();
  
  const [targetProfile, setTargetProfile] = useState<any>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const targetId = paramId || user?.uid;
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [userVideos, setUserVideos] = useState<any[]>([]);
  const [userComments, setUserComments] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'videos' | 'activity' | 'saved'>('posts');
  const [activityFilter, setActivityFilter] = useState<'all' | 'posts' | 'comments'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  
  // Form states
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editPhoto, setEditPhoto] = useState('');
  const [photoFile, setPhotoFile] = useState<File | Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOwnProfile && myProfile) {
      setEditName(myProfile.displayName || '');
      setEditBio(myProfile.bio || '');
      setEditLocation(myProfile.location || 'Malawi');
      setEditPhoto(myProfile.photoURL || '');
    }
  }, [myProfile, isOwnProfile]);

  useEffect(() => {
    setIsOwnProfile(!!user && targetId === user.uid);
  }, [user, targetId]);

  useEffect(() => {
    if (!targetId) return;

    const fetchProfile = async () => {
      if (isOwnProfile && myProfile) {
        setTargetProfile(myProfile);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', targetId));
        if (userDoc.exists()) {
          setTargetProfile(userDoc.data());
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
      }
    };
    fetchProfile();
  }, [targetId, isOwnProfile, myProfile]);

  useEffect(() => {
    if (!targetId) return;

    const qPosts = query(
      collection(db, 'posts'),
      where('authorId', '==', targetId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribePosts = onSnapshot(qPosts, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setUserPosts(postsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
    });

    const qVideos = query(
      collection(db, 'videos'),
      where('userId', '==', targetId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeVideos = onSnapshot(qVideos, (snapshot) => {
      const videosData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setUserVideos(videosData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'videos');
      setLoading(false);
    });

    const qComments = query(
      collection(db, 'videoComments'),
      where('userId', '==', targetId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeComments = onSnapshot(qComments, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        activityType: 'comment'
      }));
      setUserComments(commentsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'videoComments');
    });

    // Fetch saved posts - only if own profile
    let unsubscribeSaved = () => {};
    if (isOwnProfile && targetId) {
      unsubscribeSaved = onSnapshot(collection(db, 'users', targetId, 'savedPosts'), async (snapshot) => {
        const savedIds = snapshot.docs.map(doc => doc.id);
        if (savedIds.length === 0) {
          setSavedPosts([]);
          return;
        }
        
        const postsData = await Promise.all(
          savedIds.map(async (id) => {
            const postDoc = await getDoc(doc(db, 'posts', id));
            return postDoc.exists() ? { ...postDoc.data(), id: postDoc.id } : null;
          })
        );
        setSavedPosts(postsData.filter(p => p !== null));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'savedPosts');
      });
    }

    return () => {
      unsubscribePosts();
      unsubscribeVideos();
      unsubscribeComments();
      unsubscribeSaved();
      // Ensure camera is stopped on unmount
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [targetId, isOwnProfile]);

  useEffect(() => {
    if (!isEditing && isCameraOpen) {
      stopCamera();
    }
  }, [isEditing, isCameraOpen]);

  const handleLogout = async () => {
    await logout();
    setShowSettings(false);
    toast.success("Logged out successfully");
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      let photoURL = editPhoto;
      
      if (photoFile) {
        const storageRef = ref(storage, `profiles/${user.uid}/avatar_${Date.now()}`);
        const uploadResult = await uploadBytes(storageRef, photoFile);
        photoURL = await getDownloadURL(uploadResult.ref);
      }

      await updateProfile({
        displayName: editName,
        bio: editBio,
        location: editLocation,
        photoURL: photoURL
      });
      setIsEditing(false);
      setPhotoFile(null);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOpen(true);
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      let msg = "Could not access camera.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = "Camera permission denied. Please enable it in your browser settings.";
      }
      setCameraError(msg);
      toast.error(msg);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("File too large. Max 2MB.");
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditPhoto(reader.result as string);
        toast.success("Photo selected!");
      };
      reader.readAsDataURL(file);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        // Match the mirrored preview for the captured photo
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.save();
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        context.restore();
        
        canvas.toBlob((blob) => {
          if (blob) {
            setPhotoFile(blob);
            const dataUrl = canvas.toDataURL('image/jpeg');
            setEditPhoto(dataUrl);
            stopCamera();
            toast.success("Photo captured!");
          }
        }, 'image/jpeg', 0.8);
      }
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <motion.div 
          key="loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="py-8 text-center text-text-muted text-xs italic"
        >
          {t('common.loading')}
        </motion.div>
      );
    }

    if (activeTab === 'posts') {
      return (
        <motion.div
          key="posts"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="space-y-3"
        >
          {userPosts.length === 0 ? (
            <div className="py-12 text-center space-y-2 bg-slate-50 rounded-xl border border-dashed border-border">
              <p className="text-sm font-medium text-text-muted">{t('profile.noPosts')}</p>
              <Link to="/">
                <Button variant="link" className="text-primary text-xs">{t('profile.shareFirstPost')}</Button>
              </Link>
            </div>
          ) : (
            userPosts.map((post) => (
              <div key={post.id} className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm p-3">
                <div className="text-[13px] leading-relaxed whitespace-pre-wrap mb-2">
                  {post.content}
                </div>
                {post.media?.[0] && (
                  <img 
                    src={post.media[0] || undefined} 
                    alt="Post content" 
                    className="w-full aspect-video object-cover rounded-lg mb-2"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="flex items-center gap-4 pt-2 border-t border-border mt-2">
                  <div className="flex items-center gap-1 text-text-muted">
                    <Heart size={14} />
                    <span className="text-[11px]">{post.likesCount || 0}</span>
                  </div>
                  <div className="flex items-center gap-1 text-text-muted">
                    <MessageSquare size={14} />
                    <span className="text-[11px]">{post.commentsCount || 0}</span>
                  </div>
                  <div className="text-[10px] text-text-muted ml-auto">
                    {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                  </div>
                </div>
              </div>
            ))
          )}
        </motion.div>
      );
    }

    if (activeTab === 'videos') {
      return (
        <motion.div
          key="videos"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="grid grid-cols-3 gap-1"
        >
          {userVideos.length === 0 ? (
            <div className="col-span-3 py-12 text-center space-y-2 bg-slate-50 rounded-xl border border-dashed border-border">
              <p className="text-sm font-medium text-text-muted">{t('profile.noVideos')}</p>
              <Link to="/videos">
                <Button variant="link" className="text-primary text-xs">{t('profile.shareFirstVideo')}</Button>
              </Link>
            </div>
          ) : (
            userVideos.map((video) => (
              <div key={video.id} className="aspect-[9/16] bg-slate-100 rounded-lg overflow-hidden relative group">
                <video src={video.videoUrl || undefined} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/20 flex items-end p-2">
                  <div className="flex items-center gap-1 text-white text-[9px] font-bold">
                    <Play size={10} fill="currentColor" />
                    <span>{video.likesCount || 0}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </motion.div>
      );
    }

    if (activeTab === 'activity') {
      return (
        <motion.div
          key="activity"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-4 pb-10"
        >
          {/* Activity Filters */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide py-2">
            {[
              { id: 'all', label: t('profile.all') },
              { id: 'posts', label: t('profile.posts') },
              { id: 'comments', label: t('profile.comments') }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setActivityFilter(f.id as any)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all shrink-0",
                  activityFilter === f.id 
                    ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" 
                    : "bg-white text-text-muted border-border hover:bg-slate-50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Activity List */}
          <div className="space-y-3">
            {[
              ...userPosts.map(p => ({ ...p, activityType: 'post' })),
              ...userComments
            ]
            .filter(a => activityFilter === 'all' || (activityFilter === 'posts' ? a.activityType === 'post' : a.activityType === 'comment'))
            .sort((a, b) => {
              const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
              const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
              return dateB - dateA;
            })
            .slice(0, 15) // Limit to top 15 recent activities
            .map((activity, idx) => (
              <div key={activity.id || idx} className="bg-surface p-4 rounded-xl border border-border shadow-sm flex gap-3 group hover:border-primary/30 transition-colors">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                  activity.activityType === 'post' ? "bg-emerald-50 text-primary" : "bg-indigo-50 text-indigo-600"
                )}>
                  {activity.activityType === 'post' ? <Upload size={18} /> : <MessageSquare size={18} />}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-tighter text-text-muted">
                      {activity.activityType === 'post' ? t('profile.posts') : t('profile.comments')}
                    </p>
                    <span className="text-[9px] font-bold text-text-muted">
                      {activity.createdAt?.toDate ? new Date(activity.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                    </span>
                  </div>
                  <p className={cn(
                    "text-[13px] leading-relaxed line-clamp-2 font-medium",
                    activity.activityType === 'comment' ? "text-indigo-900" : "text-text-main"
                  )}>
                    {activity.activityType === 'post' ? activity.content : activity.text}
                  </p>
                  {activity.activityType === 'comment' && (
                    <div className="flex items-center gap-1 pt-1 opacity-70">
                      <Play size={8} className="text-indigo-600" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">On a community video</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      );
    }

    if (activeTab === 'saved') {
      return (
        <motion.div 
          key="saved"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="grid grid-cols-1 gap-3 pb-20"
        >
          {savedPosts.length === 0 ? (
            <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-border px-4">
              <Bookmark size={40} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm font-bold text-text-muted">No saved posts yet</p>
              <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest">Items you bookmark will appear here</p>
              <Link to="/" className="mt-4 block">
                <Button variant="outline" className="text-primary text-xs rounded-xl border-primary bg-emerald-50">Explore Trending</Button>
              </Link>
            </div>
          ) : (
            savedPosts.map((post) => (
              <div key={post.id} className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm p-4 hover:border-primary/20 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-200 overflow-hidden border border-border">
                    {post.authorPhoto && <img src={post.authorPhoto} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-text-main">{post.authorName}</p>
                    <p className="text-[9px] text-text-muted font-bold uppercase tracking-widest">{post.category || 'General'}</p>
                  </div>
                </div>
                <div className="text-[13px] leading-relaxed line-clamp-3 mb-4 font-medium text-text-main">
                  {post.content}
                </div>
                {post.media?.[0] && (
                  <div className="aspect-video rounded-xl overflow-hidden border border-border mb-4">
                    <img src={post.media[0] || undefined} className="w-full h-full object-cover" alt="" />
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                   <div className="flex gap-4">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-text-muted">
                      <Heart size={12} />
                      <span>{post.likesCount || 0}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-text-muted">
                      <MessageSquare size={12} />
                      <span>{post.commentsCount || 0}</span>
                    </div>
                  </div>
                  <Link to="/" className="text-[10px] font-black text-primary bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors">Original Post</Link>
                </div>
              </div>
            ))
          )}
        </motion.div>
      );
    }

    return null;
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
          <UserIcon size={40} />
        </div>
        <h2 className="text-xl font-bold">Your Profile</h2>
        <p className="text-text-muted text-sm">Sign in to view your profile, posts, and wallet.</p>
        <Button className="bg-primary hover:bg-emerald-700 text-white rounded-full px-8">Sign In</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8 relative h-full overflow-y-auto">
      {/* Header / Cover */}
      <div className="relative">
        <div className="h-32 bg-gradient-to-r from-emerald-600 to-primary" />
        <div className="px-4 -mt-12 flex justify-between items-end">
          <User 
            displayName={targetProfile?.displayName || targetId?.substring(0, 8)}
            photoURL={targetProfile?.photoURL}
            isVerified={targetProfile?.isVerified}
            size="lg"
            className="ring-4 ring-surface rounded-2xl"
          />
          <div className="flex gap-2 mb-2">
            {isOwnProfile && (targetProfile?.role === 'admin' || user?.email === 'aufiseleman58@gmail.com') && (
              <Link to="/admin">
                <Button variant="outline" size="sm" className="rounded-full h-8 text-[11px] font-bold border-primary text-primary hover:bg-emerald-50">
                  Admin Panel
                </Button>
              </Link>
            )}
            {isOwnProfile ? (
              <Button 
                onClick={() => setShowSettings(true)}
                variant="outline" 
                size="sm" 
                className="rounded-full h-8 w-8 p-0 border-border hover:bg-slate-50 transition-colors"
              >
                <Settings size={14} className="text-text-muted" />
              </Button>
            ) : (
              <Button 
                onClick={() => navigate('/messages')}
                variant="outline" 
                size="sm" 
                className="rounded-full h-8 px-4 border-primary text-primary hover:bg-emerald-50 transition-colors text-[11px] font-bold"
              >
                Message
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-end md:items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider">Settings</h3>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hide">
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Account</h4>
                <div className="bg-slate-50 rounded-2xl border border-border overflow-hidden divide-y divide-border">
                  <div 
                    onClick={() => {
                      setIsEditing(true);
                      setShowSettings(false);
                    }}
                    className="p-3 flex items-center justify-between hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                        <UserIcon size={16} />
                      </div>
                      <span className="text-xs font-medium">Edit Profile</span>
                    </div>
                    <ChevronRight size={14} className="text-text-muted" />
                  </div>
                  {!myProfile?.isVerified && (
                  <div 
                    onClick={() => {
                      setShowVerification(true);
                      setShowSettings(false);
                    }}
                    className="p-3 flex items-center justify-between hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <ShieldCheck size={16} />
                      </div>
                      <span className="text-xs font-medium">Verify Identity</span>
                    </div>
                    <ChevronRight size={14} className="text-text-muted" />
                  </div>
                  )}
                  <div className="p-3 flex items-center justify-between hover:bg-slate-100 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
                        <Shield size={16} />
                      </div>
                      <span className="text-xs font-medium">Privacy & Security</span>
                    </div>
                    <ChevronRight size={14} className="text-text-muted" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('settings.languages')}</h4>
                <div className="bg-slate-50 rounded-2xl border border-border overflow-hidden divide-y divide-border">
                  <div 
                    onClick={() => setLanguage(language === 'English' ? 'Chichewa' : 'English')}
                    className="p-3 flex items-center justify-between hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-orange-50 text-orange-600 rounded-lg flex items-center justify-center">
                        <Globe size={16} />
                      </div>
                      <span className="text-xs font-medium">{language}</span>
                    </div>
                    <span className="text-[10px] font-bold text-primary">CHANGE</span>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                        <RefreshCw size={16} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">{t('settings.dataSaver')}</span>
                        <span className="text-[9px] text-text-muted">{t('settings.dataSaverDesc')}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setDataSaver(!dataSaver)}
                      className={cn(
                        "w-8 h-4 rounded-full relative transition-colors",
                        dataSaver ? "bg-primary" : "bg-slate-200"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all",
                        dataSaver ? "right-0.5" : "left-0.5"
                      )} />
                    </button>
                  </div>
                </div>
              </div>

              <Button 
                onClick={handleLogout}
                variant="ghost" 
                className="w-full justify-start gap-3 h-12 rounded-2xl text-red-600 hover:bg-red-50 hover:text-red-700 font-bold text-xs"
              >
                <LogOut size={18} />
                {t('profile.logout')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Verification Modal */}
      {showVerification && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[230] flex items-end md:items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="p-4 border-b border-border flex items-center justify-between text-center">
              <div className="w-10" />
              <h3 className="font-bold text-sm uppercase tracking-wider">{t('profile.identityVerification')}</h3>
              <button onClick={() => setShowVerification(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-emerald-50 text-primary rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                  <ShieldCheck size={32} />
                </div>
                <h4 className="text-lg font-bold">{t('profile.getVerified')}</h4>
                <p className="text-xs text-text-muted leading-relaxed">
                  {t('profile.verifiedBadgeDesc')}
                </p>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group relative border-2 border-dashed border-border rounded-2xl p-8 hover:border-primary active:scale-[0.98] transition-all cursor-pointer bg-slate-50 flex flex-col items-center justify-center gap-3"
              >
                {idFile ? (
                   <div className="flex flex-col items-center gap-2">
                      <Check className="text-primary" size={24} />
                      <p className="text-xs font-bold text-text-main">{idFile.name}</p>
                      <p className="text-[10px] text-text-muted">Click to change</p>
                   </div>
                ) : (
                  <>
                    <Upload className="text-text-muted group-hover:text-primary transition-colors" size={32} />
                    <div className="text-center">
                      <p className="text-xs font-bold">{t('profile.uploadID')}</p>
                      <p className="text-[10px] text-text-muted">JPG, PNG (max 5MB)</p>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl flex items-start gap-3">
                <Shield className="text-indigo-600 shrink-0" size={16} />
                <p className="text-[10px] text-indigo-700 leading-relaxed font-medium">
                  {t('profile.idProcessingDesc')}
                </p>
              </div>

              <Button 
                onClick={async () => {
                  if (!idFile) {
                    toast.error("Please upload an ID photo");
                    return;
                  }
                  setVerifying(true);
                  // Simulate AI processing
                  setTimeout(async () => {
                    await verifyIdentity();
                    setVerifying(false);
                    setShowVerification(false);
                    setIdFile(null);
                  }, 2500);
                }}
                disabled={verifying || !idFile}
                className="w-full bg-primary hover:bg-emerald-700 text-white rounded-2xl h-14 font-bold shadow-lg shadow-primary/20"
              >
                {verifying ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="animate-spin" size={18} />
                    <span>{t('profile.verifying')}</span>
                  </div>
                ) : t('profile.submitVerification')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[210] flex items-end md:items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider">Edit Profile</h3>
              <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto scrollbar-hide">
              <div className="flex flex-col items-center mb-4">
                <div className="relative group">
                  <div className="w-32 h-32 rounded-3xl bg-slate-100 border-2 border-border overflow-hidden flex items-center justify-center relative shadow-inner">
                    {isCameraOpen ? (
                      <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        className="w-full h-full object-cover scale-x-[-1]" 
                      />
                    ) : editPhoto ? (
                      <img src={editPhoto} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <UserIcon size={48} className="text-slate-300" />
                    )}
                  </div>
                  
                  <div className="absolute -bottom-2 -right-2 flex gap-2">
                    {isCameraOpen ? (
                      <button 
                        onClick={capturePhoto}
                        className="bg-primary text-white p-2.5 rounded-xl shadow-lg hover:bg-emerald-700 transition-all active:scale-95"
                        title="Capture Photo"
                      >
                        <Camera size={18} />
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="bg-surface border border-border text-text-muted p-2.5 rounded-xl shadow-lg hover:bg-slate-50 transition-all active:scale-95"
                          title="Upload Photo"
                        >
                          <Upload size={18} />
                        </button>
                        <button 
                          onClick={startCamera}
                          className="bg-primary text-white p-2.5 rounded-xl shadow-lg hover:bg-emerald-700 transition-all active:scale-95"
                          title="Open Camera"
                        >
                          <Camera size={18} />
                        </button>
                      </>
                    )}
                    {isCameraOpen && (
                      <button 
                        onClick={stopCamera}
                        className="bg-red-500 text-white p-2.5 rounded-xl shadow-lg hover:bg-red-600 transition-all active:scale-95"
                        title="Close Camera"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                </div>
                {cameraError && (
                  <div className="mt-3 text-center space-y-2">
                    <p className="text-[10px] text-red-500 font-medium max-w-[200px] mx-auto">
                      {cameraError}
                    </p>
                    <p className="text-[9px] text-text-muted italic">
                      Try opening the app in a <a href={window.location.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">new tab</a> to grant camera access.
                    </p>
                  </div>
                )}
              </div>

              <canvas ref={canvasRef} className="hidden" />
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*" 
                onChange={handleFileUpload}
              />

              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-text-muted">Display Name</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Your name"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-text-muted">Bio</label>
                  <textarea 
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px] resize-none"
                    placeholder="Tell us about yourself..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-text-muted">Location</label>
                  <input 
                    type="text" 
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="e.g. Lilongwe, Malawi"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-text-muted">Profile Photo URL</label>
                  <input 
                    type="text" 
                    value={editPhoto}
                    onChange={(e) => setEditPhoto(e.target.value)}
                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)}
                  className="flex-1 rounded-xl h-12 font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="flex-1 bg-primary hover:bg-emerald-700 text-white rounded-xl h-12 font-bold text-xs"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="px-4 space-y-1">
        <h1 className="text-xl font-bold">{targetProfile?.displayName || targetProfile?.email?.split('@')[0] || 'User'}</h1>
        <p className="text-text-muted text-xs font-mono">{targetProfile?.email?.replace(/(.{3}).*@/, "$1***@")}</p>
        
        {targetProfile?.bio && (
          <p className="text-[13px] text-text-main leading-relaxed pt-2">
            {targetProfile.bio}
          </p>
        )}
        
        <div className="flex flex-wrap gap-4 pt-3">
          <div className="flex items-center gap-1.5 text-text-muted text-[11px]">
            <MapPin size={12} />
            <span>{targetProfile?.location || 'Malawi'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-text-muted text-[11px]">
            <Calendar size={12} />
            <span>{t('profile.joined')} {targetProfile?.createdAt?.toDate ? new Date(targetProfile.createdAt.toDate()).toLocaleDateString() : 'Recently'}</span>
          </div>
        </div>

        <div className="flex gap-6 py-4 border-y border-border mt-4">
          <div className="text-center">
            <p className="font-bold text-sm">{userPosts.length}</p>
            <p className="text-[10px] text-text-muted uppercase tracking-wider">{t('profile.posts')}</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-sm">1.2k</p>
            <p className="text-[10px] text-text-muted uppercase tracking-wider">{t('profile.followers')}</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-sm">450</p>
            <p className="text-[10px] text-text-muted uppercase tracking-wider">{t('profile.following')}</p>
          </div>
        </div>
      </div>

      {/* Wallet Preview - Only for own profile */}
      {isOwnProfile && (
        <div className="px-4">
          <Link to="/wallet" className="block group">
            <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-2xl relative overflow-hidden transition-all hover:scale-[1.01] active:scale-[0.99]">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full -mr-16 -mt-16 blur-3xl group-hover:bg-primary/40 transition-all duration-500" />
              
              <div className="relative z-10 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
                      <WalletIcon size={16} className="text-primary" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">{t('profile.walletBalance')}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-500 group-hover:text-white transition-colors" />
                </div>
                
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-black text-primary">MWK</span>
                  <p className="text-3xl font-black tracking-tighter">124,500</p>
                </div>

                <div className="flex gap-4 pt-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('wallet.income')}</span>
                    <span className="text-[10px] font-black text-emerald-500">+55k</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('wallet.expense')}</span>
                    <span className="text-[10px] font-black text-red-500">-12k</span>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 flex border-b border-border">
        <button 
          onClick={() => setActiveTab('posts')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors relative ${activeTab === 'posts' ? 'text-primary' : 'text-text-muted'}`}
        >
          {t('profile.posts')}
          {activeTab === 'posts' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        <button 
          onClick={() => setActiveTab('videos')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors relative ${activeTab === 'videos' ? 'text-primary' : 'text-text-muted'}`}
        >
          {t('nav.videos')}
          {activeTab === 'videos' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        <button 
          onClick={() => setActiveTab('activity')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors relative ${activeTab === 'activity' ? 'text-primary' : 'text-text-muted'}`}
        >
          {t('profile.activity')}
          {activeTab === 'activity' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        <button 
          onClick={() => setActiveTab('saved')}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors relative ${activeTab === 'saved' ? 'text-primary' : 'text-text-muted'}`}
        >
          {t('profile.saved') || 'Saved'}
          {activeTab === 'saved' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
      </div>

      {/* Content */}
      <div className="px-4 space-y-3">
        <AnimatePresence mode="wait">
          {renderContent()}
        </AnimatePresence>
      </div>
    </div>
  );
}
