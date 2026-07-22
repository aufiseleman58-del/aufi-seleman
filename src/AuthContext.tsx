import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db, googleProvider, handleFirestoreError, OperationType, messaging, getToken, onMessage } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User, updateProfile as updateAuthProfile, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc, arrayUnion } from 'firebase/firestore';
import { toast } from 'sonner';
import { generateKeyPair, KeyPair } from './lib/encryption';
import { useRef } from 'react';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  keys: KeyPair | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: { displayName?: string; photoURL?: string; bio?: string; location?: string }) => Promise<void>;
  verifyIdentity: () => Promise<void>;
  resetEncryption: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [keys, setKeys] = useState<KeyPair | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize and manage E2EE keys
  const manageKeys = async (uid: string, existingPublicKey?: string) => {
    let localKeys = localStorage.getItem(`zathu_keys_${uid}`);
    let keyPair: KeyPair | null = null;

    if (localKeys) {
      keyPair = JSON.parse(localKeys);
      // Only sync TO profile if profile is missing the public key
      // If profile has a different key, we DON'T overwrite it automatically 
      // as that causes a "key flip-flop" between multiple devices.
      if (!existingPublicKey) {
        if (keyPair) {
          await updateDoc(doc(db, 'users', uid), {
            publicKey: keyPair.publicKey,
            encryptionEnabled: true
          });
        }
      } else if (existingPublicKey !== keyPair?.publicKey) {
        console.warn("Notice: Local encryption key differs from profile key.");
        toast.info("Security Update", {
          description: "Your secure identity on this device differs from your main profile. You may experience decryption errors.",
          action: {
            label: "Fix Now",
            onClick: () => {
              window.location.href = '/profile?openSettings=true';
            }
          }
        });
      }
    } else {
      // If we don't have local keys, BUT there is an existing public key in the profile,
      // we DON'T generate and overwrite automatically because that breaks other devices.
      // We only generate if this is a truly new account (or keys were never set).
      if (!existingPublicKey) {
        keyPair = await generateKeyPair();
        localStorage.setItem(`zathu_keys_${uid}`, JSON.stringify(keyPair));
        await updateDoc(doc(db, 'users', uid), {
          publicKey: keyPair.publicKey,
          encryptionEnabled: true
        });
      } else {
        console.warn("Encryption keys are missing locally but exist in your Zathu profile. " +
                     "Enable them in Settings if you wish to reset your secure identity.");
      }
    }
    setKeys(keyPair);
  };

  // Handle Cloud Messaging Tokens
  const setupNotifications = async (uid: string) => {
    if (!messaging) return;

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
        if (!vapidKey) {
          console.warn('VITE_FIREBASE_VAPID_KEY is missing. Push notifications might not work.');
        }

        const token = await getToken(messaging, { 
          vapidKey,
          serviceWorkerRegistration: await navigator.serviceWorker.ready
        });

        if (token) {
          await updateDoc(doc(db, 'users', uid), {
            fcmTokens: arrayUnion(token)
          });
          console.log('FCM Token registered');
        }

        // Listen for foreground messages
        onMessage(messaging, (payload) => {
          console.log('Foreground message received:', payload);
          if (payload.notification) {
            toast(payload.notification.title, {
              description: payload.notification.body,
              action: {
                label: "View",
                onClick: () => {
                  if (payload.data?.chatId) {
                    window.location.href = `/messages?chatWith=${payload.data.senderId}`;
                  }
                }
              }
            });
          }
        });
      }
    } catch (error) {
      console.error('Error setting up push notifications:', error);
    }
  };

  const [isSigningIn, setIsSigningIn] = useState(false);
  const isSigningInRef = useRef(false);

  useEffect(() => {
    // Set persistence to Local to ensure session stability in iframes
    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.warn('Failed to set persistence:', err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        const userDocRef = doc(db, 'users', authUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            
            if (data.isBanned) {
              setProfile(null);
              setUser(null);
              signOut(auth);
              toast.error("Security Alert: Your account has been restricted by Zathu Mission Control.");
              setLoading(false);
              return;
            }

            // Manage E2EE keys
            await manageKeys(authUser.uid, data.publicKey);

            // Update online status for existing user
            const onlineUpdates = { 
              isOnline: true, 
              lastSeen: serverTimestamp() 
            };
            
            // Setup notifications
            setupNotifications(authUser.uid);
            
            // Auto-upgrade to admin if email matches
            let profileData: any = { ...data, ...onlineUpdates };
            if (authUser.email === 'aufiseleman58@gmail.com' && data?.role !== 'admin') {
              profileData.role = 'admin';
            }
            
            await setDoc(userDocRef, onlineUpdates, { merge: true });
            
            // Cache locally for offline survival
            localStorage.setItem(`zathu_cached_profile_${authUser.uid}`, JSON.stringify(profileData));
            setProfile(profileData);
          } else {
            // Generate keys for new user
            const keyPair = await generateKeyPair();
            localStorage.setItem(`zathu_keys_${authUser.uid}`, JSON.stringify(keyPair));

            // Create initial profile
            const newProfile = {
              uid: authUser.uid,
              displayName: authUser.displayName || 'Anonymous',
              email: authUser.email,
              photoURL: authUser.photoURL,
              createdAt: serverTimestamp(),
              isVerified: false,
              bio: '',
              location: 'Malawi',
              role: authUser.email === 'aufiseleman58@gmail.com' ? 'admin' : 'user',
              isOnline: true,
              lastSeen: serverTimestamp(),
              publicKey: keyPair.publicKey,
              encryptionEnabled: true
            };
            await setDoc(userDocRef, newProfile);
            
            // Setup notifications for new user
            setupNotifications(authUser.uid);
            
            // Cache locally for offline survival
            localStorage.setItem(`zathu_cached_profile_${authUser.uid}`, JSON.stringify(newProfile));
            setProfile(newProfile);
            setKeys(keyPair);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
          
          // Resilient cache-recovery for offline operations
          const cachedProfileStr = localStorage.getItem(`zathu_cached_profile_${authUser.uid}`);
          if (cachedProfileStr) {
            try {
              const cachedProfile = JSON.parse(cachedProfileStr);
              setProfile({
                ...cachedProfile,
                isOnline: false, // Flag offline mode visually
              });
              
              // Load keys if cached
              const keyPairStr = localStorage.getItem(`zathu_keys_${authUser.uid}`);
              if (keyPairStr) {
                setKeys(JSON.parse(keyPairStr));
              }
              console.log("Offline Fallback: Restored profile from local cache.");
            } catch (pErr) {
              console.error("Failed to parse cached profile:", pErr);
            }
          } else {
            // Hot fallback generation on-the-fly when cache is also empty
            const keyPairStr = localStorage.getItem(`zathu_keys_${authUser.uid}`);
            let keyPair = null;
            if (keyPairStr) {
              try {
                keyPair = JSON.parse(keyPairStr);
                setKeys(keyPair);
              } catch (e) {}
            }
            
            const fallbackProfile = {
              uid: authUser.uid,
              displayName: authUser.displayName || authUser.email?.split('@')[0] || 'Zathu Explorer',
              email: authUser.email,
              photoURL: authUser.photoURL || '',
              createdAt: new Date().toISOString(),
              isVerified: false,
              bio: 'Operating in offline fallback mode.',
              location: 'Malawi',
              role: authUser.email === 'aufiseleman58@gmail.com' ? 'admin' : 'user',
              isOnline: false,
              lastSeen: new Date().toISOString(),
              publicKey: keyPair?.publicKey || '',
              encryptionEnabled: !!keyPair
            };
            setProfile(fallbackProfile);
            console.log("Offline Fallback: Initialized default profile.");
          }
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

  const resetEncryption = async () => {
    if (!user) return;
    try {
      const keyPair = await generateKeyPair();
      localStorage.setItem(`zathu_keys_${user.uid}`, JSON.stringify(keyPair));
      await updateDoc(doc(db, 'users', user.uid), {
        publicKey: keyPair.publicKey,
        encryptionEnabled: true
      });
      setKeys(keyPair);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      throw error;
    }
  };

  const signIn = async () => {
    if (isSigningInRef.current) {
      console.warn('Sign-in already in progress');
      return;
    }

    try {
      isSigningInRef.current = true;
      setIsSigningIn(true);
      
      // Small stabilize delay to prevent rapid race conditions in iframe environments
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        toast.error("Sign in was cancelled (popup closed).");
      } else if (error.code === 'auth/cancelled-popup-request') {
        console.warn('Cancelled popup request');
      } else if (error.code === 'auth/popup-blocked') {
        toast.error("Sign in popup was blocked. Please enable popups for this site.");
      } else if (error.message?.includes('Pending promise was never set')) {
        console.error('Firebase internal auth error detected. Retrying...');
        // If this specific internal error happens, we can't do much but log and reset
      } else {
        console.error('Sign in error:', error);
        toast.error(`Sign in failed: ${error.message || 'Unknown error'}`);
      }
    } finally {
      setIsSigningIn(false);
      isSigningInRef.current = false;
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
    <AuthContext.Provider value={{ user, profile, keys, loading, signIn, logout, updateProfile, verifyIdentity, resetEncryption }}>
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
