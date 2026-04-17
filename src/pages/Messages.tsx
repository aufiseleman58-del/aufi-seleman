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
import { Search, Send, Phone, Video, Info, ArrowLeft, Check, CheckCheck, MessageCircle, UserPlus, Image as ImageIcon, Camera, X, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

interface Message {
  id: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  senderId: string;
  createdAt: any;
}

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
  };
}

export default function Messages() {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showUserList, setShowUserList] = useState(false);
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
        let otherUser = { uid: otherUserId, displayName: 'User', photoURL: '', isVerified: false };
        if (otherUserId) {
          const userDoc = await getDoc(doc(db, 'users', otherUserId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            otherUser = {
              uid: otherUserId,
              displayName: userData.displayName || 'User',
              photoURL: userData.photoURL || '',
              isVerified: userData.isVerified || false
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
    });

    // Listen to chat for typing status
    const chatUnsubscribe = onSnapshot(doc(db, 'chats', selectedChat.id), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const typing = data.typing || {};
        setIsOtherTyping(typing[otherUserId] || false);
      }
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

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as Message[];
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
        const storageRef = ref(storage, `chats/${selectedChat.id}/${Date.now()}_${file.name}`);
        const uploadResult = await uploadBytes(storageRef, file);
        mediaUrl = await getDownloadURL(uploadResult.ref);
        if (file.type.startsWith('image/')) {
          mediaType = 'image';
        } else if (file.type.startsWith('video/')) {
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

      if (text.trim()) messageData.text = text;
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
        <Button className="bg-primary hover:bg-emerald-700 text-white rounded-full px-8">Sign In</Button>
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
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-primary">
                  <Phone size={18} />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full text-primary">
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
                      msg.senderId === user.uid 
                        ? 'bg-primary text-white rounded-tr-none' 
                        : 'bg-surface text-text-main rounded-tl-none border border-border'
                    }`}>
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
                  ) : selectedFile?.type.startsWith('video/') ? (
                    <video src={mediaPreview} className="w-full h-full object-cover" />
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
              <Input
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                placeholder="Type a message..."
                className="flex-1 bg-slate-50 border-none text-sm h-10 rounded-xl"
              />
              <Button 
                type="submit" 
                disabled={(!newMessage.trim() && !selectedFile) || uploading}
                className="bg-primary hover:bg-emerald-700 text-white rounded-xl w-10 h-10 p-0 shrink-0 shadow-md"
              >
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </Button>
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
              <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                {users.length === 0 ? (
                  <div className="p-8 text-center text-text-muted text-xs italic">No other users found</div>
                ) : (
                  users.map((u) => (
                    <button
                      key={u.uid}
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
