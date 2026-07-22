import React, { useState, useEffect } from 'react';
import { X, Heart, MessageSquare, Repeat, Share2, ShieldCheck, Loader2, Globe, MapPin, Bookmark, Send, Trash2, Eye, BarChart2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { translateContent } from '../lib/gemini';

interface PostDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: any;
  liked: boolean;
  saved: boolean;
  following: boolean;
  onLike: (postId: string) => void;
  onSave: (postId: string) => void;
  onFollow: (userId: string, userName: string, userPhoto?: string) => void;
  onRepost: (post: any) => void;
  onDelete?: (postId: string) => void;
}

export default function PostDetailModal({ 
  isOpen, 
  onClose, 
  post, 
  liked, 
  saved, 
  following,
  onLike,
  onSave,
  onFollow,
  onRepost,
  onDelete
}: PostDetailModalProps) {
  const { user, profile } = useAuth();
  const { language, t } = useSettings();
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [translation, setTranslation] = useState<{ text: string; language: string } | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [activeView, setActiveView] = useState<'content' | 'analytics'>('content');

  useEffect(() => {
    if (!isOpen || !post?.id) return;

    // Track View
    const trackView = async () => {
      try {
        await updateDoc(doc(db, 'posts', post.id), {
          viewsCount: increment(1)
        });
      } catch (err) {
        console.error("Failed to track view");
      }
    };
    trackView();

    const q = query(
      collection(db, 'postComments'),
      where('postId', '==', post.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setComments(data);
      setLoadingComments(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'postComments');
      setLoadingComments(false);
    });

    return () => unsubscribe();
  }, [isOpen, post?.id]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || submitting || !post) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'postComments'), {
        postId: post.id,
        userId: user.uid,
        userName: profile?.displayName || user.displayName || 'User',
        userPhoto: profile?.photoURL || user.photoURL || '',
        userVerified: profile?.isVerified || false,
        text: newComment.trim(),
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'posts', post.id), {
        commentsCount: increment(1)
      });

      setNewComment('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'postComments');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTranslate = async () => {
    if (translation) {
      setTranslation(null);
      return;
    }

    setIsTranslating(true);
    try {
      const targetLang = language === 'English' ? 'English' : 'Chichewa';
      const translated = await translateContent(post.content, targetLang);
      setTranslation({ text: translated, language: targetLang });
    } catch (error) {
      toast.error('Translation failed');
    } finally {
      setIsTranslating(false);
    }
  };

  if (!post) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-end md:items-center justify-center p-0 md:p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="bg-surface w-full max-w-4xl h-full md:h-auto md:max-h-[90vh] md:rounded-[40px] overflow-hidden shadow-2xl relative z-10 flex flex-col md:flex-row"
          >
            {/* Media Section (Left or Top) */}
            <div className="w-full md:w-[60%] bg-black relative flex items-center justify-center min-h-[300px] md:min-h-0 overflow-hidden">
               {post.media?.[0] ? (
                 <>
                  {post.media[0].includes('.mp4') || post.media[0].includes('.webm') || post.media[0].includes('video') ? (
                    <video 
                      src={post.media[0]} 
                      controls 
                      className="w-full h-full object-contain"
                      playsInline
                    />
                  ) : post.media[0].includes('.weba') || post.media[0].includes('audio') ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-900 p-12">
                      <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-8 border-4 border-primary/40 animate-pulse">
                        <MessageSquare size={48} className="text-primary" />
                      </div>
                      <audio 
                        src={post.media[0]} 
                        controls 
                        className="w-full max-w-sm"
                      />
                    </div>
                  ) : (
                    <img 
                      src={post.media[0]} 
                      alt="Post content" 
                      className="w-full h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  )}
                 </>
               ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 p-12 text-center space-y-4">
                    <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center text-slate-700">
                      <Globe size={40} />
                    </div>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">No Media Attached</p>
                 </div>
               )}

               <button 
                onClick={onClose}
                className="absolute top-6 left-6 p-2.5 bg-black/40 hover:bg-black/60 rounded-full text-white backdrop-blur-md md:hidden shadow-xl"
               >
                 <X size={20} />
               </button>
            </div>

            {/* Content & Comments Section (Right or Bottom) */}
            <div className="flex-1 flex flex-col bg-surface border-l border-border h-full overflow-hidden">
              {/* Header */}
              <div className="p-4 md:p-6 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-primary font-black overflow-hidden shrink-0 border border-border shadow-sm">
                    {post.authorPhoto ? <img src={post.authorPhoto} alt={post.authorName} referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : post.authorName?.[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-sm tracking-tight">{post.authorName}</h3>
                      {post.authorVerified && <ShieldCheck size={14} className="text-primary fill-current" />}
                    </div>
                    <p className="text-[10px] font-bold text-text-muted opacity-60">
                      {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleDateString() : 'Just now'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   {user && post.authorId !== user.uid && (
                    <Button 
                      onClick={() => onFollow(post.authorId, post.authorName, post.authorPhoto)}
                      variant={following ? "outline" : "default"}
                      size="sm"
                      className="h-8 rounded-xl text-[10px] font-black uppercase tracking-widest"
                    >
                      {following ? 'Following' : 'Follow'}
                    </Button>
                  )}
                  <Button 
                    onClick={async () => {
                       try {
                          await updateDoc(doc(db, 'posts', post.id), {
                             isFlagged: true,
                             flaggedAt: serverTimestamp(),
                             flaggedBy: user?.uid
                          });
                          toast.success("Post reported for review");
                       } catch (err) {
                          toast.error("Failed to report post");
                       }
                    }}
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl group/report"
                    title="Report Post"
                  >
                     <ShieldAlert size={14} className="group-hover/report:scale-110 transition-transform" />
                  </Button>
                  <button 
                    onClick={onClose}
                    className="p-2 hover:bg-slate-100 rounded-full text-text-muted hidden md:flex transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto scrollbar-hide">
                {/* Post Body */}
                <div className="p-6 space-y-6">
                  <div className="space-y-4">
                    <p className="text-[15px] leading-relaxed font-medium text-text-main whitespace-pre-wrap">
                      {translation ? translation.text : post.content}
                    </p>
                    
                    {post.mentions && post.mentions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {post.mentions.map((m: string, i: number) => (
                          <span key={`post-detail-mention-${m}-${i}`} className="text-[11px] text-primary font-black px-2 py-0.5 bg-emerald-50 rounded-lg hover:underline cursor-pointer">@{m}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={handleTranslate}
                      disabled={isTranslating}
                      className="flex items-center gap-1.5 text-[10px] font-black text-primary bg-emerald-50 px-3 py-2 rounded-xl border border-primary/10 hover:bg-emerald-100 transition-all disabled:opacity-50 uppercase tracking-widest"
                    >
                      <Globe size={12} className={cn(isTranslating && "animate-spin")} />
                      {isTranslating ? 'Processing...' : translation ? 'Original' : 'Translate'}
                    </button>
                    
                    {post.location && (
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-text-muted bg-slate-50 px-3 py-2 rounded-xl border border-border/50 uppercase tracking-widest">
                        <MapPin size={12} />
                        {post.location}
                      </div>
                    )}
                  </div>

                  {/* Post Interaction Stats */}
                  <div className="flex items-center gap-6 py-4 border-y border-border">
                    <button 
                      onClick={() => onLike(post.id)}
                      className={cn(
                        "flex items-center gap-2 transition-all",
                        liked ? "text-red-500 scale-110" : "text-text-muted hover:text-red-500"
                      )}
                    >
                      <Heart size={20} className={liked ? "fill-current" : ""} />
                      <span className="text-xs font-black">{post.likesCount || 0}</span>
                    </button>
                    <div className="flex items-center gap-2 text-text-muted">
                      <MessageSquare size={20} />
                      <span className="text-xs font-black">{post.commentsCount || 0}</span>
                    </div>
                    <button 
                      onClick={() => onRepost(post)}
                      className="flex items-center gap-2 text-text-muted hover:text-emerald-500 transition-all"
                    >
                      <Repeat size={20} />
                      <span className="text-xs font-black">{post.sharesCount || 0}</span>
                    </button>
                    <button 
                      onClick={() => onSave(post.id)}
                      className={cn(
                        "ml-auto flex items-center gap-2 transition-all",
                        saved ? "text-primary" : "text-text-muted hover:text-primary"
                      )}
                    >
                      <Bookmark size={20} className={saved ? "fill-current" : ""} />
                    </button>
                  </div>
                </div>

                  {/* Analytics Section Toggle */}
                  <div className="flex gap-2 px-6 pt-2">
                    <button 
                      onClick={() => setActiveView('content')}
                      className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all border",
                        activeView === 'content' ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-400 border-slate-200"
                      )}
                    >
                      Conversations
                    </button>
                    <button 
                      onClick={() => setActiveView('analytics')}
                      className={cn(
                        "text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all border",
                        activeView === 'analytics' ? "bg-primary text-white border-primary" : "bg-white text-slate-400 border-slate-200"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <BarChart2 size={12} />
                        Analytics
                      </div>
                    </button>
                  </div>

                  {activeView === 'content' ? (
                    <div className="p-6 space-y-6">
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
                        <MessageSquare size={14} />
                        Conversations ({comments.length})
                      </h4>

                      <div className="space-y-6">
                        {loadingComments ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 className="animate-spin text-primary" size={24} />
                            <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Loading thoughts...</p>
                          </div>
                        ) : comments.length === 0 ? (
                            <div className="text-center py-12 space-y-4">
                              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto border border-dashed border-border">
                                <MessageSquare size={24} className="text-slate-200" />
                              </div>
                              <div>
                                <p className="font-bold text-sm text-text-main">No thoughts yet</p>
                                <p className="text-[10px] text-text-muted uppercase tracking-wider">Start the conversation below</p>
                              </div>
                            </div>
                        ) : (
                          comments.map((comment) => (
                            <div key={comment.id} className="flex gap-4 group">
                              <div className="w-8 h-8 rounded-xl bg-slate-100 border border-border overflow-hidden shrink-0">
                                {comment.userPhoto ? (
                                  <img src={comment.userPhoto} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center font-bold text-primary text-xs">
                                    {comment.userName?.[0]}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-black text-text-main">{comment.userName}</span>
                                    {comment.userVerified && <ShieldCheck size={10} className="text-primary fill-current" />}
                                    <span className="text-[9px] font-bold text-text-muted tracking-tighter uppercase">{comment.createdAt?.toDate ? new Date(comment.createdAt.toDate()).toLocaleDateString() : 'Just now'}</span>
                                  </div>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-2xl rounded-tl-none border border-border">
                                  <p className="text-xs text-text-main leading-relaxed font-medium">{comment.text}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 space-y-8">
                       <div className="grid grid-cols-2 gap-4">
                          {[
                            { label: 'Total Views', value: post.viewsCount || 0, icon: Eye, color: 'text-blue-500', bg: 'bg-blue-50' },
                            { label: 'Total Likes', value: post.likesCount || 0, icon: Heart, color: 'text-red-500', bg: 'bg-red-50' },
                            { label: 'Conversations', value: post.commentsCount || 0, icon: MessageSquare, color: 'text-primary', bg: 'bg-emerald-50' },
                            { label: 'Total Reposts', value: post.sharesCount || 0, icon: Repeat, color: 'text-indigo-500', bg: 'bg-indigo-50' }
                          ].map((stat) => (
                            <div key={stat.label} className={cn("p-4 rounded-3xl border border-transparent transition-all hover:border-slate-100 hover:shadow-sm", stat.bg)}>
                               <div className="flex items-center justify-between mb-2">
                                  <div className={cn("p-2 rounded-xl bg-white/80 backdrop-blur-sm shadow-sm", stat.color)}>
                                     <stat.icon size={16} />
                                  </div>
                               </div>
                               <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">{stat.label}</p>
                               <p className="text-xl font-black text-slate-900 tracking-tight">{stat.value.toLocaleString()}</p>
                            </div>
                          ))}
                       </div>

                       <div className="space-y-4">
                          <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Content Integrity Analysis</h5>
                          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 space-y-4">
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                   <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                                      <ShieldCheck size={18} />
                                   </div>
                                   <div>
                                      <p className="text-[11px] font-black text-slate-900">AI Safety Score</p>
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Powered by Gemini 1.5</p>
                                   </div>
                                </div>
                                <div className="text-right">
                                   <p className="text-lg font-black text-primary">{(100 - (post.aiMetadata?.toxicityScore || post.toxicityScore || 0) * 100).toFixed(0)}%</p>
                                   <p className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest">Safe Passage</p>
                                </div>
                             </div>
                             
                             <div className="relative h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                <div 
                                  className="absolute top-0 left-0 h-full bg-primary transition-all duration-1000" 
                                  style={{ width: `${(100 - (post.aiMetadata?.toxicityScore || post.toxicityScore || 0) * 100)}%` }} 
                                />
                             </div>

                             <div className="flex gap-2">
                                <div className="flex-1 p-3 bg-white rounded-2xl border border-slate-100">
                                   <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Sentiment</p>
                                   <p className="text-[10px] font-bold text-slate-700 capitalize">{post.aiMetadata?.sentiment || post.aiMetada?.sentiment || 'Neutral'}</p>
                                </div>
                                <div className="flex-1 p-3 bg-white rounded-2xl border border-slate-100">
                                   <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Moderation</p>
                                   <div className="flex items-center gap-1">
                                      <ShieldAlert size={10} className="text-emerald-500" />
                                      <p className="text-[10px] font-bold text-emerald-600 uppercase">Automatic</p>
                                   </div>
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>
                  )}
              </div>

              {/* Comment Input */}
              <div className="p-4 md:p-6 border-t border-border bg-surface sticky bottom-0 z-20">
                <form onSubmit={handleCommentSubmit} className="flex gap-3">
                  <Input 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Contribute to the conversation..."
                    className="rounded-2xl bg-slate-50 border-none h-12 text-sm font-medium focus-visible:ring-primary/40 px-4"
                  />
                  <Button 
                    type="submit"
                    disabled={!newComment.trim() || submitting}
                    className="bg-primary hover:bg-emerald-700 text-white w-12 h-12 rounded-2xl p-0 flex items-center justify-center shadow-lg shadow-primary/20 transition-all active:scale-90 shrink-0"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={20} />}
                  </Button>
                </form>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
