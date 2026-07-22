import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Image, Send, Heart, MessageSquare, Share2, Loader2, X, Plus, Globe, MapPin, Users as UsersIcon, Search, Bookmark, Filter, TrendingUp, Hash, Bell, Repeat, Edit, Trash2, MessageCircle, ChevronLeft, ChevronRight, Zap } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, limit, doc, getDoc, where, setDoc, deleteDoc, updateDoc, increment } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { moderateContent, translateContent, rankContent } from '../lib/gemini';
import { trackInteraction } from '../lib/tracking';
import CreatePostModal from '../components/CreatePostModal';
import EditPostModal from '../components/EditPostModal';
import PostCommentsModal from '../components/PostCommentsModal';
import PostDetailModal from '../components/PostDetailModal';
import PostCard from '../components/PostCard';
import OnlineUsers from '../components/OnlineUsers';
import AdPlacement from '../components/AdPlacement';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

export default function Home() {
  const { user, profile, signIn } = useAuth();
  const { language, t } = useSettings();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPost, setEditingPost] = useState<any>(null);
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
      handleFirestoreError(error, OperationType.LIST, `users/${user?.uid}/notifications`);
    });
    return () => unsubscribe();
  }, [user]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [feedType, setFeedType] = useState<'foryou' | 'following'>('foryou');
  const [savedPosts, setSavedPosts] = useState<Record<string, boolean>>({});
  const [likedPosts, setLikedPosts] = useState<Record<string, boolean>>({});
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [selectedPostForDetail, setSelectedPostForDetail] = useState<any>(null);
  const [showCommentsFor, setShowCommentsFor] = useState<string | null>(null);
  const [isFollowingLoaded, setIsFollowingLoaded] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
      handleFirestoreError(error, OperationType.LIST, `users/${user?.uid}/following`);
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
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map((pDoc) => {
        const data = pDoc.data();
        return { 
          ...data, 
          id: pDoc.id, 
          authorVerified: data.authorVerified || false 
        } as any;
      });
      
      setPosts(postsData);
      setLoading(false);

      // AI Personalization Ranking
      if (feedType === 'foryou' && user && postsData.length > 5) {
        const personalizeFeed = async () => {
          try {
            // Get user's recent interactions for context
            const userMetadata = {
              uid: user.uid,
              displayName: profile?.displayName,
              followingCount: followingIds.length,
              // We could fetch more history here if needed
            };
            
            const { rankedIds } = await rankContent(userMetadata, postsData.slice(0, 20));
            if (rankedIds && rankedIds.length > 0) {
              const rankedPosts = [...postsData].sort((a, b) => {
                const aIndex = rankedIds.indexOf(a.id);
                const bIndex = rankedIds.indexOf(b.id);
                if (aIndex === -1 && bIndex === -1) return 0;
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
              });
              setPosts(rankedPosts);
            }
          } catch (error) {
            console.warn("AI Personalization info: standard feed loaded", error);
          }
        };
        personalizeFeed();
      }
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
      handleFirestoreError(error, OperationType.LIST, `users/${user?.uid}/savedPosts`);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'postLikes'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liked: Record<string, boolean> = {};
      snapshot.docs.forEach(doc => {
        liked[doc.data().postId] = true;
      });
      setLikedPosts(liked);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'postLikes');
    });
    return () => unsubscribe();
  }, [user]);

  const toggleLike = async (postId: string) => {
    if (!user) {
      signIn();
      return;
    }

    const isLiked = likedPosts[postId];
    const likeId = `${user.uid}_${postId}`;

    try {
      if (isLiked) {
        await deleteDoc(doc(db, 'postLikes', likeId));
        await updateDoc(doc(db, 'posts', postId), {
          likesCount: increment(-1)
        });
      } else {
        await setDoc(doc(db, 'postLikes', likeId), {
          postId,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
        await updateDoc(doc(db, 'posts', postId), {
          likesCount: increment(1)
        });
        trackInteraction(user.uid, postId, 'post', 'like');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'postLikes');
    }
  };

  const toggleSavePost = async (postId: string) => {
    if (!user) {
      signIn();
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
      signIn();
      return;
    }
    if (targetUserId === user.uid) return;

    const isFollowing = followingIds.includes(targetUserId);
    
    // Correct paths based on blueprint
    const myFollowingRef = doc(db, 'users', user.uid, 'following', targetUserId);
    const theirFollowersRef = doc(db, 'users', targetUserId, 'followers', user.uid);

    try {
      if (isFollowing) {
        await deleteDoc(myFollowingRef);
        await deleteDoc(theirFollowersRef);
        
        // Update counts
        await updateDoc(doc(db, 'users', user.uid), { followingCount: increment(-1) });
        await updateDoc(doc(db, 'users', targetUserId), { followersCount: increment(-1) });
        
        toast.success(`Unfollowed ${targetUserName}`);
      } else {
        await setDoc(myFollowingRef, { followedAt: serverTimestamp() });
        await setDoc(theirFollowersRef, { followedAt: serverTimestamp() });
        
        // Update counts
        await updateDoc(doc(db, 'users', user.uid), { followingCount: increment(1) });
        await updateDoc(doc(db, 'users', targetUserId), { followersCount: increment(1) });
        
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

  const handleRepost = async (post: any) => {
    if (!user) {
      signIn();
      return;
    }

    try {
      // Create the repost
      await addDoc(collection(db, 'posts'), {
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName || 'Anonymous',
        authorPhoto: profile?.photoURL || user.photoURL || '',
        authorVerified: profile?.isVerified || false,
        content: ``, // Caption-less repost for now, like a retweet
        isRepost: true,
        originalPostId: post.id,
        originalAuthorId: post.authorId,
        originalAuthorName: post.authorName,
        originalAuthorPhoto: post.authorPhoto,
        originalAuthorVerified: post.authorVerified || false,
        originalContent: post.content,
        createdAt: serverTimestamp(),
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        category: post.category || 'General'
      });

      // Increment original post's share count
      await updateDoc(doc(db, 'posts', post.id), {
        sharesCount: increment(1)
      });

      // Notify the original author
      if (post.authorId !== user.uid) {
        await addDoc(collection(db, 'users', post.authorId, 'notifications'), {
          type: 'mention', // Using mention as a proxy for "shared your post"
          fromId: user.uid,
          fromName: user.displayName || 'Anonymous',
          fromPhoto: user.photoURL || '',
          message: `shared your post`,
          read: false,
          createdAt: serverTimestamp(),
          link: `/profile/${user.uid}`
        });
      }

      toast.success('Post shared with your followers!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'posts');
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (window.confirm('Are you sure you want to delete this post?')) {
      try {
        await deleteDoc(doc(db, 'posts', postId));
        toast.success('Post deleted');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'posts');
      }
    }
  };

  const handleExternalShare = async (post: any) => {
    const shareData = {
      title: `Zathu Post by ${post.authorName}`,
      text: post.content,
      url: window.location.origin + `/profile/${post.authorId}` // Link to author for now or specific post page if implemented
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err: any) {
        // Silently ignore cancellation errors, as they are expected user actions
        if (err.name !== 'AbortError' && err.message !== 'Share canceled') {
          console.error('Share failed:', err);
          // Fallback to clipboard if it's an actual unexpected error
          try {
            await navigator.clipboard.writeText(shareData.url);
            toast.success('Link copied to clipboard!');
          } catch (clipErr) {
            toast.error('Failed to share');
          }
        }
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(shareData.url);
        toast.success('Link copied to clipboard!');
      } catch (err) {
        toast.error('Failed to share');
      }
    }
  };

  return (
    <div className="flex flex-col bg-slate-50">
      {/* Categories and Filters Header */}
      <div className="bg-surface border-b border-border px-2.5 py-1.5 shrink-0 shadow-sm space-y-1.5">
        {/* Unified Feed Switch & Compact Search */}
        <div className="flex items-center gap-1.5">
          {/* Segmented Feed Switcher */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 border border-border/50 shrink-0">
            <button
              onClick={() => setFeedType('foryou')}
              className={cn(
                "px-2 py-0.5 text-[9px] font-extrabold rounded-md uppercase tracking-wider transition-all",
                feedType === 'foryou' ? "bg-white text-primary shadow-sm" : "text-text-muted hover:text-text-main"
              )}
            >
              For You
            </button>
            <button
              onClick={() => setFeedType('following')}
              className={cn(
                "px-2 py-0.5 text-[9px] font-extrabold rounded-md uppercase tracking-wider transition-all",
                feedType === 'following' ? "bg-white text-primary shadow-sm" : "text-text-muted hover:text-text-main"
              )}
            >
              Following
            </button>
          </div>

          {/* Compact Search */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" size={11} />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search posts..."
              className="w-full bg-slate-100 border-none rounded-lg pl-7 pr-2.5 h-7 text-[10px] focus:ring-2 focus:ring-primary/10 transition-all placeholder:text-[9px]"
            />
          </div>
        </div>

        {/* Horizontal Scrollable Categories */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide py-0.5 items-center">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider whitespace-nowrap transition-all border shrink-0",
                selectedCategory === cat 
                  ? "bg-primary text-white border-primary shadow-sm" 
                  : "bg-white text-text-muted border-border hover:bg-slate-50"
              )}
            >
              {cat === 'All' ? '🌐 All' :
               cat === 'General' ? '💬 General' :
               cat === 'Agriculture' ? '🌽 Agriculture' : 
               cat === 'News' ? '🗞️ News' :
               cat === 'Business' ? '💼 Business' :
               cat === 'Tech' ? '💻 Tech' :
               cat === 'Health' ? '🏥 Health' :
               cat === 'Jobs' ? '📢 Jobs' : cat}
            </button>
          ))}
        </div>

        {/* Lofted Up: Compact Online Users in Sticky Header */}
        {user && (
          <div className="border-t border-theme-border/20 pt-0.5 mt-0.5 shrink-0">
            <OnlineUsers compact={true} />
          </div>
        )}
      </div>

      {!isOnline && (
        <div className="bg-amber-100 dark:bg-amber-900/30 p-2 text-center border-b border-amber-200 dark:border-amber-900/50 flex items-center justify-center gap-2">
          <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-900 dark:text-amber-400">Offline Mode • limited sync</span>
        </div>
      )}

      <div className="p-3 space-y-3 pb-8 text-left">
        {/* Boosted Content Scroller (The Scrolling System) */}
        {posts.some(p => p.isPromoted) && (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                <TrendingUp size={14} className="animate-pulse" />
                Featured Boosts
              </h2>
              <div className="flex gap-2">
                 <button 
                   onClick={() => {
                     const el = document.getElementById('boost-scroller-home');
                     if (el) el.scrollBy({ left: -200, behavior: 'smooth' });
                   }}
                   className="p-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
                 >
                    <ChevronLeft size={14} />
                 </button>
                 <button 
                    onClick={() => {
                      const el = document.getElementById('boost-scroller-home');
                      if (el) el.scrollBy({ left: 200, behavior: 'smooth' });
                    }}
                    className="p-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
                 >
                    <ChevronRight size={14} />
                 </button>
              </div>
            </div>
            
            <div 
              id="boost-scroller-home"
              className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 px-1 -mx-1 snap-x scroll-pl-4"
            >
              {posts.filter(p => p.isPromoted).map((post, index) => (
                <motion.div 
                  key={`boost-${post.id}-${index}`}
                  whileHover={{ y: -2, scale: 1.01 }}
                  onClick={() => setSelectedPostForDetail(post)}
                  className="shrink-0 w-60 bg-white rounded-3xl border border-primary/10 shadow-lg shadow-primary/5 snap-start relative group cursor-pointer overflow-hidden flex flex-col"
                >
                  {/* Media Thumbnail background - Adjusted size */}
                  {post.media?.[0] ? (
                    <div className="h-24 w-full relative overflow-hidden">
                       <img src={post.media[0]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
                       <div className="absolute inset-0 bg-gradient-to-t from-white via-white/40 to-transparent" />
                    </div>
                  ) : (
                    <div className="h-4 w-full bg-gradient-to-br from-primary/10 to-indigo-50" />
                  )}

                  <div className="px-4 pb-4 pt-1 relative flex-1 flex flex-col">
                    <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Zap size={40} className="text-primary" />
                    </div>
                    
                    <div className="flex items-center justify-between mb-3 relative z-10">
                      <div className="flex items-center gap-1.5">
                        <div className="w-7 h-7 rounded-xl bg-white p-0.5 shadow-sm border border-border overflow-hidden">
                          <img src={post.authorPhoto} alt="" className="w-full h-full object-cover rounded-[0.5rem]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-slate-900 truncate">@{post.authorName}</p>
                          <div className="flex items-center gap-1">
                             <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                             <p className="text-[7px] text-primary font-black uppercase tracking-widest">Verified Boost</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-emerald-50 text-primary text-[7px] font-black px-1.5 py-0.5 rounded-md border border-primary/20 shadow-sm shadow-primary/5 uppercase tracking-widest">
                         Promoted
                      </div>
                    </div>

                    <p className="text-[11px] font-medium text-slate-700 line-clamp-2 leading-relaxed mb-4 relative z-10 italic">
                      "{post.content}"
                    </p>

                    <div className="mt-auto flex items-center justify-between pt-3 border-t border-slate-100 relative z-10">
                       <div className="flex items-center gap-2">
                         <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold">
                            <Heart size={12} className="text-red-500 fill-red-500" />
                            <span>{post.likesCount}</span>
                         </div>
                         <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold">
                            <MessageSquare size={12} className="text-primary" />
                            <span>{post.commentsCount || 0}</span>
                         </div>
                       </div>
                       <Button size="sm" className="h-6 text-[8px] rounded-full px-3 bg-primary/10 text-primary hover:bg-primary hover:text-white transition-all font-black uppercase tracking-widest border-none">
                          View
                       </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Post Trigger */}
        <div className="bg-white p-4 rounded-2xl border border-border flex gap-4 shadow-sm items-center active:scale-[0.98] transition-all cursor-pointer group" onClick={() => user ? setShowCreateModal(true) : signIn()}>
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

        {/* Edit Post Modal */}
        <EditPostModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingPost(null);
          }}
          post={editingPost}
        />

        {/* Comments Modal */}
        <PostCommentsModal 
          isOpen={!!showCommentsFor}
          onClose={() => setShowCommentsFor(null)}
          postId={showCommentsFor || ''}
        />

        {/* Full Post Detail Modal */}
        <PostDetailModal
          isOpen={!!selectedPostForDetail}
          onClose={() => setSelectedPostForDetail(null)}
          post={selectedPostForDetail}
          liked={selectedPostForDetail ? !!likedPosts[selectedPostForDetail.id] : false}
          saved={selectedPostForDetail ? !!savedPosts[selectedPostForDetail.id] : false}
          following={selectedPostForDetail ? followingIds.includes(selectedPostForDetail.authorId) : false}
          onLike={toggleLike}
          onSave={toggleSavePost}
          onFollow={toggleFollow}
          onRepost={handleRepost}
          onDelete={handleDeletePost}
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
          <div className="space-y-4">
            <AdPlacement placement="feed" />
            {filteredPosts.map((post, index) => (
              <React.Fragment key={`${post.id}-${index}`}>
                <PostCard
                  post={post}
                  user={user}
                  liked={!!likedPosts[post.id]}
                  saved={!!savedPosts[post.id]}
                  following={followingIds.includes(post.authorId)}
                  translation={translations[post.id]}
                  isTranslating={isTranslating === post.id}
                  language={language}
                  onLike={toggleLike}
                  onSave={toggleSavePost}
                  onFollow={toggleFollow}
                  onTranslate={handleTranslate}
                  onRepost={handleRepost}
                  onExternalShare={handleExternalShare}
                  onDelete={handleDeletePost}
                  onEdit={(p) => {
                    setEditingPost(p);
                    setShowEditModal(true);
                  }}
                  onMessage={(authorId) => navigate(`/messages?chatWith=${authorId}`)}
                  onComment={(postId) => setShowCommentsFor(postId)}
                  onClick={() => setSelectedPostForDetail(post)}
                />
                {(index + 1) % 5 === 0 && <AdPlacement key={`ad-${post.id}-${index}`} placement="feed" />}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
