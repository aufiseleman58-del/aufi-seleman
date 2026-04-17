import React, { useState, useRef, useEffect } from 'react';
import { X, Image, MapPin, Loader2, Sparkles, DollarSign, Package, Tag, Globe, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '../AuthContext';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { moderateContent, generateMarketDescription, suggestMarketPrice } from '../lib/gemini';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';

interface CreateMarketListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORIES = ['Vehicles', 'Electronics', 'Property', 'Agriculture', 'Fashion', 'Home & Garden', 'Services', 'Other'];

export default function CreateMarketListingModal({ isOpen, onClose, onSuccess }: CreateMarketListingModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [location, setLocation] = useState('Malawi');
  const [category, setCategory] = useState('Other');
  const [isPosting, setIsPosting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSuggestingPrice, setIsSuggestingPrice] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedImages, setSelectedImages] = useState<{ url: string; file: File }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setDescription('');
      setPrice('');
      setLocation('Malawi');
      setCategory('Other');
      setSelectedImages([]);
      setUploadProgress(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerateDescription = async () => {
    if (!name.trim()) {
      toast.error("Enter item name first");
      return;
    }
    setIsGenerating(true);
    try {
      const desc = await generateMarketDescription(name, category);
      setDescription(desc);
      toast.success("AI Description generated!");
    } catch (error) {
      toast.error("AI failed to generate description");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSuggestPrice = async () => {
    if (!name.trim()) {
      toast.error("Enter item name first");
      return;
    }
    setIsSuggestingPrice(true);
    try {
      const suggestion = await suggestMarketPrice(name, category);
      setPrice(suggestion.minPrice.toString());
      toast.info(`AI suggests: MK ${suggestion.minPrice.toLocaleString()} - ${suggestion.maxPrice.toLocaleString()}`, {
        description: suggestion.reason,
      });
    } catch (error) {
      toast.error("AI failed to suggest price");
    } finally {
      setIsSuggestingPrice(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length + selectedImages.length > 5) {
      toast.error("Maximum 5 images allowed");
      return;
    }

    files.forEach((file: File) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`"${file.name}" is too large (max 5MB)`);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImages(prev => [...prev, { url: reader.result as string, file }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!user) return;
    if (!name.trim() || !price || isNaN(Number(price))) {
      toast.error("Please provide valid name and price");
      return;
    }

    setIsPosting(true);
    try {
      // AI Moderation for description
      if (description.trim()) {
        const moderation = await moderateContent(`${name} - ${description}`);
        if (!moderation.isSafe) {
          toast.error(`Listing rejected: ${moderation.reason}`);
          setIsPosting(false);
          return;
        }
      }

      const imageUrls: string[] = [];
      if (selectedImages.length > 0) {
        for (let i = 0; i < selectedImages.length; i++) {
          const { file } = selectedImages[i];
          const storageRef = ref(storage, `marketplace/${user.uid}/${Date.now()}_${i}_${file.name}`);
          const uploadTask = uploadBytesResumable(storageRef, file);

          const url = await new Promise<string>((resolve, reject) => {
            uploadTask.on('state_changed', 
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                // Average progress across all images
                setUploadProgress((prev) => (prev * i + progress) / (i + 1));
              }, 
              (error) => reject(error), 
              async () => {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadUrl);
              }
            );
          });
          imageUrls.push(url);
        }
      }

      await addDoc(collection(db, 'marketItems'), {
        sellerId: user.uid,
        sellerName: user.displayName,
        sellerPhoto: user.photoURL,
        name: name.trim(),
        description: description.trim(),
        price: Number(price),
        currency: 'MWK',
        location: location.trim(),
        category,
        images: imageUrls,
        status: 'active',
        isVerified: false,
        createdAt: serverTimestamp()
      });

      toast.success('Listing created successfully!');
      onSuccess?.();
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'marketItems');
    } finally {
      setIsPosting(false);
      setUploadProgress(0);
    }
  };

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
          <h3 className="font-bold text-sm uppercase tracking-[0.2em] text-text-main">List Item</h3>
          <Button 
            onClick={handlePost}
            disabled={!name.trim() || !price || isPosting}
            className="bg-primary hover:bg-emerald-700 text-white rounded-full px-6 h-9 text-xs font-bold shadow-lg shadow-primary/20"
          >
            {isPosting ? <Loader2 className="animate-spin" size={16} /> : 'List Now'}
          </Button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto scrollbar-hide">
          {isPosting && uploadProgress > 0 && uploadProgress < 100 && (
            <div className="bg-slate-50 p-3 rounded-2xl border border-border space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-primary">
                <span>Uploading Images...</span>
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

          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {selectedImages.map((img, index) => (
                <div key={index} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-border shrink-0">
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 bg-black/40 text-white p-1 rounded-full hover:bg-black/60"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {selectedImages.length < 5 && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-text-muted hover:border-primary hover:text-primary transition-all shrink-0"
                >
                  <Camera size={24} />
                  <span className="text-[9px] font-bold mt-1">Add Photo</span>
                </button>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              multiple 
              onChange={handleImageSelect} 
            />
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Package className="absolute left-3 top-3 text-text-muted" size={18} />
              <Input 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What are you selling?"
                className="pl-10 h-12 bg-slate-50 border-none rounded-2xl text-base font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <DollarSign className="absolute left-3 top-3 text-primary" size={18} />
                <Input 
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Price (MWK)"
                  className="pl-10 h-12 bg-slate-50 border-none rounded-2xl text-base font-bold text-primary"
                />
                <button 
                  onClick={handleSuggestPrice}
                  disabled={isSuggestingPrice}
                  className="absolute right-2 top-2 p-2 text-primary hover:bg-emerald-50 rounded-xl disabled:opacity-50"
                  title="Suggest Price"
                >
                  {isSuggestingPrice ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                </button>
              </div>
              <div className="relative">
                <Tag className="absolute left-3 top-3 text-text-muted" size={18} />
                <select 
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full pl-10 h-12 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 appearance-none"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="relative">
              <MapPin className="absolute left-3 top-3 text-text-muted" size={18} />
              <Input 
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location (e.g. Blantyre, Limbe)"
                className="pl-10 h-12 bg-slate-50 border-none rounded-2xl text-sm font-medium"
              />
            </div>

            <div className="relative">
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your item... (Mention condition, details, etc.)"
                className="w-full h-32 p-4 bg-slate-50 border-none rounded-2xl text-sm font-medium focus:ring-2 focus:ring-primary/20 resize-none pr-12"
              />
              <button 
                onClick={handleGenerateDescription}
                disabled={isGenerating}
                className="absolute right-3 bottom-3 p-2 bg-white text-primary border border-primary/20 hover:bg-emerald-50 rounded-xl shadow-sm disabled:opacity-50"
                title="AI Description"
              >
                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              </button>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-start gap-3">
            <Sparkles className="text-primary shrink-0" size={18} />
            <div>
              <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Seller Trust</p>
              <p className="text-[10px] text-emerald-700 leading-relaxed mt-0.5">
                Items with clear photos and detailed descriptions sell 3x faster. 
                Our AI actively monitors for scams in Malawi.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
