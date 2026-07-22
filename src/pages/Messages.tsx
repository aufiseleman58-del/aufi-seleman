import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  where, 
  doc, 
  getDoc, 
  setDoc,
  limit,
  Timestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Send, Phone, PhoneOff, Video, Info, ArrowLeft, Check, CheckCheck, MessageCircle, UserPlus, Image as ImageIcon, Camera, X, Loader2, ShieldCheck, User, Mic, Play, Pause, FastForward } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { useCall } from '../CallContext';
import { motion, AnimatePresence } from 'motion/react';
import { encryptShared, decryptShared } from '../lib/encryption';
import { useSettings } from '../SettingsContext';
import { compressImage } from '../lib/imageCompression';

interface Message {
  id: string;
  text?: string;
  ciphertext?: string;
  nonce?: string;
  isEncrypted?: boolean;
  mediaUrl?: string;
  mediaType?: string;
  senderId: string;
  createdAt: any;
}

const VoiceNotePlayer = ({ url, isOwn }: { url: string; isOwn: boolean }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleRate = () => {
    const rates = [1, 1.5, 2];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-2xl w-[240px] shadow-sm border ${
      isOwn 
        ? 'bg-emerald-600/20 border-emerald-500/20 text-white' 
        : 'bg-slate-50 border-border text-text-main'
    }`}>
      <button 
        onClick={togglePlay}
        className={`w-10 h-10 flex items-center justify-center rounded-full shadow-md transition-transform active:scale-90 ${
          isOwn ? 'bg-white text-primary' : 'bg-primary text-white'
        }`}
      >
        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
      </button>
      
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="h-6 flex items-center gap-[2px] px-1 overflow-hidden">
          {[...Array(24)].map((_, i) => {
            const isActive = progress > (i / 24) * 100;
            const barHeight = 30 + Math.abs(Math.sin((i + 5) * 0.8)) * 60;
            return (
              <motion.div 
                key={`waveform-bar-${i}`} 
                animate={{ 
                  height: isPlaying ? [`${barHeight}%`, `${barHeight * 0.6}%`, `${barHeight}%`] : `${barHeight}%`,
                  opacity: isActive ? 1 : 0.4
                }}
                transition={{ 
                  repeat: isPlaying ? Infinity : 0, 
                  duration: 0.8,
                  delay: i * 0.05
                }}
                className={`w-[3px] rounded-full transition-colors ${
                  isActive ? (isOwn ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'bg-primary shadow-[0_0_8px_rgba(16,185,129,0.4)]') : (isOwn ? 'bg-white/30' : 'bg-slate-300')
                }`}
              />
            );
          })}
        </div>
        <div className="flex justify-between items-center px-1">
          <span className={`text-[9px] font-mono font-black tracking-tighter ${isOwn ? 'text-white/90' : 'text-text-muted'}`}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <button 
            onClick={toggleRate}
            className={`text-[8px] font-black px-1.5 py-0.5 rounded-full border transition-all ${
              isOwn 
                ? 'border-white/40 text-white hover:bg-white/20' 
                : 'border-border text-primary hover:bg-emerald-50'
            }`}
          >
            {playbackRate}x
          </button>
        </div>
      </div>

      <audio 
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
    </div>
  );
};

interface Chat {
  id: string;
  participants: string[];
  lastMessage?: string;
  lastMessageAt?: any;
  updatedAt: any;
  otherUser?: {
    uid: string;
    displayName: string;
    photoURL: string;
    publicKey?: string;
  };
}

export default function Messages() {
  const { user, profile, keys, signIn } = useAuth();
  const { dataSaver } = useSettings();
  const { startCall } = useCall();
  const [searchParams, setSearchParams] = useSearchParams();
  const chatWithId = searchParams.get('chatWith');
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUserList, setShowUserList] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [otherUserStatus, setOtherUserStatus] = useState<{ isOnline: boolean; lastSeen: any } | null>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioRecorder, setAudioRecorder] = useState<MediaRecorder | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(30).fill(5));
  const audioTimerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const [isHandsFree, setIsHandsFree] = useState(false);

  const startAudioRecording = async () => {
    try {
      recordingStartTimeRef.current = Date.now();
      setIsHandsFree(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioStream(stream);
      
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      
      // Setup Analyser for real-time visualization
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      setAudioRecorder(recorder);
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new File([blob], `audio_message_${Date.now()}.webm`, { type: 'audio/webm' });
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setMediaPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
        
        stream.getTracks().forEach(track => track.stop());
        setAudioStream(null);
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      };

      recorder.start();
      setIsRecordingAudio(true);
      setIsRecordingPaused(false);
      setRecordingTime(0);

      // Update audio levels for visualization
      const updateLevels = () => {
        if (analyserRef.current && !isRecordingPaused) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
          setAudioLevels(prev => [...prev.slice(1), Math.max(5, average / 2.5)]);
        }
        animationFrameRef.current = requestAnimationFrame(updateLevels);
      };
      updateLevels();

      audioTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error starting audio recording:", err);
      toast.error("Could not access microphone");
    }
  };

  const pauseAudioRecording = () => {
    if (audioRecorder && audioRecorder.state === 'recording') {
      audioRecorder.pause();
      setIsRecordingPaused(true);
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      if ('vibrate' in navigator) navigator.vibrate(10);
    }
  };

  const resumeAudioRecording = () => {
    if (audioRecorder && audioRecorder.state === 'paused') {
      audioRecorder.resume();
      setIsRecordingPaused(false);
      audioTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      if ('vibrate' in navigator) navigator.vibrate(10);
    }
  };

  const stopAudioRecording = () => {
    if (audioRecorder && (audioRecorder.state === 'recording' || audioRecorder.state === 'paused')) {
      const duration = Date.now() - recordingStartTimeRef.current;
      // If it was a short tap, enter hands-free mode instead of stopping
      if (duration < 250 && !isHandsFree) {
        setIsHandsFree(true);
        return;
      }

      audioRecorder.stop();
      setIsRecordingAudio(false);
      setIsRecordingPaused(false);
      setIsHandsFree(false);
      if (audioTimerRef.current) clearInterval(audioTimerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if ('vibrate' in navigator) {
        navigator.vibrate(20);
      }
    }
  };

  const cancelAudioRecording = () => {
    if (audioRecorder && isRecordingAudio) {
      audioRecorder.stop();
    }
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }
    setIsRecordingAudio(false);
    setIsRecordingPaused(false);
    if (audioTimerRef.current) clearInterval(audioTimerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    setAudioRecorder(null);
    setMediaPreview(null);
    setSelectedFile(null);
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 30, 30]);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch chats
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatsData = await Promise.all(snapshot.docs.map(async (chatDoc) => {
    const data = chatDoc.data();
    const otherUserId = data.participants.find((id: string) => id !== user.uid);
    
    // Fetch other user profile
    let otherUser = { uid: otherUserId, displayName: 'User', photoURL: '', isVerified: false, publicKey: '' };
    if (otherUserId) {
      const userDoc = await getDoc(doc(db, 'users', otherUserId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        otherUser = {
          uid: otherUserId,
          displayName: userData.displayName || 'User',
          photoURL: userData.photoURL || '',
          isVerified: userData.isVerified || false,
          publicKey: userData.publicKey || ''
        };
      }
    }

        return {
          ...data,
          id: chatDoc.id,
          participants: data.participants,
          updatedAt: data.updatedAt,
          otherUser
        } as Chat;
      }));

      setChats(chatsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Handle auto-starting chat from query param
  useEffect(() => {
    const handleChatWithParam = async () => {
      if (!chatWithId || !user || loading) return;

      const existingChat = chats.find(c => c.participants.includes(chatWithId));
      if (existingChat) {
        setSelectedChat(existingChat);
        // Clear param to avoid re-opening on manual chat switch
        searchParams.delete('chatWith');
        setSearchParams(searchParams, { replace: true });
        return;
      }

      // If not in chat list, try fetching user to start new
      try {
        const userDoc = await getDoc(doc(db, 'users', chatWithId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          await startNewChat({
            uid: chatWithId,
            displayName: userData.displayName || 'User',
            photoURL: userData.photoURL || ''
          });
          // Clear param
          searchParams.delete('chatWith');
          setSearchParams(searchParams, { replace: true });
        }
      } catch (error) {
        console.error("Error starting chat from param:", error);
      }
    };

    handleChatWithParam();
  }, [chatWithId, user, loading, chats]);

  // Listen to other user status and typing
  useEffect(() => {
    if (!selectedChat || !user) {
      setOtherUserStatus(null);
      setIsOtherTyping(false);
      return;
    }

    const otherUserId = selectedChat.participants.find(id => id !== user.uid);
    if (!otherUserId) return;

    // Listen to other user's profile for presence
    const userUnsubscribe = onSnapshot(doc(db, 'users', otherUserId), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setOtherUserStatus({
          isOnline: data.isOnline || false,
          lastSeen: data.lastSeen
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${otherUserId}`);
    });

    // Listen to chat for typing status
    const chatUnsubscribe = onSnapshot(doc(db, 'chats', selectedChat.id), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const typing = data.typing || {};
        setIsOtherTyping(typing[otherUserId] || false);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chats/${selectedChat?.id}`);
    });

    return () => {
      userUnsubscribe();
      chatUnsubscribe();
    };
  }, [selectedChat, user]);

  // Fetch messages for selected chat
  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'chats', selectedChat.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const messagesData = await Promise.all(snapshot.docs.map(async chatMsgDoc => {
        const data = chatMsgDoc.data();
        let text = data.text;

        if (data.isEncrypted && keys) {
          const isMe = data.senderId === user.uid;
          const otherUserId = isMe 
            ? selectedChat.participants.find(id => id !== user.uid)
            : data.senderId;
          
          if (otherUserId) {
            let otherPubKey = "";
            
            // Prefer the public key stored in the message (it was the one used at encryption time)
            if (isMe && data.recipientPubKey) {
              otherPubKey = data.recipientPubKey;
            } else if (!isMe && data.senderPubKey) {
              otherPubKey = data.senderPubKey;
            } else {
              // Fallback to profile (might be stale for old messages)
              if (otherUserId === selectedChat.otherUser?.uid) {
                otherPubKey = selectedChat.otherUser.publicKey || "";
              } else {
                const uDoc = await getDoc(doc(db, 'users', otherUserId));
                otherPubKey = uDoc.data()?.publicKey || "";
              }
            }
            
            if (otherPubKey && data.ciphertext && data.nonce) {
              text = await decryptShared(data.ciphertext, data.nonce, keys.privateKey, otherPubKey);
            }
          }
        }

        return {
          ...data,
          text,
          id: chatMsgDoc.id
        } as Message;
      }));
      setMessages(messagesData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${selectedChat.id}/messages`);
    });

    return () => unsubscribe();
  }, [selectedChat]);

  // Fetch users for starting new chat
  useEffect(() => {
    if (!showUserList) return;

    const q = query(collection(db, 'users'), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs
        .map(doc => ({ ...doc.data(), uid: doc.id }))
        .filter(u => u.uid !== user?.uid);
      setUsers(usersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, [showUserList, user]);

  const updateTypingStatus = async (isTyping: boolean) => {
    if (!selectedChat || !user) return;
    const chatRef = doc(db, 'chats', selectedChat.id);
    await setDoc(chatRef, {
      typing: {
        [user.uid]: isTyping
      }
    }, { merge: true });
  };

  const handleTyping = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    updateTypingStatus(true);

    typingTimeoutRef.current = setTimeout(() => {
      updateTypingStatus(false);
    }, 3000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // Increased to 10MB for video
        toast.error("File too large. Max 10MB.");
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearMedia = () => {
    setMediaPreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !selectedChat || !user) return;

    const text = newMessage;
    const file = selectedFile;
    
    setNewMessage('');
    clearMedia();
    updateTypingStatus(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      setUploading(true);
      let mediaUrl = '';
      let mediaType = '';

      if (file) {
        const fileToUpload = await compressImage(file, dataSaver);
        const storageRef = ref(storage, `chats/${selectedChat.id}/${Date.now()}_${fileToUpload.name}`);
        const uploadResult = await uploadBytes(storageRef, fileToUpload);
        mediaUrl = await getDownloadURL(uploadResult.ref);
        if (fileToUpload.type.startsWith('image/')) {
          mediaType = 'image';
        } else if (fileToUpload.type.startsWith('video/')) {
          mediaType = 'video';
        } else {
          mediaType = 'file';
        }
      }

      const chatRef = doc(db, 'chats', selectedChat.id);
      const messagesRef = collection(chatRef, 'messages');

      const messageData: any = {
        senderId: user.uid,
        createdAt: serverTimestamp()
      };

      if (text.trim()) {
        const otherUser = selectedChat.otherUser;

        if (otherUser?.publicKey && keys) {
          // Use shared secret encryption so both can read
          const { ciphertext, nonce } = await encryptShared(text, keys.privateKey, otherUser.publicKey);
          messageData.ciphertext = ciphertext;
          messageData.nonce = nonce;
          messageData.isEncrypted = true;
          messageData.text = "[Encrypted Content]"; 
          messageData.senderPubKey = keys.publicKey;
          messageData.recipientPubKey = otherUser.publicKey;
        } else {
          messageData.text = text;
        }
      }
      if (mediaUrl) {
        messageData.mediaUrl = mediaUrl;
        messageData.mediaType = mediaType;
      }

      await addDoc(messagesRef, messageData);

      await setDoc(chatRef, {
        lastMessage: mediaUrl ? (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📎 File') : text,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Trigger Push Notification
      const otherUserId = selectedChat.participants.find(id => id !== user.uid);
      if (otherUserId) {
        const otherUserDoc = await getDoc(doc(db, 'users', otherUserId));
        if (otherUserDoc.exists()) {
          const userData = otherUserDoc.data();
          // We only send push if user has tokens and is not currently online in the app
          if (userData.fcmTokens && userData.fcmTokens.length > 0 && !userData.isOnline) {
            try {
              await fetch('/api/send-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tokens: userData.fcmTokens,
                  title: `New message from ${profile?.displayName || user.displayName || 'Someone'}`,
                  body: mediaUrl ? (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📎 File') : text,
                  data: {
                    chatId: selectedChat.id,
                    senderId: user.uid,
                    type: 'chat_message'
                  }
                })
              });
            } catch (notifyErr) {
              console.error('Failed to send push notification:', notifyErr);
            }
          }
        }
      }

    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `chats/${selectedChat.id}/messages`);
    } finally {
      setUploading(false);
    }
  };

  const startNewChat = async (otherUser: any) => {
    if (!user) return;

    // Check if chat already exists
    const existingChat = chats.find(c => c.participants.includes(otherUser.uid));
    if (existingChat) {
      setSelectedChat(existingChat);
      setShowUserList(false);
      return;
    }

    try {
      const chatData = {
        participants: [user.uid, otherUser.uid],
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      };
      
      const chatRef = await addDoc(collection(db, 'chats'), chatData);
      setSelectedChat({
        id: chatRef.id,
        ...chatData,
        otherUser: {
          uid: otherUser.uid,
          displayName: otherUser.displayName,
          photoURL: otherUser.photoURL
        }
      } as Chat);
      setShowUserList(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
          <Send size={40} />
        </div>
        <h2 className="text-xl font-bold">Messages</h2>
        <p className="text-text-muted text-sm">Sign in to chat with friends and sellers.</p>
        <Button onClick={signIn} className="bg-primary hover:bg-emerald-700 text-white rounded-full px-8">Sign In</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-surface overflow-hidden">
      {/* Chat List */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 border-r border-border shrink-0`}>
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Chats</h1>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-8 w-8 p-0 rounded-full bg-emerald-50 text-primary"
              onClick={() => setShowUserList(true)}
            >
              <UserPlus size={18} />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
            <Input placeholder="Search messages..." className="pl-9 bg-slate-50 border-none text-sm h-9" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-text-muted text-xs italic">Loading chats...</div>
          ) : chats.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm text-text-muted">No conversations yet</p>
              <Button 
                variant="link" 
                className="text-primary text-xs"
                onClick={() => setShowUserList(true)}
              >
                Find someone to chat with
              </Button>
            </div>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className={`w-full p-4 flex gap-3 hover:bg-slate-50 transition-colors border-b border-border/50 ${selectedChat?.id === chat.id ? 'bg-emerald-50/50' : ''}`}
              >
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-slate-200 overflow-hidden">
                    {chat.otherUser?.photoURL ? (
                      <img src={chat.otherUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-primary font-bold">
                        {chat.otherUser?.displayName?.[0] || 'U'}
                      </div>
                    )}
                  </div>
                  {/* We would need to fetch real-time status for all users in the list for this to be perfect, 
                      but for now we'll just show it in the active chat view */}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <h3 className="font-bold text-[13px] truncate">{chat.otherUser?.displayName}</h3>
                      {chat.otherUser?.isVerified && <ShieldCheck size={12} className="text-primary fill-current" />}
                    </div>
                    <span className="text-[10px] text-text-muted">
                      {chat.lastMessageAt?.toDate ? chat.lastMessageAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted truncate">{chat.lastMessage || 'No messages yet'}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat View */}
      <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-col flex-1 bg-slate-50 relative`}>
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="p-3 bg-surface border-b border-border flex items-center justify-between shadow-sm z-10">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedChat(null)} className="md:hidden p-1 hover:bg-slate-100 rounded-full">
                  <ArrowLeft size={20} />
                </button>
                <div className="w-9 h-9 rounded-xl bg-slate-200 overflow-hidden">
                  {selectedChat.otherUser?.photoURL ? (
                    <img src={selectedChat.otherUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-primary font-bold">
                      {selectedChat.otherUser?.displayName?.[0] || 'U'}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <h3 className="font-bold text-[13px] leading-tight">{selectedChat.otherUser?.displayName}</h3>
                    {selectedChat.otherUser?.isVerified && <ShieldCheck size={12} className="text-primary fill-current" />}
                  </div>
                  <p className={`text-[10px] font-medium ${isOtherTyping ? 'text-primary animate-pulse' : otherUserStatus?.isOnline ? 'text-emerald-600' : 'text-text-muted'}`}>
                    {isOtherTyping ? 'typing...' : otherUserStatus?.isOnline ? 'Online' : otherUserStatus?.lastSeen ? `Last seen ${otherUserStatus.lastSeen.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Offline'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0 rounded-full text-primary" 
                  onClick={() => {
                    if (selectedChat.otherUser) {
                      startCall(selectedChat.otherUser, false);
                    }
                  }}
                >
                  <Phone size={18} />
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0 rounded-full text-primary" 
                  onClick={() => {
                    if (selectedChat.otherUser) {
                      startCall(selectedChat.otherUser, true);
                    }
                  }}
                >
                  <Video size={18} />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <p className="text-xs text-text-muted italic">No messages yet. Say hello!</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`max-w-[80%] flex flex-col ${msg.senderId === user.uid ? 'self-end items-end' : 'self-start items-start'}`}
                  >
                    <div className={`p-3 rounded-2xl text-[13px] shadow-sm ${
                      (msg as any).type === 'call_log'
                        ? 'bg-slate-100/50 border-slate-200 text-slate-600'
                        : msg.senderId === user.uid 
                          ? 'bg-primary text-white rounded-tr-none' 
                          : 'bg-surface text-text-main rounded-tl-none border border-border'
                    }`}>
                      {(msg as any).type === 'call_log' ? (
                        <div className="flex items-center gap-2">
                           {msg.text?.includes('Missed') ? <PhoneOff size={14} className="text-red-500" /> : <Phone size={14} className="text-slate-400" />}
                           <span className="font-bold text-[11px] uppercase tracking-wider">{msg.text}</span>
                        </div>
                      ) : (
                        <>
                          {msg.mediaUrl && (
                            <div className="mb-2">
                              {msg.mediaType === 'image' ? (
                                <img 
                                  src={msg.mediaUrl} 
                                  alt="Shared" 
                                  className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity" 
                                  referrerPolicy="no-referrer"
                                  onClick={() => window.open(msg.mediaUrl, '_blank')}
                                />
                              ) : msg.mediaType === 'video' ? (
                                <video 
                                  src={msg.mediaUrl} 
                                  controls 
                                  className="max-w-full rounded-lg"
                                />
                              ) : msg.mediaType === 'audio' ? (
                                <VoiceNotePlayer url={msg.mediaUrl} isOwn={msg.senderId === user.uid} />
                              ) : (
                                <a 
                                  href={msg.mediaUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 bg-black/5 rounded-lg hover:bg-black/10 transition-colors"
                                >
                                  <ImageIcon size={16} />
                                  <span className="underline truncate max-w-[150px]">View Attachment</span>
                                </a>
                              )}
                            </div>
                          )}
                          {msg.text}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1 px-1">
                      <span className="text-[9px] text-text-muted">
                        {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                      </span>
                      {msg.senderId === user.uid && (
                        <span className="text-primary">
                          <CheckCheck size={12} />
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Media Preview Area */}
            {mediaPreview && (
              <div className="px-4 py-2 bg-surface border-t border-border flex items-center gap-3">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-border bg-slate-50">
                  {selectedFile?.type.startsWith('image/') ? (
                    <img src={mediaPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : selectedFile?.type.startsWith('video/') || selectedFile?.name.endsWith('.webm') && !selectedFile.name.includes('audio') ? (
                    <video src={mediaPreview} className="w-full h-full object-cover" />
                  ) : selectedFile?.type.startsWith('audio/') || selectedFile?.name.includes('audio_message') ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-primary/10 text-primary">
                      <Mic size={24} />
                      <span className="text-[8px] font-bold mt-1">Audio</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={24} className="text-text-muted" />
                    </div>
                  )}
                  <button 
                    onClick={clearMedia}
                    className="absolute top-0.5 right-0.5 bg-black/50 text-white p-0.5 rounded-full hover:bg-black/70"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium truncate">{selectedFile?.name}</p>
                  <p className="text-[9px] text-text-muted">Ready to send</p>
                </div>
              </div>
            )}

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="p-3 bg-surface border-t border-border flex items-center gap-2">
              <div className="flex items-center gap-1">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*,video/*,application/pdf" 
                  onChange={handleFileSelect} 
                />
                <input 
                  type="file" 
                  ref={cameraInputRef} 
                  className="hidden" 
                  accept="image/*,video/*" 
                  capture="environment"
                  onChange={handleFileSelect} 
                />
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-9 w-9 p-0 rounded-xl text-text-muted hover:text-primary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon size={20} />
                </Button>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-9 w-9 p-0 rounded-xl text-text-muted hover:text-primary"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera size={20} />
                </Button>
              </div>
              
              {isRecordingAudio ? (
                  <div className="flex-grow flex items-center justify-between bg-emerald-50 rounded-2xl px-3 h-11 border border-primary/20 shadow-sm animate-in slide-in-from-bottom-2 duration-300 relative overflow-hidden max-w-[calc(100%-80px)]">
                    <div className="flex items-center gap-2 flex-1 overflow-hidden">
                      <div className="flex items-center gap-1.5 shrink-0">
                         <motion.div 
                          animate={{ opacity: isRecordingPaused ? 0.3 : [1, 0.4, 1] }} 
                          transition={{ repeat: isRecordingPaused ? 0 : Infinity, duration: 1 }}
                          className={`w-2.5 h-2.5 rounded-full ${isRecordingPaused ? 'bg-slate-400' : 'bg-red-500 shadow-sm shadow-red-500/40'}`} 
                         />
                         <span className="text-primary font-mono text-[12px] font-black tracking-tighter w-10">
                          {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:
                          {(recordingTime % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                      
                      <div className="flex-1 flex items-center gap-[2px] h-6 overflow-hidden max-w-[60px] sm:max-w-[100px] md:max-w-[150px]">
                        {audioLevels.slice(-10).map((lvl, i) => (
                          <motion.div 
                            key={`recording-bar-realtime-${i}`}
                            className="w-1 bg-primary rounded-full"
                            animate={{ height: `${lvl}%` }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                          />
                        ))}
                      </div>

                      {/* Slide gesture hint */}
                      {!isHandsFree && !isRecordingPaused && (
                        <motion.div 
                          animate={{ x: [0, -5, 0] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="flex ml-auto items-center gap-1 text-[9px] font-bold text-primary/40 uppercase tracking-tighter pointer-events-none whitespace-nowrap"
                        >
                           <ArrowLeft size={8} />
                           <span>Slide to cancel</span>
                        </motion.div>
                      )}
                    </div>

                    {isHandsFree && (
                      <div className="flex items-center gap-1 ml-1 pl-1 border-l border-primary/10">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          className="h-8 w-8 p-0 text-primary hover:bg-emerald-100 rounded-xl transition-colors"
                          onClick={isRecordingPaused ? resumeAudioRecording : pauseAudioRecording}
                        >
                          {isRecordingPaused ? <Mic size={18} /> : <Pause size={18} />}
                        </Button>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-100/50 rounded-xl transition-colors"
                          onClick={cancelAudioRecording}
                        >
                          <X size={18} />
                        </Button>
                      </div>
                    )}
                  </div>
              ) : (
                <Input
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                  }}
                  placeholder="Type a message..."
                  className="flex-1 bg-slate-100 border-none text-sm h-10 rounded-2xl focus-visible:ring-1 transition-all"
                />
              )}
              
              {(!newMessage.trim() && !selectedFile) ? (
                <div className="relative group">
                  <motion.div
                    whileTap={!isHandsFree ? { scale: 1.5, x: -10 } : {}}
                    className="relative z-10"
                    onPan={(e, info) => {
                      if (isRecordingAudio && !isHandsFree && info.offset.x < -80) {
                        cancelAudioRecording();
                        toast.error("Recording canceled", { duration: 1000 });
                        if ('vibrate' in navigator) navigator.vibrate([10, 10, 10]);
                      }
                    }}
                  >
                    <Button 
                      type="button"
                      onContextMenu={(e) => e.preventDefault()}
                      onMouseDown={(e) => {
                        if (!isRecordingAudio) {
                          e.preventDefault();
                          startAudioRecording();
                        }
                      }}
                      onMouseUp={(e) => {
                        if (isRecordingAudio && !isHandsFree) {
                          e.preventDefault();
                          stopAudioRecording();
                        }
                      }}
                      onTouchStart={(e) => {
                        if (!isRecordingAudio) {
                          e.preventDefault();
                          startAudioRecording();
                        }
                      }}
                      onTouchEnd={(e) => {
                        if (isRecordingAudio && !isHandsFree) {
                          e.preventDefault();
                          stopAudioRecording();
                        }
                      }}
                      className={`rounded-2xl w-10 h-10 p-0 shrink-0 border transition-all shadow-sm touch-none ${
                        isRecordingAudio 
                          ? 'bg-red-500 border-red-600 text-white animate-pulse' 
                          : 'bg-emerald-50 border-primary/20 text-primary hover:bg-emerald-100'
                      }`}
                    >
                      {isRecordingAudio ? <Send size={18} /> : <Mic size={18} />}
                    </Button>
                  </motion.div>
                  
                  {/* Subtle hint for holding */}
                  {!isRecordingAudio && (
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-bold uppercase tracking-widest shadow-lg">
                      Hold to record
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  <Button 
                    type="submit" 
                    disabled={(!newMessage.trim() && !selectedFile && !isRecordingAudio) || uploading}
                    className="bg-primary hover:bg-emerald-700 text-white rounded-2xl w-10 h-10 p-0 shrink-0 shadow-md transition-all active:scale-95"
                  >
                    {uploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </Button>
                </div>
              )}
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
              <MessageCircle size={40} />
            </div>
            <h3 className="text-lg font-bold">Select a chat</h3>
            <p className="text-text-muted text-sm max-w-xs">
              Choose a conversation from the list or start a new one with a friend or seller.
            </p>
            <Button 
              className="bg-primary text-white rounded-full px-6"
              onClick={() => setShowUserList(true)}
            >
              Start New Chat
            </Button>
          </div>
        )}

        {/* User List Modal */}
        {showUserList && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-bold text-sm uppercase tracking-wider">New Chat</h3>
                <button onClick={() => setShowUserList(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="p-3 border-b border-border">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" size={14} />
                  <Input 
                    placeholder="Search by name..." 
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="pl-9 bg-slate-50 border-none text-xs h-9 rounded-xl focus-visible:ring-1" 
                  />
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                {users.filter(u => u.displayName?.toLowerCase().includes(userSearchQuery.toLowerCase())).length === 0 ? (
                  <div className="p-8 text-center text-text-muted text-xs italic">No matching users found</div>
                ) : (
                  users
                    .filter(u => u.displayName?.toLowerCase().includes(userSearchQuery.toLowerCase()))
                    .map((u) => (
                      <button
                      key={`user-${u.uid}`}
                      onClick={() => startNewChat(u)}
                      className="w-full p-3 flex items-center gap-3 hover:bg-slate-50 rounded-2xl transition-colors"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-200 overflow-hidden">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-primary font-bold">
                            {u.displayName?.[0] || 'U'}
                          </div>
                        )}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold">{u.displayName}</p>
                        <p className="text-[10px] text-text-muted">{u.location || 'Malawi'}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
