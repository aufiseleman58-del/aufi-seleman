import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Image, Send, Heart, MessageSquare, Share2, Loader2, X, Globe, MapPin, Users as UsersIcon, Search, Bookmark, Filter, TrendingUp, Hash, Bell } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, limit, doc, getDoc, where, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { moderateContent, translateContent } from '../lib/gemini';
import CreatePostModal from '../components/CreatePostModal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

export default function Home() {
  const { user, signIn } = useAuth();
  const { language, t } = useSettings();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [translations, setTranslations] = useState<Record<string, { text: string; language: string }>>({});
  const [isTranslating, setIsTranslating] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      where('read', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.docs.length);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/notifications`);
    });
    return () => unsubscribe();
  }, [user]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [feedType, setFeedType] = useState<'foryou' | 'following'>('foryou');
  const [savedPosts, setSavedPosts] = useState<Record<string, boolean>>({});
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [isFollowingLoaded, setIsFollowingLoaded] = useState(false);

  const categories = ['All', 'General', 'News', 'Agriculture', 'Business', 'Tech', 'Health', 'Jobs'];

  useEffect(() => {
    if (!user) {
      setFollowingIds([]);
      setIsFollowingLoaded(true);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, 'users', user.uid, 'following'), (snapshot) => {
      const ids = snapshot.docs.map(doc => doc.id);
      setFollowingIds(ids);
      setIsFollowingLoaded(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/following`);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (feedType === 'following' && !isFollowingLoaded) return;

    let q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
    
    if (feedType === 'following') {
      if (followingIds.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }
      // Firestore 'in' limit is 30. For simplicity in this applet, we'll cap it at 30 for now
      const limitedFollowing = followingIds.slice(0, 30);
      q = query(
        collection(db, 'posts'),
        where('authorId', 'in', limitedFollowing),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    } else if (selectedCategory !== 'All') {
      q = query(
        collection(db, 'posts'), 
        where('category', '==', selectedCategory),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
    }
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const postsData = await Promise.all(snapshot.docs.map(async (pDoc) => {
        const data = pDoc.data();
        let authorVerified = false;
        try {
          const userDoc = await getDoc(doc(db, 'users', data.authorId));
          if (userDoc.exists()) {
            authorVerified = userDoc.data().isVerified || false;
          }
        } catch (e) {
          console.error("Error fetching author status:", e);
        }
        return { ...data, id: pDoc.id, authorVerified };
      }));
      setPosts(postsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posts');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [selectedCategory, feedType, followingIds, isFollowingLoaded]);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, 'users', user.uid, 'savedPosts'), (snapshot) => {
      const saved: Record<string, boolean> = {};
      snapshot.docs.forEach(doc => {
        saved[doc.id] = true;
      });
      setSavedPosts(saved);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/savedPosts`);
    });
    return () => unsubscribe();
  }, [user]);

  const toggleSavePost = async (postId: string) => {
    if (!user) {
      toast.error('Please sign in to save posts');
      return;
    }
    const saveRef = doc(db, 'users', user.uid, 'savedPosts', postId);
    if (savedPosts[postId]) {
      await deleteDoc(saveRef);
      toast.success('Removed from saved');
    } else {
      await setDoc(saveRef, { savedAt: serverTimestamp() });
      toast.success('Post saved!');
    }
  };

  const toggleFollow = async (targetUserId: string, targetUserName: string, targetUserPhoto?: string) => {
    if (!user) {
      toast.error('Please sign in to follow users');
      return;
    }
    if (targetUserId === user.uid) return;

    const isFollowing = followingIds.includes(targetUserId);
    const followingRef = doc(db, 'users', user.uid, 'following', targetUserId);
    const followersRef = doc(db, 'targetUserId', 'followers', user.uid); // This path was wrong in my head, let's use the correct one
    
    // Correct paths based on blueprint
    const myFollowingRef = doc(db, 'users', user.uid, 'following', targetUserId);
    const theirFollowersRef = doc(db, 'users', targetUserId, 'followers', user.uid);

    try {
      if (isFollowing) {
        await deleteDoc(myFollowingRef);
        await deleteDoc(theirFollowersRef);
        toast.success(`Unfollowed ${targetUserName}`);
      } else {
        await setDoc(myFollowingRef, { followedAt: serverTimestamp() });
        await setDoc(theirFollowersRef, { followedAt: serverTimestamp() });
        
        // Add notification for the user being followed
        await addDoc(collection(db, 'users', targetUserId, 'notifications'), {
          type: 'follow',
          fromId: user.uid,
          fromName: user.displayName || 'Anonymous',
          fromPhoto: user.photoURL || '',
          message: `started following you`,
          read: false,
          createdAt: serverTimestamp(),
          link: `/profile/${user.uid}`
        });

        toast.success(`Following ${targetUserName}`);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'following');
    }
  };

  const filteredPosts = posts.filter(post => 
    post.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.authorName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTranslate = async (postId: string, content: string) => {
    if (translations[postId]) {
      // Toggle off if already translated
      const newTranslations = { ...translations };
      delete newTranslations[postId];
      setTranslations(newTranslations);
      return;
    }

    setIsTranslating(postId);
    try {
      const targetLang = language === 'English' ? 'English' : 'Chichewa';
      const translated = await translateContent(content, targetLang);
      setTranslations(prev => ({
        ...prev,
        [postId]: { text: translated, language: targetLang }
      }));
    } catch (error) {
      toast.error('Translation failed');
    } finally {
      setIsTranslating(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Categories and Filters */}
      <div className="bg-surface border-b border-border sticky top-0 z-40 px-4 pb-2 shrink-0 shadow-sm">
        <div className="flex items-center gap-3 mb-4 mt-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search posts, people, news..."
              className="w-full bg-slate-100 border-none rounded-2xl pl-10 pr-4 h-11 text-sm focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-6 border-b border-border/50 mb-3">
          <button 
            onClick={() => setFeedType('foryou')}
            className={cn(
              "pb-2 text-sm font-bold transition-all relative",
              feedType === 'foryou' ? "text-primary" : "text-text-muted"
            )}
          >
            For You
            {feedType === 'foryou' && <motion.div layoutId="feedTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
          <button 
            onClick={() => setFeedType('following')}
            className={cn(
              "pb-2 text-sm font-bold transition-all relative",
              feedType === 'following' ? "text-primary" : "text-text-muted"
            )}
          >
            Following
            {feedType === 'following' && <motion.div layoutId="feedTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
          </button>
        </div>

        {/* Categories Scroller */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-4 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border shrink-0",
                selectedCategory === cat 
                  ? "bg-primary text-white border-primary shadow-md shadow-primary/20" 
                  : "bg-white text-text-muted border-border hover:bg-slate-50"
              )}
            >
              {cat === 'Agriculture' ? '🌽 Agriculture' : 
               cat === 'News' ? '🗞️ News' :
               cat === 'Business' ? '💼 Business' :
               cat === 'Tech' ? '💻 Tech' :
               cat === 'Health' ? '🏥 Health' :
               cat === 'Jobs' ? '📢 Jobs' : cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-24">
        {/* Quick Post Trigger */}
        <div className="bg-white p-4 rounded-2xl border border-border flex gap-4 shadow-sm items-center active:scale-[0.98] transition-all cursor-pointer group" onClick={() => setShowCreateModal(true)}>
          <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-primary font-black text-xl overflow-hidden shrink-0 border border-border/50 shadow-inner">
            {user?.photoURL ? <img src={user.photoURL} alt="Me" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : 'Z'}
          </div>
          <div className="flex-1 text-text-muted text-sm font-medium">
            Share an update with your community...
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
            <Image size={20} />
          </div>
        </div>

        {/* Create Post Modal */}
        <CreatePostModal 
          isOpen={showCreateModal} 
          onClose={() => setShowCreateModal(false)} 
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-primary/20 flex items-center justify-center">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted animate-pulse">Gathering voices...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-border/60 p-10">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-200">
              {feedType === 'following' ? <UsersIcon size={40} /> : <Search size={40} />}
            </div>
            <h3 className="font-bold text-xl tracking-tight mb-2">
              {feedType === 'following' ? "You're not following anyone yet" : "No results found"}
            </h3>
            <p className="text-text-muted text-sm max-w-[240px] mx-auto leading-relaxed">
              {feedType === 'following' 
                ? "Start following people to see their updates right here in your feed." 
                : "Try adjusting your filters or checking your spelling to find what you're looking for."}
            </p>
            {feedType === 'following' && (
              <button 
                onClick={() => setFeedType('foryou')}
                className="mt-6 px-6 py-2 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-all"
              >
                Discover People
              </button>
            )}
          </div>
        ) : (
          filteredPosts.map((post) => (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={post.id} 
              className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm p-4 relative"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-200 flex items-center justify-center text-primary font-black overflow-hidden shrink-0 border border-border shadow-sm">
                    {post.authorPhoto ? <img src={post.authorPhoto} alt={post.authorName} referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : post.authorName?.[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-sm tracking-tight">{post.authorName}</h3>
                      {post.authorVerified && <ShieldCheck size={14} className="text-primary fill-current" />}
                      {user && post.authorId !== user.uid && (
                        <button 
                          onClick={() => toggleFollow(post.authorId, post.authorName, post.authorPhoto)}
                          className={cn(
                            "ml-2 text-[10px] font-black px-2 py-0.5 rounded-lg transition-all",
                            followingIds.includes(post.authorId) 
                              ? "bg-slate-100 text-text-muted" 
                              : "bg-primary text-white shadow-sm shadow-primary/20"
                          )}
                        >
                          {followingIds.includes(post.authorId) ? 'Following' : 'Follow'}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                       <p className="text-[10px] font-bold text-text-muted opacity-60">
                        {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                      </p>
                      {post.category && (
                        <span className="text-[8px] font-black uppercase tracking-widest text-primary bg-emerald-50 px-1.5 py-0.5 rounded-md border border-primary/10">
                          {post.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-[14px] leading-relaxed whitespace-pre-wrap mb-4 font-medium text-text-main">
                {translations[post.id] ? (
                  <div className="space-y-3">
                    <p className="text-text-muted italic opacity-60 text-[13px]">{post.content}</p>
                    <div className="p-3 bg-emerald-50/50 rounded-xl border-l-4 border-primary">
                      <p className="text-text-main font-semibold leading-relaxed">{translations[post.id].text}</p>
                    </div>
                  </div>
                ) : (
                  post.content
                )}
              </div>

              {post.mentions && post.mentions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {post.mentions.map((m: string, i: number) => (
                    <span key={i} className="text-[11px] text-primary font-black px-2 py-0.5 bg-emerald-50 rounded-lg hover:underline cursor-pointer">@{m}</span>
                  ))}
                </div>
              )}
              
              <div className="flex items-center gap-2 mb-4">
                <button 
                  onClick={() => handleTranslate(post.id, post.content)}
                  disabled={isTranslating === post.id}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-primary bg-slate-50 px-3 py-1.5 rounded-full border border-border/50 hover:bg-emerald-50 transition-all disabled:opacity-50"
                >
                  <Globe size={12} className={cn(isTranslating === post.id && "animate-spin")} />
                  {isTranslating === post.id ? 'Translating...' : translations[post.id] ? 'Show Original' : `Translate to ${language === 'English' ? 'Chichewa' : 'English'}`}
                </button>
                
                {post.location && (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-text-muted bg-slate-50 px-3 py-1.5 rounded-full border border-border/50 uppercase tracking-wide">
                    <MapPin size={10} />
                    {post.location}
                  </div>
                )}
              </div>

              {post.media?.[0] && (
                <div className="rounded-2xl overflow-hidden border border-border shadow-xl mb-4 bg-slate-100">
                  <img 
                    src={post.media[0] || undefined} 
                    alt="Post content" 
                    className="w-full aspect-[4/3] object-cover hover:scale-105 transition-transform duration-700"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              
              <div className="flex items-center justify-between pt-4 border-t border-border mt-2">
                <div className="flex items-center gap-6">
                  <button className="flex items-center gap-2 text-text-muted hover:text-red-500 transition-all group">
                    <div className="p-2 rounded-xl group-hover:bg-red-50 transition-all">
                      <Heart size={18} />
                    </div>
                    <span className="text-[12px] font-black">{post.likesCount || 0}</span>
                  </button>
                  <button className="flex items-center gap-2 text-text-muted hover:text-primary transition-all group">
                    <div className="p-2 rounded-xl group-hover:bg-emerald-50 transition-all">
                      <MessageSquare size={18} />
                    </div>
                    <span className="text-[12px] font-black">{post.commentsCount || 0}</span>
                  </button>
                  <button 
                    onClick={() => toggleSavePost(post.id)}
                    className={cn(
                      "flex items-center gap-2 transition-all group",
                      savedPosts[post.id] ? "text-primary" : "text-text-muted hover:text-primary"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-xl transition-all",
                      savedPosts[post.id] ? "bg-emerald-50" : "group-hover:bg-emerald-50"
                    )}>
                      <Bookmark size={18} className={cn(savedPosts[post.id] && "fill-current")} />
                    </div>
                  </button>
                </div>
                <button className="p-2 text-text-muted hover:text-primary transition-all hover:bg-emerald-50 rounded-xl group">
                  <Share2 size={18} />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
