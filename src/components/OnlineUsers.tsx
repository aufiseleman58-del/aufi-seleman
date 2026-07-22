import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import UserComponent from './User';

interface OnlineUser {
  uid: string;
  displayName: string;
  photoURL: string;
  isOnline: boolean;
  isVerified?: boolean;
}

export default function OnlineUsers({ compact = false }: { compact?: boolean }) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // We query for users who are online, ordered by last seen or just limited
    const q = query(
      collection(db, 'users'),
      where('isOnline', '==', true),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const users = snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as OnlineUser))
        .filter(u => u.uid !== currentUser?.uid); // Don't show self in online list
      
      setOnlineUsers(users);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users?isOnline=true');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  if (loading && onlineUsers.length === 0) return null;
  if (!loading && onlineUsers.length === 0) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 px-1">
        <div className="flex items-center shrink-0 gap-1.5 opacity-80 border-r border-border pr-2 mr-1">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
          <span className="text-[9px] font-black uppercase tracking-wider text-text-muted">Live</span>
        </div>
        
        <div className="flex gap-2 overflow-x-auto scrollbar-hide items-center">
          <AnimatePresence mode="popLayout">
            {onlineUsers.map((user, idx) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                key={`${user.uid}-${idx}`}
                onClick={() => navigate(`/profile/${user.uid}`)}
                className="relative cursor-pointer shrink-0 transition-transform hover:scale-110 active:scale-95"
                title={user.displayName}
              >
                <div className="relative w-7 h-7 rounded-full p-[1.5px] bg-slate-100 hover:bg-emerald-100 transition-colors">
                  <img
                    src={user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`}
                    alt={user.displayName}
                    className="w-full h-full rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 border border-white rounded-full shadow-[0_0_4px_rgba(16,185,129,0.5)]" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 px-4 bg-white border-b border-border">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-text-muted flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
          Online Now
        </h3>
        <span className="text-[10px] font-bold text-primary bg-emerald-50 px-2 py-0.5 rounded-full">
          {onlineUsers.length} Active
        </span>
      </div>
      
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        <AnimatePresence mode="popLayout">
          {onlineUsers.map((user, idx) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              key={`${user.uid}-${idx}`}
              onClick={() => navigate(`/profile/${user.uid}`)}
              className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group pb-1"
            >
              <UserComponent 
                displayName={user.displayName}
                photoURL={user.photoURL}
                isOnline={true}
                isVerified={user.isVerified}
                className="group-hover:scale-105 transition-transform"
              />
              <span className="text-[10px] font-bold text-text-main max-w-[60px] truncate text-center">
                {user.displayName.split(' ')[0]}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
