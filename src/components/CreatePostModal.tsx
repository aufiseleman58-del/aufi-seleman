import React, { useState, useRef, useEffect } from 'react';
import { X, Image, MapPin, Users as UsersIcon, Loader2, Sparkles, Send, MapPin as MapPinIcon, Globe, Wand2, Video, Camera, Mic, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../AuthContext';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { moderateContent, generateCaption, generateImageFromPrompt } from '../lib/gemini';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useSettings } from '../SettingsContext';
import { compressImage } from '../lib/imageCompression';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const MAX_CHARS = 500;

export default function CreatePostModal({ isOpen, onClose, onSuccess }: CreatePostModalProps) {
  const { user, profile } = useAuth();
  const { dataSaver } = useSettings();
  const [content, setContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [location, setLocation] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [mentions, setMentions] = useState('');
  const [showMentionsInput, setShowMentionsInput] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  
  // Poll State
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<'video' | 'audio'>('video');
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [selectedAudio, setSelectedAudio] = useState<string | null>(null);
  const recordingVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [category, setCategory] = useState('General');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setContent('');
      setLocation('');
      setMentions('');
      setSelectedImage(null);
      setSelectedVideo(null);
      setSelectedAudio(null);
      setImageFile(null);
      setShowLocationInput(false);
      setShowMentionsInput(false);
      setShowImagePrompt(false);
      setImagePrompt('');
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingStream) recordingStream.getTracks().forEach(track => track.stop());
    };
  }, [recordingStream]);

  if (!isOpen) return null;

  const handlePost = async () => {
    if (!user) return;
    if (!content.trim()) return;

    setIsPosting(true);
    try {
      // AI Moderation
      const moderation = await moderateContent(content);
      if (!moderation.isSafe) {
        toast.error(`Post rejected: ${moderation.reason}`);
        setIsPosting(false);
        return;
      }

      let mediaUrl = null;
      if (imageFile) {
        const isVideo = imageFile.type.startsWith('video/');
        const fileToUpload = await compressImage(imageFile, dataSaver);
        const storageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${fileToUpload.name}`);
        const uploadTask = uploadBytesResumable(storageRef, fileToUpload);

        mediaUrl = await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            }, 
            (error) => {
              console.error("Upload error:", error);
              reject(error);
            }, 
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            }
          );
        });
      }

      const postRef = await addDoc(collection(db, 'posts'), {
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName,
        authorPhoto: profile?.photoURL || user.photoURL,
        authorVerified: profile?.isVerified || false,
        content: content.trim(),
        category,
        location: location.trim(),
        mentions: mentions.split(',').map(m => m.trim()).filter(m => m !== ''),
        media: mediaUrl ? [mediaUrl] : [],
        poll: showPollCreator && pollOptions.every(o => o.trim()) ? {
          options: pollOptions.map(o => ({ text: o.trim(), votes: 0 })),
          totalVotes: 0,
          votedIds: [],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week
        } : null,
        createdAt: serverTimestamp(),
        likesCount: 0,
        commentsCount: 0,
        viewsCount: 0,
        sharesCount: 0,
        isModerated: true,
        aiMetadata: {
          toxicityScore: moderation.toxicityScore,
          sentiment: moderation.sentiment,
          intent: moderation.intent
        }
      });

      // If it's a video, also add to the videos collection for Reels
      if (mediaUrl && (imageFile?.type.startsWith('video/') || selectedVideo)) {
        await addDoc(collection(db, 'videos'), {
          userId: user.uid,
          userName: profile?.displayName || user.displayName,
          userPhoto: profile?.photoURL || user.photoURL,
          caption: content.trim(),
          videoUrl: mediaUrl,
          likesCount: 0,
          commentsCount: 0,
          sharesCount: 0,
          createdAt: serverTimestamp(),
          postId: postRef.id // Link back to original post
        });
      }

      toast.success('Post shared successfully!');
      onSuccess?.();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'posts');
    } finally {
      setIsPosting(false);
    }
  };

  const startRecording = async (type: 'video' | 'audio') => {
    try {
      setRecordingType(type);
      const stream = await navigator.mediaDevices.getUserMedia(
        type === 'video' ? { video: { facingMode: 'user' }, audio: true } : { audio: true }
      );
      setRecordingStream(stream);
      
      if (type === 'video') {
        // Delay setting srcObject until ref is available (it renders conditionally)
        setTimeout(() => {
          if (recordingVideoRef.current) {
            recordingVideoRef.current.srcObject = stream;
          }
        }, 0);
      }

      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const mimeType = type === 'video' ? 'video/webm' : 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });
        const file = new File([blob], `recorded_${type}_${Date.now()}.webm`, { type: mimeType });
        
        setSelectedImage(null);
        if (type === 'video') {
          setSelectedAudio(null);
          setSelectedVideo(URL.createObjectURL(blob));
        } else {
          setSelectedVideo(null);
          setSelectedAudio(URL.createObjectURL(blob));
        }
        setImageFile(file);
        
        stream.getTracks().forEach(track => track.stop());
        setRecordingStream(null);
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error starting recording:", err);
      toast.error("Could not access camera/microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (recordingStream) {
      recordingStream.getTracks().forEach(track => track.stop());
      setRecordingStream(null);
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setMediaRecorder(null);
  };

  const handleGenerateAI = async () => {
    if (!content.trim() && !location.trim()) {
      toast.error("Type a topic or location for AI suggestions");
      return;
    }
    setIsGenerating(true);
    try {
      const topic = content || location || "a post about Malawi";
      const suggestions = await generateCaption(topic);
      if (suggestions && suggestions.length > 0) {
        setContent(suggestions[0]);
        toast.success("AI suggestion applied!");
      }
    } catch (error) {
      toast.error("AI failed to generate caption");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type.startsWith('video/')) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error("Video too large (max 20MB)");
          return;
        }
        setSelectedImage(null);
        setImageFile(file);
        setSelectedVideo(URL.createObjectURL(file));
      } else {
        if (file.size > 5 * 1024 * 1024) {
          toast.error("Image too large (max 5MB)");
          return;
        }
        setSelectedVideo(null);
        setImageFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setSelectedImage(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleGenerateMediaImage = async () => {
    if (!imagePrompt.trim()) {
      toast.error("Enter a prompt to generate an image.");
      return;
    }
    setIsGeneratingImage(true);
    try {
      const base64Image = await generateImageFromPrompt(imagePrompt);
      const res = await fetch(base64Image);
      const blob = await res.blob();
      const file = new File([blob], `generated_${Date.now()}.png`, { type: 'image/png' });
      
      setImageFile(file);
      setSelectedImage(base64Image);
      setSelectedVideo(null);
      setShowImagePrompt(false);
      setImagePrompt('');
      toast.success("Image generated successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate image.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const charsLeft = MAX_CHARS - content.length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] flex items-end md:items-center justify-center p-4">
      <motion.div 
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        className="bg-surface w-full max-w-lg rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="p-4 border-b border-border flex items-center justify-between bg-white shrink-0 sticky top-0 z-10">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-text-muted" />
          </button>
          <h3 className="font-bold text-sm uppercase tracking-[0.2em] text-text-main">Create Post</h3>
          <Button 
            onClick={handlePost}
            disabled={!content.trim() || isPosting || content.length > MAX_CHARS}
            className="bg-primary hover:bg-emerald-700 text-white rounded-full px-6 h-9 text-xs font-bold shadow-lg shadow-primary/20"
          >
            {isPosting ? <Loader2 className="animate-spin" size={16} /> : 'Post'}
          </Button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto scrollbar-hide">
          {isPosting && uploadProgress > 0 && uploadProgress < 100 && (
            <div className="bg-slate-50 p-3 rounded-2xl border border-border space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-primary">
                <span>Uploading Image...</span>
                <span>{Math.round(uploadProgress)}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadProgress}%` }}
                  className="h-full bg-primary"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-200 overflow-hidden shadow-inner border border-border">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-primary font-bold">{user?.displayName?.[0]}</div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-text-main">{user?.displayName}</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-lg text-[10px] font-bold text-primary border border-emerald-100">
                  <Globe size={10} />
                  <span>Public</span>
                </div>
                <select 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-slate-50 border border-border/50 rounded-lg text-[10px] font-bold text-text-muted px-2 py-0.5 focus:ring-0 outline-none"
                >
                  <option value="General">General</option>
                  <option value="News">News</option>
                  <option value="Agriculture">Agriculture</option>
                  <option value="Business">Business</option>
                  <option value="Tech">Tech</option>
                  <option value="Health">Health</option>
                  <option value="Jobs">Jobs</option>
                </select>
              </div>
            </div>
          </div>

          <div className="relative group">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's happening in Malawi?"
              className="w-full min-h-[180px] bg-transparent border-none focus:ring-0 text-xl resize-none placeholder:text-slate-300 font-medium"
              autoFocus
            />
            
            <div className="absolute bottom-2 right-2 flex items-center gap-3">
              <button 
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="flex items-center gap-1.5 text-[10px] font-bold text-primary bg-emerald-50 px-3 py-1.5 rounded-full border border-primary/20 hover:bg-emerald-100 transition-colors disabled:opacity-50"
              >
                {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                AI Suggestions
              </button>
              <span className={cn(
                "text-[10px] font-bold",
                charsLeft < 50 ? "text-red-500" : "text-text-muted opacity-50"
              )}>
                {charsLeft}
              </span>
            </div>
          </div>

          <AnimatePresence>
            {isRecording && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn("relative rounded-3xl overflow-hidden border border-border mt-2", recordingType === 'video' ? 'aspect-video bg-black' : 'bg-emerald-50 p-6 flex flex-col items-center justify-center min-h-[140px]')}
              >
                {recordingType === 'video' ? (
                  <video 
                    ref={recordingVideoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className="w-full h-full object-cover scale-x-[-1]" 
                  />
                ) : (
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center animate-pulse mb-4">
                    <Mic size={32} className="text-primary" />
                  </div>
                )}
                
                <div className={cn("absolute top-4 flex justify-between w-full px-4 items-center z-10", recordingType === 'audio' && 'top-2')}>
                  <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full", recordingType === 'video' ? 'bg-black/60 backdrop-blur-md' : 'bg-primary/10')}>
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                    <span className={cn("text-xs font-mono font-bold", recordingType === 'video' ? 'text-white' : 'text-primary')}>
                      {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:
                      {(recordingTime % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                  
                  <button 
                    onClick={cancelRecording}
                    className={cn("p-2 rounded-full transition-colors", recordingType === 'video' ? "bg-black/60 backdrop-blur-md text-white hover:bg-black/80" : "bg-red-50 text-red-500 hover:bg-red-100")}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className={cn("absolute bottom-6 w-full flex justify-center z-10", recordingType === 'audio' && 'bottom-2')}>
                  <button
                    onClick={stopRecording}
                    className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center border-4 border-white shadow-xl hover:bg-red-600 transition-colors"
                  >
                    <div className="w-6 h-6 bg-white rounded-sm" />
                  </button>
                </div>
              </motion.div>
            )}

            {selectedImage && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative aspect-video rounded-3xl overflow-hidden border border-border mt-2"
              >
                <img src={selectedImage} alt="Selected" className="w-full h-full object-cover shadow-2xl" />
                <button 
                  onClick={() => {
                    setSelectedImage(null);
                    setImageFile(null);
                  }}
                  className="absolute top-3 right-3 bg-black/40 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/60 transition-colors"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}

            {selectedVideo && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative aspect-video rounded-3xl overflow-hidden border border-border mt-2 bg-black"
              >
                <video src={selectedVideo} controls className="w-full h-full object-contain" />
                <button 
                  onClick={() => {
                    setSelectedVideo(null);
                    setImageFile(null);
                  }}
                  className="absolute top-3 right-3 z-10 bg-black/40 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/60 transition-colors"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}

            {selectedAudio && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative rounded-3xl overflow-hidden border border-border mt-2 bg-emerald-50 p-6 flex flex-col items-center"
              >
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4">
                  <Mic size={24} />
                </div>
                <audio src={selectedAudio} controls className="w-full max-w-sm" />
                <button 
                  onClick={() => {
                    setSelectedAudio(null);
                    setImageFile(null);
                  }}
                  className="absolute top-3 right-3 z-10 bg-white/80 backdrop-blur-sm text-text-muted p-2 rounded-full hover:bg-white transition-colors"
                >
                  <X size={16} />
                </button>
              </motion.div>
            )}

            {showImagePrompt && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-50 border border-emerald-200 p-3 rounded-2xl flex items-center gap-3 shadow-inner"
              >
                <Wand2 size={18} className="text-emerald-500" />
                <input 
                  type="text"
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Describe an image to generate..."
                  className="bg-transparent border-none focus:ring-0 text-sm flex-1 font-medium"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleGenerateMediaImage();
                    }
                  }}
                />
                {isGeneratingImage ? (
                  <Loader2 size={16} className="text-primary animate-spin" />
                ) : (
                  <button onClick={handleGenerateMediaImage} className="text-xs font-bold text-white bg-primary px-3 py-1.5 rounded-full hover:bg-emerald-700 active:scale-95 transition-all">
                    Generate
                  </button>
                )}
                <button onClick={() => { setShowImagePrompt(false); setImagePrompt(''); }} disabled={isGeneratingImage}>
                  <X size={16} className="text-text-muted" />
                </button>
              </motion.div>
            )}

            {showPollCreator && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-3xl space-y-3"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                    <TrendingUp size={12} /> Community Poll
                  </span>
                  <button onClick={() => { setShowPollCreator(false); setPollOptions(['', '']); }} className="text-text-muted hover:text-red-500">
                    <X size={16} />
                  </button>
                </div>
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input 
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const newOpts = [...pollOptions];
                        newOpts[idx] = e.target.value;
                        setPollOptions(newOpts);
                      }}
                      placeholder={`Option ${idx + 1}`}
                      className="bg-white border border-border/50 rounded-xl px-4 h-10 text-[13px] font-medium flex-1 focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    {pollOptions.length > 2 && (
                      <button 
                        onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                        className="p-2 text-text-muted hover:text-red-500"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 4 && (
                  <button 
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                  >
                    + Add Option
                  </button>
                )}
              </motion.div>
            )}

            {showLocationInput && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-50 border border-border p-3 rounded-2xl flex items-center gap-3 shadow-inner"
              >
                <MapPinIcon size={18} className="text-primary" />
                <input 
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Where are you? (e.g. Blantyre)"
                  className="bg-transparent border-none focus:ring-0 text-sm flex-1 font-medium"
                  autoFocus
                />
                <button onClick={() => { setShowLocationInput(false); setLocation(''); }}>
                  <X size={16} className="text-text-muted" />
                </button>
              </motion.div>
            )}

            {showMentionsInput && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-slate-50 border border-border p-3 rounded-2xl flex items-center gap-3 shadow-inner"
              >
                <UsersIcon size={18} className="text-blue-500" />
                <input 
                  type="text"
                  value={mentions}
                  onChange={(e) => setMentions(e.target.value)}
                  placeholder="Mention users (comma separated)..."
                  className="bg-transparent border-none focus:ring-0 text-sm flex-1 font-medium"
                  autoFocus
                />
                <button onClick={() => { setShowMentionsInput(false); setMentions(''); }}>
                  <X size={16} className="text-text-muted" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2 pt-4 border-t border-border mt-auto">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-slate-50 text-text-muted hover:bg-emerald-50 hover:text-primary rounded-2xl transition-all active:scale-90"
              title="Add Image or Video"
            >
              <Image size={22} />
            </button>
            <button 
              onClick={() => startRecording('video')}
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-90",
                isRecording && recordingType === 'video' ? "bg-red-50 text-red-500" : "bg-slate-50 text-text-muted hover:bg-red-50 hover:text-red-500"
              )}
              title="Record Video"
            >
              <Video size={22} />
            </button>
            <button 
              onClick={() => startRecording('audio')}
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-90",
                isRecording && recordingType === 'audio' ? "bg-emerald-100 text-primary" : "bg-slate-50 text-text-muted hover:bg-emerald-50 hover:text-primary"
              )}
              title="Record Voice Note"
            >
              <Mic size={22} />
            </button>
            <button 
              onClick={() => setShowImagePrompt(true)}
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-90",
                showImagePrompt ? "bg-emerald-50 text-primary" : "bg-slate-50 text-text-muted hover:bg-emerald-50 hover:text-primary"
              )}
              title="Generate AI Image"
            >
              <Wand2 size={22} />
            </button>
            <button 
              onClick={() => setShowLocationInput(true)}
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-90",
                showLocationInput ? "bg-emerald-50 text-primary" : "bg-slate-50 text-text-muted hover:bg-emerald-50 hover:text-primary"
              )}
              title="Add Location"
            >
              <MapPin size={22} />
            </button>
            <button 
              onClick={() => setShowMentionsInput(true)}
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-90",
                showMentionsInput ? "bg-blue-50 text-blue-500" : "bg-slate-50 text-text-muted hover:bg-blue-50 hover:text-blue-500"
              )}
              title="Mention People"
            >
              <UsersIcon size={22} />
            </button>
            
            <button 
              onClick={() => setShowPollCreator(true)}
              className={cn(
                "p-3 rounded-2xl transition-all active:scale-90",
                showPollCreator ? "bg-emerald-50 text-primary" : "bg-slate-50 text-text-muted hover:bg-emerald-50 hover:text-primary"
              )}
              title="Add Poll"
            >
              <TrendingUp size={22} />
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*,video/*" 
              onChange={handleImageSelect} 
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
