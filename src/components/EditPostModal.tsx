import React, { useState, useRef, useEffect } from 'react';
import { X, Image, MapPin, Users as UsersIcon, Loader2, Sparkles, Send, MapPin as MapPinIcon, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../AuthContext';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { moderateContent, generateCaption } from '../lib/gemini';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { useSettings } from '../SettingsContext';
import { compressImage } from '../lib/imageCompression';

interface EditPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: any;
  onSuccess?: () => void;
}

const MAX_CHARS = 500;

export default function EditPostModal({ isOpen, onClose, post, onSuccess }: EditPostModalProps) {
  const { user } = useAuth();
  const { dataSaver } = useSettings();
  const [content, setContent] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [location, setLocation] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [mentions, setMentions] = useState('');
  const [showMentionsInput, setShowMentionsInput] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [category, setCategory] = useState('General');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && post) {
      setContent(post.content || '');
      setLocation(post.location || '');
      setMentions(post.mentions?.join(', ') || '');
      setSelectedImage(post.media?.[0] || null);
      setCategory(post.category || 'General');
      setShowLocationInput(!!post.location);
      setShowMentionsInput(!!post.mentions?.length);
    }
  }, [isOpen, post]);

  if (!isOpen || !post) return null;

  const handleUpdate = async () => {
    if (!user) return;
    if (!content.trim()) return;

    setIsUpdating(true);
    try {
      // AI Moderation
      const moderation = await moderateContent(content);
      if (!moderation.isSafe) {
        toast.error(`Edit rejected: ${moderation.reason}`);
        setIsUpdating(false);
        return;
      }

      let imageUrl = selectedImage;
      if (imageFile) {
        const fileToUpload = await compressImage(imageFile, dataSaver);
        const storageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${fileToUpload.name}`);
        const uploadTask = uploadBytesResumable(storageRef, fileToUpload);

        imageUrl = await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
            }, 
            (error) => reject(error), 
            async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            }
          );
        });
      }

      await updateDoc(doc(db, 'posts', post.id), {
        content: content.trim(),
        category,
        location: location.trim(),
        mentions: mentions.split(',').map(m => m.trim()).filter(m => m !== ''),
        media: imageUrl ? [imageUrl] : [],
        updatedAt: serverTimestamp(),
        toxicityScore: moderation.toxicityScore,
        isModerated: true
      });

      toast.success('Post updated successfully!');
      onSuccess?.();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'posts');
    } finally {
      setIsUpdating(false);
    }
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
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image too large (max 5MB)");
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
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
          <h3 className="font-bold text-sm uppercase tracking-[0.2em] text-text-main">Edit Post</h3>
          <Button 
            onClick={handleUpdate}
            disabled={!content.trim() || isUpdating || content.length > MAX_CHARS}
            className="bg-primary hover:bg-emerald-700 text-white rounded-full px-6 h-9 text-xs font-bold shadow-lg shadow-primary/20"
          >
            {isUpdating ? <Loader2 className="animate-spin" size={16} /> : 'Save Changes'}
          </Button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto scrollbar-hide">
          {isUpdating && uploadProgress > 0 && uploadProgress < 100 && (
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
              title="Change Image"
            >
              <Image size={22} />
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
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handleImageSelect} 
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
