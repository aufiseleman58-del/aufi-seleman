import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User, updateProfile as updateAuthProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { displayName?: string; photoURL?: string; bio?: string; location?: string }) => Promise<void>;
  verifyIdentity: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        try {
          // Set online status
          await setDoc(userDocRef, { 
            isOnline: true, 
            lastSeen: serverTimestamp() 
          }, { merge: true });

          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const data = userDoc.data();
            // Auto-upgrade to admin if email matches but role is not set
            if (user.email === 'aufiseleman58@gmail.com' && data.role !== 'admin') {
              const updatedProfile = { ...data, role: 'admin' };
              await setDoc(userDocRef, { role: 'admin' }, { merge: true });
              setProfile(updatedProfile);
            } else {
              setProfile(data);
            }
          } else {
            // Create initial profile
            const newProfile = {
              uid: user.uid,
              displayName: user.displayName || 'Anonymous',
              email: user.email,
              photoURL: user.photoURL,
              createdAt: serverTimestamp(),
              isVerified: false,
              bio: '',
              location: 'Malawi',
              role: user.email === 'aufiseleman58@gmail.com' ? 'admin' : 'user',
              isOnline: true,
              lastSeen: serverTimestamp()
            };
            await setDoc(userDocRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Handle offline status on tab close/logout
  useEffect(() => {
    if (!user) return;

    const handleOffline = async () => {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, { 
        isOnline: false, 
        lastSeen: serverTimestamp() 
      }, { merge: true });
    };

    window.addEventListener('beforeunload', handleOffline);
    return () => {
      window.removeEventListener('beforeunload', handleOffline);
      handleOffline();
    };
  }, [user]);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  const logout = async () => {
    try {
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, { 
          isOnline: false, 
          lastSeen: serverTimestamp() 
        }, { merge: true });
      }
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const updateProfile = async (data: { displayName?: string; photoURL?: string; bio?: string; location?: string }) => {
    if (!user) return;
    try {
      // Update Firebase Auth
      if (data.displayName || data.photoURL) {
        await updateAuthProfile(user, {
          displayName: data.displayName || user.displayName,
          photoURL: data.photoURL || user.photoURL
        });
      }

      // Update Firestore
      const userDocRef = doc(db, 'users', user.uid);
      const updates = {
        ...data,
        updatedAt: serverTimestamp()
      };
      await setDoc(userDocRef, updates, { merge: true });
      
      // Update local state
      setProfile((prev: any) => ({ ...prev, ...updates }));
      toast.success("Profile updated successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      throw error;
    }
  };

  const verifyIdentity = async () => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, { isVerified: true }, { merge: true });
      setProfile((prev: any) => ({ ...prev, isVerified: true }));
      toast.success("Identity verified! Verification badge added to your profile.");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, logout, updateProfile, verifyIdentity }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
