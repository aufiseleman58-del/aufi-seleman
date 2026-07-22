import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, doc, addDoc, onSnapshot, updateDoc, deleteDoc, setDoc, query, where, getDocs, getDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff, VideoOff, Camera, Video, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface CallUser {
  uid: string;
  displayName: string;
  photoURL: string;
}

interface CallContextType {
  startCall: (targetUser: CallUser, isVideo: boolean) => void;
  endCall: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

const servers = {
  iceServers: [
    { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
  ],
  iceCandidatePoolSize: 10,
};

export function CallProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  
  // Call State
  const [callState, setCallState] = useState<'idle' | 'ringing' | 'incoming' | 'connected'>('idle');
  const [callDocId, setCallDocId] = useState<string | null>(null);
  const [remoteUser, setRemoteUser] = useState<CallUser | null>(null);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  
  // Duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callState === 'connected') {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const logCallActivity = async (targetId: string, status: 'missed' | 'ended' | 'rejected', duration?: number) => {
    if (!user) return;
    try {
      const chatsRef = collection(db, 'chats');
      const q = query(chatsRef, where('participants', 'array-contains', user.uid));
      const snapshot = await getDocs(q);
      const chatDoc = snapshot.docs.find(d => d.data().participants.includes(targetId));
      
      if (chatDoc) {
        const message = status === 'missed' ? 'Missed call' : 
                        status === 'rejected' ? 'Call declined' : 
                        `Call ended • ${formatDuration(duration || 0)}`;
        
        await addDoc(collection(db, 'chats', chatDoc.id, 'messages'), {
          senderId: user.uid,
          text: `[${isVideoCall ? 'Video' : 'Voice'} Call] ${message}`,
          createdAt: new Date(),
          type: 'call_log'
        });

        await updateDoc(doc(db, 'chats', chatDoc.id), {
          lastMessage: `📞 ${message}`,
          lastMessageAt: new Date(),
          updatedAt: new Date()
        });
      }
    } catch (error) {
      console.error("Error logging call activity:", error);
    }
  };

  // Streams & Peer
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const ringbackRef = useRef<HTMLAudioElement | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Audio setup
  useEffect(() => {
    ringtoneRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3');
    ringtoneRef.current.loop = true;
    ringbackRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
    ringbackRef.current.loop = true;

    return () => {
      ringtoneRef.current?.pause();
      ringbackRef.current?.pause();
    };
  }, []);

  // Handle ringing audio and vibration
  useEffect(() => {
    if (callState === 'incoming') {
      ringbackRef.current?.pause();
      ringtoneRef.current?.play().catch(() => console.log('Audio play failed - user interaction required'));
      if ('vibrate' in navigator) {
        navigator.vibrate([500, 500, 500, 500, 500]);
      }
    } else if (callState === 'ringing') {
      ringtoneRef.current?.pause();
      ringbackRef.current?.play().catch(() => console.log('Audio play failed - user interaction required'));
    } else {
      ringtoneRef.current?.pause();
      ringbackRef.current?.pause();
      if (ringtoneRef.current) ringtoneRef.current.currentTime = 0;
      if (ringbackRef.current) ringbackRef.current.currentTime = 0;
      if ('vibrate' in navigator) {
        navigator.vibrate(0);
      }
    }
  }, [callState]);

  // Call Timeout Logic
  useEffect(() => {
    if (callState === 'ringing' || callState === 'incoming') {
      callTimeoutRef.current = setTimeout(() => {
        if (callState === 'ringing') {
          toast.error('User is not answering');
          endCall();
        } else if (callState === 'incoming' && remoteUser) {
          toast('Missed call');
          rejectCall('missed');
        }
      }, 30000); // 30 seconds timeout
    } else {
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
    }

    return () => {
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    };
  }, [callState]);

  // Listeners
  const unsubCallRef = useRef<(() => void) | null>(null);
  const unsubCandidatesRef = useRef<(() => void) | null>(null);

  // Reset call state and listeners on logout/disconnect
  useEffect(() => {
    if (!user) {
      resetCall();
    }
  }, [user]);

  // Incoming call listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'calls'), where('calleeId', '==', user.uid), where('status', '==', 'ringing'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && callState === 'idle') {
          const data = change.doc.data();
          setCallDocId(change.doc.id);
          setIsVideoCall(data.type === 'video');
          setRemoteUser({
            uid: data.callerId,
            displayName: data.callerName,
            photoURL: data.callerPhoto,
          });
          setCallState('incoming');
        }
        if (change.type === 'modified') {
          const data = change.doc.data();
          if (data.status === 'ended' || data.status === 'rejected') {
            resetCall();
          }
        }
        if (change.type === 'removed') {
          resetCall();
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'calls');
    });

    return () => unsubscribe();
  }, [user, callState]);

  const resetCall = () => {
    setCallState('idle');
    setCallDocId(null);
    setRemoteUser(null);
    setIsVideoCall(false);
    setIsMuted(false);
    setIsVideoOff(false);
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    
    if (unsubCallRef.current) {
      unsubCallRef.current();
      unsubCallRef.current = null;
    }
    if (unsubCandidatesRef.current) {
      unsubCandidatesRef.current();
      unsubCandidatesRef.current = null;
    }
  };

  const setupMedia = async (video: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video,
        audio: true
      });
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error(err);
      toast.error('Could not access camera/microphone. Please check permissions.');
      return null;
    }
  };

  const createPeerConnection = (stream: MediaStream) => {
    const pc = new RTCPeerConnection(servers);
    
    const rStream = new MediaStream();
    setRemoteStream(rStream);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = rStream;
    }
    
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => {
        rStream.addTrack(track);
      });
    };

    pcRef.current = pc;
    return pc;
  };

  const startCall = async (targetUser: CallUser, video: boolean) => {
    if (!user) return;
    setRemoteUser(targetUser);
    setIsVideoCall(video);
    setCallState('ringing');
    
    const stream = await setupMedia(video);
    if (!stream) {
      resetCall();
      return;
    }
    
    const pc = createPeerConnection(stream);
    const callDoc = doc(collection(db, 'calls'));
    setCallDocId(callDoc.id);

    // Save candidates
    const offerCandidates = collection(callDoc, 'callerCandidates');
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(offerCandidates, event.candidate.toJSON());
      }
    };

    const offerDescription = await pc.createOffer();
    await pc.setLocalDescription(offerDescription);

    const callData = {
      callerId: user.uid,
      callerName: profile?.displayName || user.displayName || 'Someone',
      callerPhoto: profile?.photoURL || user.photoURL || '',
      calleeId: targetUser.uid,
      type: video ? 'video' : 'audio',
      offer: {
        type: offerDescription.type,
        sdp: offerDescription.sdp,
      },
      status: 'ringing',
      createdAt: new Date()
    };

    await setDoc(callDoc, callData);

    // Listen for answer
    unsubCallRef.current = onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      if (data.status === 'ended' || data.status === 'rejected') {
        const msg = data.status === 'rejected' ? 'Call declined' : 'Call ended';
        toast(msg);
        resetCall();
      }
      if (pc.signalingState !== 'closed' && !pc.currentRemoteDescription && data.answer) {
        setCallState('connected');
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription).catch(err => {
          console.error("Error setting remote description:", err);
        });
      }
    }, (error) => {
       handleFirestoreError(error, OperationType.GET, `calls/${callDoc.id}`);
    });

    // Listen for remote candidates
    const answerCandidates = collection(callDoc, 'calleeCandidates');
    unsubCandidatesRef.current = onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          if (pc.signalingState !== 'closed') {
            pc.addIceCandidate(candidate).catch(err => {
              console.warn("Error adding ICE candidate:", err);
            });
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `calls/${callDoc.id}/calleeCandidates`);
    });
  };

  const acceptCall = async () => {
    if (!callDocId || !user) return;
    setCallState('connected');
    
    const stream = await setupMedia(isVideoCall);
    if (!stream) {
      rejectCall();
      return;
    }
    
    const pc = createPeerConnection(stream);
    const callDoc = doc(db, 'calls', callDocId);

    const answerCandidates = collection(callDoc, 'calleeCandidates');
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(answerCandidates, event.candidate.toJSON());
      }
    };

    const callData = (await getDoc(callDoc)).data();
    if (!callData) return;

    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    await updateDoc(callDoc, {
      answer: {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
      },
      status: 'ongoing'
    });

    const offerCandidates = collection(callDoc, 'callerCandidates');
    unsubCandidatesRef.current = onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          if (pc.signalingState !== 'closed') {
            pc.addIceCandidate(candidate).catch(err => {
              console.warn("Error adding ICE candidate:", err);
            });
          }
        }
      });
    }, (error) => {
       handleFirestoreError(error, OperationType.LIST, `calls/${callDocId}/callerCandidates`);
    });
    
    unsubCallRef.current = onSnapshot(callDoc, (snapshot) => {
      if (snapshot.data()?.status === 'ended') {
        resetCall();
      }
    }, (error) => {
       handleFirestoreError(error, OperationType.GET, `calls/${callDocId}`);
    });
  };

  const rejectCall = async (overrideStatus?: 'missed' | 'rejected') => {
    if (callDocId) {
      const status = overrideStatus || (callState === 'connected' ? 'ended' : 'rejected');
      await updateDoc(doc(db, 'calls', callDocId), { status: status === 'missed' ? 'rejected' : status });
      if (remoteUser) {
        logCallActivity(remoteUser.uid, status as any, callDuration);
      }
    }
    resetCall();
  };

  const endCall = async () => {
    if (callDocId) {
      await updateDoc(doc(db, 'calls', callDocId), { status: 'ended' });
      if (remoteUser) {
        logCallActivity(remoteUser.uid, 'ended', callDuration);
      }
    }
    resetCall();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = isMuted);
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream && isVideoCall) {
      localStream.getVideoTracks().forEach(t => t.enabled = isVideoOff);
      setIsVideoOff(!isVideoOff);
    }
  };

  return (
    <CallContext.Provider value={{ startCall, endCall }}>
      {children}
      
      {/* Call Overlays */}
      <AnimatePresence>
        {callState !== 'idle' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[500] bg-zinc-950 flex flex-col items-center justify-center ${callState === 'incoming' ? 'bg-black/90 backdrop-blur-xl' : ''}`}
          >
            
            {/* INCOMING CALL UI */}
            {callState === 'incoming' && remoteUser && (
              <motion.div 
                initial={{ scale: 0.9, y: 50 }} animate={{ scale: 1, y: 0 }}
                className="flex flex-col items-center gap-6"
              >
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-emerald-500/30 animate-pulse relative">
                  {remoteUser.photoURL ? (
                    <img src={remoteUser.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center text-4xl font-bold text-white">
                      {remoteUser.displayName?.[0] || '?'}
                    </div>
                  )}
                </div>
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-bold text-white">{remoteUser.displayName}</h2>
                  <p className="text-emerald-400 font-medium tracking-widest uppercase text-sm animate-pulse">
                    Incoming {isVideoCall ? 'Video' : 'Voice'} Call...
                  </p>
                </div>
                <div className="flex items-center gap-8 mt-8">
                  <button onClick={rejectCall} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-600 transition-transform active:scale-90 shadow-lg shadow-red-500/20">
                    <PhoneOff size={28} />
                  </button>
                  <button onClick={acceptCall} className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-white hover:bg-emerald-600 transition-transform active:scale-90 shadow-lg shadow-emerald-500/20 animate-bounce">
                    {isVideoCall ? <Video size={28} /> : <Phone size={28} />}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ACTIVE/RINGING CALL UI */}
            {(callState === 'ringing' || callState === 'connected') && remoteUser && (
              <div className="w-full h-full flex flex-col">
                {/* Header */}
                <div className="absolute top-0 left-0 right-0 p-6 z-10 bg-gradient-to-b from-black/80 to-transparent flex flex-col items-center pt-12">
                   <h2 className="text-white text-lg font-bold">{remoteUser.displayName}</h2>
                   <p className="text-white/60 text-sm">
                     {callState === 'ringing' ? 'Calling...' : formatDuration(callDuration)}
                   </p>
                </div>

                {/* Video Streams Layout */}
                <div className="flex-1 relative w-full flex items-center justify-center overflow-hidden">
                  {/* Remote Stream Background */}
                  <video 
                    ref={remoteVideoRef} 
                    autoPlay playsInline 
                    className={`absolute inset-0 w-full h-full object-cover ${(!isVideoCall || callState === 'ringing') ? 'hidden' : ''}`} 
                  />
                  
                  {/* Audio-only or ringing fallback avatar */}
                  {(!isVideoCall || callState === 'ringing') && (
                    <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-white/10 shadow-2xl relative z-0">
                       {remoteUser.photoURL ? (
                          <img src={remoteUser.photoURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-slate-800 flex items-center justify-center text-6xl font-bold text-white">
                            {remoteUser.displayName?.[0] || '?'}
                          </div>
                        )}
                    </div>
                  )}

                  {/* Local Stream PiP */}
                  <div className={`absolute bottom-32 right-6 w-32 h-44 bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-20 ${!isVideoCall ? 'hidden' : ''}`}>
                    <video 
                      ref={localVideoRef} 
                      autoPlay playsInline muted 
                      className={`w-full h-full object-cover ${isVideoOff ? 'opacity-0' : 'opacity-100'} scale-x-[-1] transition-opacity`} 
                    />
                    {isVideoOff && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Camera size={24} className="text-white/50" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-6 z-30 pb-12">
                  <button 
                    onClick={toggleMute}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-white text-black' : 'bg-white/20 text-white backdrop-blur-md'}`}
                  >
                    {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>
                  
                  {isVideoCall && (
                    <button 
                      onClick={toggleVideo}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isVideoOff ? 'bg-white text-black' : 'bg-white/20 text-white backdrop-blur-md'}`}
                    >
                      {isVideoOff ? <VideoOff size={24} /> : <Camera size={24} />}
                    </button>
                  )}

                  <button 
                    onClick={endCall}
                    className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-lg active:scale-90 transition-transform"
                  >
                    <PhoneOff size={28} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </CallContext.Provider>
  );
}

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within CallProvider');
  return context;
};
