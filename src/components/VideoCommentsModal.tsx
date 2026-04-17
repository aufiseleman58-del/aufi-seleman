import React, { useState, useEffect } from 'react';
import { X, Send, ShieldCheck, Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface VideoCommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
}

export default function VideoCommentsModal({ isOpen, onClose, videoId }: VideoCommentsModalProps) {
  const { user, profile } = useAuth();
  const { t } = useSettings();
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !videoId) return;

    const q = query(
      collection(db, 'videoComments'),
      where('videoId', '==', videoId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setComments(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'videoComments');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, videoId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'videoComments'), {
        videoId,
        userId: user.uid,
        authorName: profile?.displayName || user.displayName || 'User',
        authorPhoto: profile?.photoURL || user.photoURL || '',
        text: newComment.trim(),
        createdAt: serverTimestamp()
      });

      // Update comment count on video
      await updateDoc(doc(db, 'videos', videoId), {
        commentsCount: increment(1)
      });

      setNewComment('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'videoComments');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await deleteDoc(doc(db, 'videoComments', commentId));
      await updateDoc(doc(db, 'videos', videoId), {
        commentsCount: increment(-1)
      });
      toast.success('Comment deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'videoComments');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center pointer-events-none">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
            onClick={onClose}
          />
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="bg-surface w-full max-w-md rounded-t-[32px] md:rounded-[32px] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[80vh] pointer-events-auto"
          >
            <div className="p-4 border-b border-border flex items-center justify-between bg-slate-50/50 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight">{t('video.comments')}</h3>
                  <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">{comments.length} Thoughts shared</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <Loader2 className="animate-spin text-primary" size={24} />
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Loading conversations...</p>
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-20 space-y-3">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto border border-dashed border-border">
                    <MessageSquare size={24} className="text-slate-300" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">No comments yet</p>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider">Be the first to share your thoughts!</p>
                  </div>
                </div>
              ) : (
                comments.map((comment) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={comment.id} 
                    className="flex gap-3 group"
                  >
                    <div className="w-8 h-8 rounded-xl bg-slate-100 border border-border overflow-hidden shrink-0 shadow-sm">
                      {comment.authorPhoto ? (
                        <img src={comment.authorPhoto} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-primary text-xs">
                          {comment.authorName?.[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[11px] font-black text-text-main">{comment.authorName}</p>
                          <span className="text-[9px] text-text-muted font-bold">• {comment.createdAt?.toDate ? new Date(comment.createdAt.toDate()).toLocaleDateString() : 'Just now'}</span>
                        </div>
                        {user?.uid === comment.userId && (
                          <button 
                            onClick={() => handleDelete(comment.id)}
                            className="p-1 text-red-400 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl rounded-tl-none border border-border">
                        <p className="text-xs text-text-main leading-relaxed font-medium">{comment.text}</p>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-border bg-white sticky bottom-0">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input 
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Ask a question or share a tip..."
                  className="rounded-xl bg-slate-50 border-none h-11 text-xs font-medium"
                />
                <Button 
                  type="submit"
                  disabled={!newComment.trim() || submitting}
                  className="bg-primary hover:bg-emerald-700 text-white w-11 h-11 rounded-xl p-0 flex items-center justify-center shadow-lg shadow-primary/20 transition-all active:scale-90"
                >
                  {submitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                </Button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
