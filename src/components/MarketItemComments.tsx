import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageCircle, Send, Loader2, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface Comment {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  text: string;
  createdAt: any;
}

interface MarketItemCommentsProps {
  itemId: string;
  onClose?: () => void;
}

const MarketItemComments: React.FC<MarketItemCommentsProps> = ({ itemId, onClose }) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'marketItems', itemId, 'comments'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `marketItems/${itemId}/comments`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [itemId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user || submitting) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, 'marketItems', itemId, 'comments'), {
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        userPhoto: user.photoURL || '',
        text: newComment,
        createdAt: serverTimestamp()
      });
      setNewComment('');
      toast.success('Comment posted');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `marketItems/${itemId}/comments`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[500px]">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle size={18} className="text-primary" />
        <h4 className="text-[10px] font-black uppercase tracking-widest text-text-muted">Questions & Comments</h4>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-hide min-h-[100px]">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="animate-spin text-primary" size={20} />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-border">
            <p className="text-[10px] font-bold text-text-muted uppercase">No questions yet. Be the first!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              key={comment.id} 
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-border">
                <img 
                  src={comment.userPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${comment.userName}`} 
                  alt="" 
                  className="w-full h-full object-cover" 
                />
              </div>
              <div className="flex-1">
                <div className="bg-slate-50 p-3 rounded-2xl rounded-tl-none border border-border">
                  <p className="text-[10px] font-black tracking-tight text-text-main mb-1">{comment.userName}</p>
                  <p className="text-xs font-medium text-text-main leading-relaxed">{comment.text}</p>
                </div>
                <p className="text-[9px] font-bold text-text-muted mt-1 ml-1 opacity-60">
                  {comment.createdAt?.toDate ? new Date(comment.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                </p>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="relative">
        <Input
          placeholder="Ask a question..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="h-12 bg-white rounded-2xl pr-12 text-xs font-bold border-border shadow-inner"
        />
        <Button 
          type="submit" 
          disabled={!newComment.trim() || submitting}
          className="absolute right-1.5 top-1.5 h-9 w-9 p-0 bg-primary rounded-xl"
        >
          {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
        </Button>
      </form>
    </div>
  );
};

export default MarketItemComments;
