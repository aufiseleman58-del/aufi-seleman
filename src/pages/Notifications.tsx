import React, { useState, useEffect } from 'react';
import { Bell, Heart, MessageCircle, UserPlus, Star, ChevronRight, Settings, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, limit, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

export default function Notifications() {
  const { user } = useAuth();
  const { t } = useSettings();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mentions' | 'likes'>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [prefs, setPrefs] = useState({
    likes: true,
    comments: true,
    follows: true,
    market: true
  });

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user?.uid}/notifications`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const markAllAsRead = async () => {
    if (!user) return;
    const batch = writeBatch(db);
    notifications.filter(n => !n.read).forEach(n => {
      const ref = doc(db, 'users', user.uid, 'notifications', n.id);
      batch.update(ref, { read: true });
    });
    await batch.commit();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart className="text-red-500 fill-red-500" size={16} />;
      case 'comment': return <MessageCircle className="text-blue-500" size={16} />;
      case 'follow': return <UserPlus className="text-emerald-500" size={16} />;
      case 'mention': return <Star className="text-amber-500 fill-amber-500" size={16} />;
      default: return <Bell className="text-primary" size={16} />;
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'mentions') return n.type === 'mention';
    if (filter === 'likes') return n.type === 'like';
    return true;
  });

  return (
    <div className="p-4 space-y-4 relative pb-24 bg-bg-main">
      <div className="flex items-center justify-between mt-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-text-main">Notifications</h1>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Stay updated with Zathu</p>
        </div>
        <div className="flex gap-2">
           <button 
             onClick={markAllAsRead}
             className="text-[10px] font-black text-primary uppercase bg-emerald-50 px-3 py-2 rounded-xl border border-primary/20 hover:bg-emerald-100 transition-all inline-flex items-center gap-1.5"
           >
             <CheckCircle2 size={14} />
             Mark All Read
           </button>
           <Button 
             onClick={() => setShowSettings(true)}
             variant="outline" 
             size="icon" 
             className="rounded-xl border-border hover:bg-slate-50"
           >
             <Settings size={18} className="text-text-muted" />
           </Button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-end md:items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider">Alert Settings</h3>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                {[
                  { id: 'likes', label: 'Likes & Reactions', icon: <Heart size={16} className="text-red-500" /> },
                  { id: 'comments', label: 'Comments & Replies', icon: <MessageCircle size={16} className="text-blue-500" /> },
                  { id: 'follows', label: 'New Followers', icon: <UserPlus size={16} className="text-emerald-500" /> },
                  { id: 'market', label: 'Marketplace Inquiries', icon: <Star size={16} className="text-amber-500" /> }
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        {item.icon}
                      </div>
                      <span className="text-xs font-bold text-text-main">{item.label}</span>
                    </div>
                    <button 
                      onClick={() => setPrefs(prev => ({ ...prev, [item.id]: !prev[item.id as keyof typeof prev] }))}
                      className={`w-10 h-5 rounded-full relative transition-colors ${prefs[item.id as keyof typeof prefs] ? 'bg-primary' : 'bg-slate-200'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${prefs[item.id as keyof typeof prefs] ? 'right-0.5' : 'left-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <Button 
                  onClick={() => {
                    setShowSettings(false);
                  }}
                  className="w-full bg-slate-900 text-white rounded-2xl h-12 font-bold text-xs"
                >
                  Save Preferences
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 py-2">
        {['all', 'mentions', 'likes'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f as any)}
            className={`px-5 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all border ${
              filter === f 
                ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' 
                : 'bg-surface border-border text-text-muted hover:border-primary/40 hover:text-primary shadow-sm'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Checking alerts...</p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="text-center py-20 bg-surface rounded-[32px] border border-dashed border-border flex flex-col items-center gap-4">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
            <Bell size={40} className="text-slate-200" />
          </div>
          <div>
            <p className="text-sm font-bold text-text-main">All quiet for now</p>
            <p className="text-[10px] text-text-muted uppercase tracking-widest mt-1 px-10">We'll alert you when someone interacts with your posts</p>
          </div>
          <Button onClick={() => navigate('/')} variant="link" className="text-primary text-xs font-bold uppercase tracking-widest">Go to Feed</Button>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filteredNotifications.map((n) => (
              <motion.div
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={n.id}
                onClick={async () => {
                   if (!n.read && user) {
                      await updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), { read: true });
                   }
                   if (n.link) navigate(n.link);
                }}
                className={`p-4 rounded-[24px] border transition-all flex gap-4 cursor-pointer group ${
                  n.read 
                    ? 'bg-surface border-border/50 opacity-80' 
                    : 'bg-white border-primary/20 shadow-xl shadow-primary/5 ring-1 ring-primary/5'
                }`}
              >
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 overflow-hidden border border-border">
                    <img src={n.fromPhoto || `https://i.pravatar.cc/150?u=${n.fromId}`} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white rounded-lg shadow-md border border-border flex items-center justify-center">
                    {getIcon(n.type)}
                  </div>
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start">
                    <p className="text-xs text-text-main leading-snug">
                      <span className="font-black text-sm">{n.fromName}</span> {n.message}
                    </p>
                    {n.read === false && (
                       <div className="w-2 h-2 bg-primary rounded-full shadow-sm shadow-primary/40 mt-1" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">
                      {n.createdAt?.toDate ? formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true }) : 'Just now'}
                    </p>
                    {n.postContent && (
                       <p className="text-[10px] text-text-muted border-l border-border pl-2 line-clamp-1 italic">
                         "{n.postContent}"
                       </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight size={16} className="text-primary" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      
      {/* Sample Generation Button for Demo */}
      {!loading && notifications.length === 0 && (
         <div className="pt-8 flex justify-center">
           <Button 
            variant="ghost" 
            className="text-[9px] text-text-muted hover:text-primary uppercase font-bold tracking-[0.2em]"
            onClick={() => {
              // In a real app this would trigger when firestore triggers happen
              setNotifications([
                { id: '1', type: 'like', fromName: 'Tiyamike Banda', message: 'liked your post about Agriculture', createdAt: { toDate: () => new Date() }, read: false, link: '/' },
                { id: '2', type: 'comment', fromName: 'Limbani Phiri', message: 'commented on your video', createdAt: { toDate: () => new Date(Date.now() - 3600000) }, read: true, link: '/videos' }
              ]);
            }}
           >
             Simulate Notifications
           </Button>
         </div>
      )}
    </div>
  );
}
