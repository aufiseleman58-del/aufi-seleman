import React from 'react';
import { motion } from 'motion/react';
import { Heart, MessageSquare, Repeat, Share2, Edit, Trash2, Globe, MapPin, ShieldCheck, Bookmark, MessageCircle, TrendingUp, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { db } from '../lib/firebase';
import { doc, updateDoc, increment, arrayUnion } from 'firebase/firestore';
import PromotionModal from './PromotionModal';
import { useNavigate } from 'react-router-dom';

interface PostCardProps {
  post: any;
  user: any;
  liked: boolean;
  saved: boolean;
  following: boolean;
  translation?: { text: string; language: string };
  isTranslating: boolean;
  language: string;
  onLike: (postId: string) => void;
  onSave: (postId: string) => void;
  onFollow: (userId: string, userName: string, userPhoto?: string) => void;
  onTranslate: (postId: string, content: string) => void;
  onRepost: (post: any) => void;
  onExternalShare: (post: any) => void;
  onDelete: (postId: string) => void;
  onEdit: (post: any) => void;
  onMessage: (authorId: string) => void;
  onComment?: (postId: string) => void;
  onClick: () => void;
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  user,
  liked,
  saved,
  following,
  translation,
  isTranslating,
  language,
  onLike,
  onSave,
  onFollow,
  onTranslate,
  onRepost,
  onExternalShare,
  onDelete,
  onEdit,
  onMessage,
  onComment,
  onClick
}) => {
  const navigate = useNavigate();
  const [showPromote, setShowPromote] = React.useState(false);

  const handleShareToMarketplace = () => {
    navigate('/marketplace', {
      state: {
        marketShare: {
          name: post.content ? post.content.substring(0, 40) : 'Item from post',
          description: post.content || '',
          mediaUrl: post.media?.[0] || '',
          price: '',
          category: 'Other'
        }
      }
    });
  };

  const handleVote = async (optionIndex: number) => {
    if (!user || !post.poll) return;
    if (post.poll.votedIds?.includes(user.uid)) return;

    try {
      const postRef = doc(db, 'posts', post.id);
      const updatedOptions = [...post.poll.options];
      updatedOptions[optionIndex].votes += 1;

      await updateDoc(postRef, {
        "poll.options": updatedOptions,
        "poll.totalVotes": increment(1),
        "poll.votedIds": arrayUnion(user.uid)
      });
    } catch (error) {
      console.error("Vote error:", error);
    }
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn(
        "bg-white rounded-2xl border border-border overflow-hidden shadow-sm p-4 relative cursor-pointer hover:border-primary/20 transition-colors group/card",
        post.isPromoted && "border-primary/30 ring-1 ring-primary/5"
      )}
    >
      {post.isPromoted && (
        <div className="absolute top-0 right-0 px-3 py-1 bg-primary/10 text-primary text-[9px] font-black uppercase tracking-[0.2em] rounded-bl-xl border-l border-b border-primary/20 backdrop-blur-sm z-10">
          Sponsored
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-200 flex items-center justify-center text-primary font-black overflow-hidden shrink-0 border border-border shadow-sm">
            {post.authorPhoto ? (
              <img src={post.authorPhoto} alt={post.authorName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            ) : (
              post.authorName?.[0]
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-sm tracking-tight">{post.authorName}</h3>
              {post.authorVerified && <ShieldCheck size={14} className="text-primary fill-current" />}
              {user && post.authorId !== user.uid && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onFollow(post.authorId, post.authorName, post.authorPhoto);
                  }}
                  className={cn(
                    "ml-2 text-[10px] font-black px-2 py-0.5 rounded-lg transition-all",
                    following 
                      ? "bg-slate-100 text-text-muted" 
                      : "bg-primary text-white shadow-sm shadow-primary/20"
                  )}
                >
                  {following ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold text-text-muted opacity-60">
                {post.createdAt?.toDate ? new Date(post.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
              </p>
              {post.isRepost && (
                <span className="text-[9px] font-black uppercase text-primary bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0">
                  <Repeat size={10} /> Reposted
                </span>
              )}
              {post.category && (
                <span className="text-[8px] font-black uppercase tracking-widest text-primary bg-emerald-50 px-1.5 py-0.5 rounded-md border border-primary/10">
                  {post.category}
                </span>
              )}
            </div>
          </div>
        </div>

        {user && post.authorId === user.uid && !post.isRepost && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {!post.isPromoted && (
              <button 
                onClick={() => setShowPromote(true)}
                className="p-2 hover:bg-emerald-50 rounded-xl text-primary transition-colors flex items-center gap-1"
                title="Promote Post"
              >
                <TrendingUp size={16} />
                <span className="text-[10px] font-bold uppercase">Boost</span>
              </button>
            )}
            <button 
              onClick={() => onEdit(post)}
              className="p-2 hover:bg-slate-100 rounded-xl text-text-muted transition-colors"
              title="Edit Post"
            >
              <Edit size={16} />
            </button>
            <button 
              onClick={() => onDelete(post.id)}
              className="p-2 hover:bg-red-50 rounded-xl text-text-muted hover:text-red-500 transition-colors"
              title="Delete Post"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="text-[14px] leading-relaxed whitespace-pre-wrap mb-4 font-medium text-text-main">
        {post.isRepost ? (
          <div className="space-y-4">
            {post.content && <p className="mb-2">{post.content}</p>}
            <div className="border border-border rounded-2xl p-4 bg-slate-50/50 hover:bg-slate-50 transition-all border-l-4 border-l-primary">
              <div className="flex items-center gap-2 mb-2">
                <img 
                  src={post.originalAuthorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.originalAuthorName}`}
                  className="w-5 h-5 rounded-full border border-border" 
                  alt="Original author"
                />
                <span className="text-xs font-bold text-text-main">{post.originalAuthorName}</span>
              </div>
              <p className="text-[13px] text-text-muted line-clamp-3 leading-relaxed">
                {post.originalContent}
              </p>
            </div>
          </div>
        ) : translation ? (
          <div className="space-y-3">
            <p className="text-text-muted italic opacity-60 text-[13px]">{post.content}</p>
            <div className="p-3 bg-emerald-50/50 rounded-xl border-l-4 border-primary">
              <p className="text-text-main font-semibold leading-relaxed">{translation.text}</p>
            </div>
          </div>
        ) : (
          post.content
        )}
      </div>

      {post.poll && (
        <div className="bg-slate-50 rounded-2xl p-4 border border-border/50 mb-4 space-y-3" onClick={(e) => e.stopPropagation()}>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
            <TrendingUp size={12} /> Community Poll
          </p>
          {post.poll.options.map((option: any, idx: number) => {
            const percentage = post.poll.totalVotes > 0 
              ? Math.round((option.votes / post.poll.totalVotes) * 100) 
              : 0;
            const hasVoted = post.poll.votedIds?.includes(user?.uid);
            
            return (
              <button
                key={idx}
                disabled={hasVoted || !user}
                onClick={(e) => {
                  e.stopPropagation();
                  handleVote(idx);
                }}
                className={cn(
                  "w-full relative h-11 rounded-xl bg-white border border-border/50 overflow-hidden group/poll transition-all",
                  !hasVoted && user && "hover:border-primary/30"
                )}
              >
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: hasVoted ? `${percentage}%` : '0%' }}
                  className="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-1000" 
                />
                <div className="absolute inset-0 px-4 flex justify-between items-center text-[12px] font-bold">
                  <span className={cn(hasVoted && "text-text-main")}>{option.text}</span>
                  {hasVoted && <span className="text-primary font-black">{percentage}%</span>}
                </div>
              </button>
            );
          })}
          <div className="flex justify-between items-center pt-1 px-1">
            <p className="text-[9px] font-bold text-text-muted uppercase tracking-tight">
              {post.poll.totalVotes} total votes
            </p>
            {post.poll.expiresAt && (
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-tight">
                Ends {new Date(post.poll.expiresAt.toDate ? post.poll.expiresAt.toDate() : post.poll.expiresAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      )}

      {post.mentions && post.mentions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {post.mentions.map((m: string, i: number) => (
            <span key={`mention-${m}-${i}`} className="text-[11px] text-primary font-black px-2 py-0.5 bg-emerald-50 rounded-lg hover:underline cursor-pointer">@{m}</span>
          ))}
        </div>
      )}
      
      <div className="flex items-center gap-2 mb-4" onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={() => onTranslate(post.id, post.content)}
          disabled={isTranslating}
          className="flex items-center gap-1.5 text-[10px] font-bold text-primary bg-slate-50 px-3 py-1.5 rounded-full border border-border/50 hover:bg-emerald-50 transition-all disabled:opacity-50"
        >
          <Globe size={12} className={cn(isTranslating && "animate-spin")} />
          {isTranslating ? 'Translating...' : translation ? 'Show Original' : `Translate to ${language === 'English' ? 'Chichewa' : 'English'}`}
        </button>
        
        {post.location && (
          <div className="flex items-center gap-1 text-[10px] font-bold text-text-muted bg-slate-50 px-3 py-1.5 rounded-full border border-border/50 uppercase tracking-wide">
            <MapPin size={10} />
            {post.location}
          </div>
        )}
      </div>

      {post.media?.[0] && (
        <div className="rounded-2xl overflow-hidden border border-border shadow-xl mb-4 bg-slate-100 relative group aspect-[4/3]">
          {post.media[0].includes('.mp4') || post.media[0].includes('.webm') || post.media[0].includes('video') ? (
            <video 
              src={post.media[0]} 
              controls 
              className="w-full h-full object-cover"
              playsInline
            />
          ) : post.media[0].includes('.weba') || post.media[0].includes('audio') ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-50 p-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6 animate-pulse">
                <MessageSquare size={32} className="text-primary" />
              </div>
              <audio 
                src={post.media[0]} 
                controls 
                className="w-full max-w-sm"
              />
            </div>
          ) : (
            <img 
              src={post.media[0] || undefined} 
              alt="Post content" 
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-700"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
      )}
      
      <div className="flex items-center justify-between pt-4 border-t border-border mt-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onLike(post.id);
            }}
            className={cn(
              "flex items-center gap-1.5 transition-all group",
              liked ? "text-red-500" : "text-text-muted hover:text-red-500"
            )}
          >
            <div className={cn(
              "p-2 rounded-xl transition-all",
              liked ? "bg-red-50" : "group-hover:bg-red-50"
            )}>
              <Heart size={18} className={cn(liked && "fill-current")} />
            </div>
            <span className="text-[12px] font-black">{post.likesCount || 0}</span>
          </button>

          <button 
            onClick={(e) => {
              e.stopPropagation();
              onComment?.(post.id);
            }}
            className="flex items-center gap-1.5 text-text-muted hover:text-primary transition-all group"
          >
            <div className="p-2 rounded-xl group-hover:bg-emerald-50 transition-all">
              <MessageSquare size={18} />
            </div>
            <span className="text-[12px] font-black">{post.commentsCount || 0}</span>
          </button>

          <button 
            onClick={(e) => {
              e.stopPropagation();
              onRepost(post);
            }}
            className="flex items-center gap-1.5 text-text-muted hover:text-primary transition-all group"
          >
            <div className="p-2 rounded-xl group-hover:bg-emerald-50 transition-all">
              <Repeat size={18} />
            </div>
            <span className="text-[12px] font-black">{post.sharesCount || 0}</span>
          </button>

          <button 
            onClick={(e) => {
              e.stopPropagation();
              onExternalShare(post);
            }}
            className="flex items-center gap-1.5 text-text-muted hover:text-primary transition-all group"
            title="External Share"
          >
            <div className="p-2 rounded-xl group-hover:bg-emerald-50 transition-all">
              <Share2 size={18} />
            </div>
          </button>

          <button 
            onClick={(e) => {
              e.stopPropagation();
              handleShareToMarketplace();
            }}
            className="flex items-center gap-1.5 text-text-muted hover:text-primary transition-all group"
            title="Share to Marketplace"
          >
            <div className="p-2 rounded-xl group-hover:bg-emerald-50 transition-all flex items-center gap-1">
              <Store size={18} />
              <span className="text-[10px] font-bold hidden md:inline">Sell on Market</span>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {user && post.authorId !== user.uid && (
            <button 
              onClick={() => onMessage(post.authorId)}
              className="p-2 rounded-xl text-text-muted hover:text-primary hover:bg-emerald-50 transition-all"
              title="Message Author"
            >
              <MessageCircle size={18} />
            </button>
          )}
          <button 
            onClick={() => onSave(post.id)}
            className={cn(
              "p-2 rounded-xl transition-all",
              saved ? "bg-emerald-50 text-primary" : "text-text-muted hover:text-primary hover:bg-emerald-50"
            )}
          >
            <Bookmark size={18} className={cn(saved && "fill-current")} />
          </button>
        </div>
      </div>
      
      {showPromote && user && (
        <PromotionModal 
          itemId={post.id}
          itemType="post"
          title={post.content || "Zathu Feed Post"}
          userId={user.uid}
          onClose={() => setShowPromote(false)}
        />
      )}
    </motion.div>
  );
};

export default PostCard;
