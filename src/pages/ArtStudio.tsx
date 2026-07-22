import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { generateImageFromPrompt, generateImageWithSourceImage, aiChatAssistant } from '../lib/gemini';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Loader2, Download, Share2, Sparkles, Wand2, History, 
  Trash2, Camera, Image as ImageIcon, Save, CheckCircle2, 
  Maximize2, Sliders, Layout, Zap, Layers, RefreshCw,
  Plus, ChevronRight, Share, MoreHorizontal, Settings2,
  Brush, Palette, Type, ShieldCheck, Copy, X, ChevronUp, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import JSZip from 'jszip';

interface ArtHistory {
  id: string;
  prompt: string;
  imageUrl: string;
  createdAt: any;
  style: string;
  aspectRatio: string;
}

const STYLES = [
  { id: 'realistic', name: 'Ultra Realistic', icon: '📸', desc: 'Photorealistic textures' },
  { id: 'cyberpunk', name: 'Neon Cyberpunk', icon: '🌃', desc: 'Futuristic glow' },
  { id: 'render', name: '3D Octane Render', icon: '💎', desc: 'Professional CGI look' },
  { id: 'anime', name: 'Studio Ghibli', icon: '🎨', desc: 'Hand-drawn anime' },
  { id: 'oil', name: 'Impressionist Oil', icon: '🖌️', desc: 'Classic canvas texture' },
  { id: 'abstract', name: 'Vibrant Abstract', icon: '💫', desc: 'Fluid color & shape' },
  { id: 'sketch', name: 'Charcoal Sketch', icon: '✏️', desc: 'Monochrome hand-drawn' },
  { id: 'pixel', name: '8-Bit Retro', icon: '🕹️', desc: 'Vintage gaming vibe' }
];

const ASPECT_RATIOS = [
  { id: '1:1', label: 'Square', icon: 'Square' },
  { id: '9:16', label: 'Story', icon: 'Smartphone' },
  { id: '16:9', label: 'Widescreen', icon: 'Monitor' },
  { id: '4:5', label: 'Portrait', icon: 'RectangleVertical' }
];

const PROMPT_TEMPLATES = [
  { text: "🌅 Cape Maclear", prompt: "A floating market in Cape Maclear, high-detailed oil painting, warm golden hour sun glowing on lake water, serene vibe" },
  { text: "🏔️ Mulanje peak", prompt: "Surreal tea estate of Mulanje, massive majestic mountains rising behind misty emerald tea fields, fantasy landscape" },
  { text: "🌃 Lilongwe Neon", prompt: "A cyberpunk street in Lilongwe, neon signs, glowing hologram displays, hovercrafts, highly detailed octane render" },
  { text: "🦒 Future Safari", prompt: "Futuristic wildlife safari with cybernetic animals, solar-punk landscape, clean golden sunset rendering" }
];

const MODIFIERS = [
  { id: 'cinematic', label: '🎬 Cinematic', text: 'dramatic cinematic side-lighting, volumetric depth' },
  { id: 'volumetric', label: '💨 Fog/Mist', text: 'soft volumetric foggy mist atmospheric background' },
  { id: 'hyper', label: '🔍 Ultra Detail', text: 'highly polished, insanely detailed 8k render, hyperreal texture' },
  { id: 'raytrace', label: '⚡ Raytraced', text: 'masterpiece rendering with realistic shadows and raytraced reflections' }
];

const FILTER_PRESETS = [
  { id: 'raw', name: 'Raw Engine', filter: 'brightness(100%) contrast(100%) saturate(100%)', label: '🚫 Raw' },
  { id: 'emerald', name: 'Emerald Glow', filter: 'brightness(105%) contrast(108%) saturate(140%) hue-rotate(15deg)', label: '🟢 Emerald' },
  { id: 'sepia', name: 'Retro Sepia', filter: 'brightness(95%) contrast(105%) saturate(85%) sepia(40%)', label: '🟤 Sepia' },
  { id: 'cyber', name: 'Cyber City', filter: 'brightness(105%) contrast(120%) saturate(155%) hue-rotate(315deg)', label: '🔵 Cyber' },
  { id: 'noir', name: 'Noir Classic', filter: 'brightness(100%) contrast(135%) grayscale(100%)', label: '⚫ Noir' }
];

const CREATIVE_TAGS = [
  { text: "✨ Golden Hour", value: ", warm golden hour sun glowing, dramatic setting rays" },
  { text: "🕯️ Cyberpunk Neon", value: ", neon lights reflection, cinematic glow, retro futuristic cyber tech" },
  { text: "🌊 Unreal Engine 5", value: ", hyperrealistic detail, octane render, 8k resolution, volumetric depth" },
  { text: "🎨 Studio Lighting", value: ", professional art lighting, high-contrast chiaroscuro, volumetric shadows" },
  { text: "🌄 Vintage Canvas", value: ", classic hand-painted canvas texture, delicate palette strokes" },
  { text: "📐 Minimal Isometric", value: ", isometric architectural drawing, soft clean color palette, clean vector style" }
];

const RANDOM_PROMPTS = [
  "A majestic glowing waterfall in Zomba Plateau, ancient tree trunks covered in neon moss, hyperrealistic oil canvas, 8k render, golden sunset reflection",
  "A high-tech tea estate on the slopes of Mount Mulanje, clean modern solar harvesters, misty emerald mountain tops, detailed Studio Ghibli visual vibe",
  "A hyper-detailed portrait of an elderly carver in Mumuni village, carving a pulsing holographic wooden mask, cinematic face shading, volumetric dust particles",
  "Serene futuristic beach scene in Cape Maclear at midnight, glowing bio-luminescent lake water, floating solar sailboat, cosmic nebula sky reflecting on water",
  "A buzzing vibrant futuristic market in Blantyre, modern clean geometric wooden stalls, glowing fiber-optic textiles, high-vibrant watercolor detail",
  "An ancient clay castle nestled in the red earth of Balaka, huge rings of solar arrays crowning the turrets, surreal retro fantasy illustration, octane render"
];

export default function ArtStudio() {
  const { user, profile } = useAuth();
  const { darkMode } = useSettings();
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<ArtHistory[]>(() => {
    try {
      const saved = localStorage.getItem('zathu_art_studio_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('zathu_art_studio_history', JSON.stringify(history));
    } catch (e) {
      console.error('Failed to save art studio history:', e);
    }
  }, [history]);
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0].id);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [activeTab, setActiveTab] = useState<'create' | 'gallery'>('create');
  const [advancedMode, setAdvancedMode] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedFilterPreset, setSelectedFilterPreset] = useState('raw');
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  
  // Selection & Zip Export States
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleExportZip = async () => {
    if (selectedIds.length === 0) {
      toast.error("Please select at least one image to export");
      return;
    }
    setIsExporting(true);
    const zip = new JSZip();
    let successCount = 0;
    
    const selectedItems = history.filter(item => selectedIds.includes(item.id));
    
    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      try {
        const url = item.imageUrl;
        let ext = 'png';
        
        if (url.startsWith('data:')) {
          const match = url.match(/^data:([^;]+);base64,(.*)$/);
          if (match && match.length === 3) {
            const mimeType = match[1];
            const base64Data = match[2];
            ext = mimeType.split('/')[1]?.split('+')[0] || 'png';
            zip.file(`zathu-vault-art-${item.id}.${ext}`, base64Data, { base64: true });
            successCount++;
          } else if (url.startsWith('data:image/svg+xml,')) {
            const svgContent = decodeURIComponent(url.substring('data:image/svg+xml,'.length));
            zip.file(`zathu-vault-art-${item.id}.svg`, svgContent);
            successCount++;
          }
        } else {
          // Standard fetching
          const response = await fetch(url);
          const blob = await response.blob();
          const contentType = blob.type || response.headers.get('content-type') || '';
          ext = contentType.split('/')[1] || 'png';
          zip.file(`zathu-vault-art-${item.id}.${ext}`, blob);
          successCount++;
        }
      } catch (err) {
        console.error(`Failed to add image ${item.id} to zip:`, err);
      }
    }
    
    if (successCount > 0) {
      try {
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `zathu-neural-vault-export-${Date.now()}.zip`;
        link.click();
        toast.success(`Successfully exported ${successCount} images inside a ZIP folder!`);
        setSelectedIds([]);
        setIsSelectionMode(false);
      } catch (err) {
        console.error("Failed to generate zip file:", err);
        toast.error("Failed to generate zip file. Please try again.");
      }
    } else {
      toast.error("Could not fetch or prepare any of the selected images.");
    }
    setIsExporting(false);
  };
  
  // Camera & Style Transfer States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('checking');
  
  // Canvas Filter States
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  const checkCameraPermission = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      setCameraPermission('denied');
      return;
    }

    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
        setCameraPermission(status.state as 'prompt' | 'granted' | 'denied');
        status.onchange = () => {
          setCameraPermission(status.state as 'prompt' | 'granted' | 'denied');
        };
        return;
      }
    } catch (e) {
      console.warn("navigator.permissions.query not fully supported in this browser environment:", e);
    }

    // Fallback based on device labels or localStorage
    try {
      const devicesList = await navigator.mediaDevices.enumerateDevices();
      const hasLabels = devicesList.some(d => d.kind === 'videoinput' && d.label);
      if (hasLabels) {
        setCameraPermission('granted');
        localStorage.setItem('camera_permission_granted', 'true');
      } else {
        const saved = localStorage.getItem('camera_permission_granted');
        if (saved === 'true') {
          setCameraPermission('granted');
        } else if (saved === 'false') {
          setCameraPermission('denied');
        } else {
          setCameraPermission('prompt');
        }
      }
    } catch (err) {
      setCameraPermission('prompt');
    }
  };

  useEffect(() => {
    checkCameraPermission();
  }, []);

  // Find camera devices
  const getCameraDevices = async () => {
    try {
      // Ensure we have permissions first so we can read device labels
      await navigator.mediaDevices.getUserMedia({ video: true }).then((s) => {
        s.getTracks().forEach(t => t.stop());
      }).catch(() => {});

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
      setDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.warn("Could not list video inputs: ", err);
    }
  };

  const startCamera = async () => {
    try {
      setIsCameraOpen(true);
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      const constraints: MediaStreamConstraints = {
        video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : { facingMode: 'user' }
      };
      setCameraPermission('checking');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(stream);
      setCameraPermission('granted');
      localStorage.setItem('camera_permission_granted', 'true');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      await getCameraDevices();
    } catch (err: any) {
      console.error(err);
      setCameraPermission('denied');
      localStorage.setItem('camera_permission_granted', 'false');
      toast.error('Could not access camera feed. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
    checkCameraPermission();
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setCapturedImage(dataUrl);
        stopCamera();
        toast.success('Source image captured for style transfer');
      }
    }
  };

  useEffect(() => {
    if (isCameraOpen && selectedCameraId) {
      startCamera();
    }
  }, [selectedCameraId]);

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const polishPrompt = async () => {
    if (!prompt.trim()) return;
    setIsPolishing(true);
    try {
      const result = await aiChatAssistant(
        `Improve the following image generation prompt to be more descriptive, artistic, and effective for high-quality image generation. Focus on lighting, texture, and composition details. Original Prompt: "${prompt}". Respond ONLY with the polished prompt text. No conversational filler.`,
        []
      );
      setPrompt(result.replace(/^"|"$/g, ''));
      toast.success('Prompt Neural-Enhanced!');
    } catch (error) {
       toast.error('Neural mesh failed to polish');
    } finally {
      setIsPolishing(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Initiate neural bridge with a valid description');
      return;
    }

    setIsDrawerOpen(false);
    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const modifierTexts = selectedModifiers
        .map(id => MODIFIERS.find(m => m.id === id)?.text)
        .filter(Boolean);
      const modifierString = modifierTexts.length > 0 ? modifierTexts.join(', ') : '';
      const basePrompt = modifierString ? `${prompt} (${modifierString})` : prompt;

      const styleObj = STYLES.find(s => s.id === selectedStyle);
      const fullPrompt = capturedImage
        ? `Perform art style transfer feedback. Blend the core visual subject matter from this parsed source image, keeping its general geometry and composition, and transfer the exact style/textures/lighting of are of "${styleObj?.name}" style. Incorporate these additional style prompts and scene descriptions: "${basePrompt}". ${advancedMode && negativePrompt ? `Avoid: ${negativePrompt}.` : ''} Output a beautiful, flawless masterwork blending the captured image and art style.`
        : `${styleObj?.name} style. ${basePrompt}. ${advancedMode && negativePrompt ? `Avoid: ${negativePrompt}.` : ''} Ultra high quality, masterwork, detailed, ${aspectRatio} aspect ratio.`;
      
      const imageUrl = capturedImage 
        ? await generateImageWithSourceImage(fullPrompt, capturedImage)
        : await generateImageFromPrompt(fullPrompt);
        
      setGeneratedImage(imageUrl);
      
      const newEntry: ArtHistory = {
        id: Math.random().toString(36).substr(2, 9),
        prompt,
        imageUrl,
        createdAt: new Date(),
        style: selectedStyle,
        aspectRatio
      };
      setHistory([newEntry, ...history.slice(0, 19)]);
      
      toast.success('Visual Manifestation Complete');
    } catch (error) {
      console.error(error);
      toast.error('Neural Link Severed: Model generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const getResolutionString = (aspect: string) => {
    switch (aspect) {
      case '9:16': return '1152 x 2048 px';
      case '16:9': return '2048 x 1152 px';
      case '4:5': return '1638 x 2048 px';
      case '1:1':
      default: return '2048 x 2048 px';
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    
    toast.info('Synthesizing artwork with aesthetic adjustments...');
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Apply canvas filters corresponding to brightness, contrast, saturation, and selected preset
          const presetObj = FILTER_PRESETS.find(p => p.id === selectedFilterPreset);
          const presetFilter = presetObj && presetObj.id !== 'raw' ? presetObj.filter : '';
          ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) ${presetFilter}`;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          const dataUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = `zathu-neural-art-${Date.now()}.png`;
          link.click();
          toast.success('HD Artpiece with filter adjustments successfully exported!');
        } else {
          throw new Error('Canvas context unavailable');
        }
      } catch (e) {
        console.error("Filter synthesis failed, falling back to raw export: ", e);
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `zathu-neural-art-raw-${Date.now()}.png`;
        link.click();
        toast.success('HD Artpiece exported!');
      }
    };
    img.onerror = () => {
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = `zathu-neural-art-${Date.now()}.png`;
      link.click();
      toast.success('HD Artpiece exported!');
    };
    img.src = generatedImage;
  };

  const handleShareAsPost = async () => {
    if (!generatedImage || !user) return;
    
    setIsSharing(true);
    setUploadProgress(0);

    try {
      let mediaUrl = generatedImage;

      if (generatedImage.startsWith('data:')) {
        const res = await fetch(generatedImage);
        const blob = await res.blob();
        const file = new File([blob], `zathu_art_${Date.now()}.png`, { type: 'image/png' });
        const storageRef = ref(storage, `posts/${user.uid}/art_studio_${Date.now()}.png`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        mediaUrl = await new Promise((resolve, reject) => {
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

      await addDoc(collection(db, 'posts'), {
        authorId: user.uid,
        authorName: profile?.displayName || user.displayName || 'Anonymous',
        authorPhoto: profile?.photoURL || user.photoURL || '',
        authorVerified: profile?.isVerified || false,
        content: `Created this in Zathu Art Studio: "${prompt}" #ZathuNeuralArt #ZathuAI`,
        media: [mediaUrl],
        likesCount: 0,
        commentsCount: 0,
        sharesCount: 0,
        viewsCount: 0,
        createdAt: serverTimestamp(),
        category: 'Art',
        isModerated: true
      });
      toast.success('Artifact shared with community');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'posts');
      toast.error('Failed to share post');
    } finally {
      setIsSharing(false);
    }
  };

  const remixHistory = (item: ArtHistory) => {
    setPrompt(item.prompt);
    setSelectedStyle(item.style);
    setAspectRatio(item.aspectRatio);
    setGeneratedImage(item.imageUrl);
    setSelectedFilterPreset('raw');
    setActiveTab('create');
    toast.info('Seed loaded from history: image and parameters loaded into editor');
  };

  const getCombinedFilterStyle = () => {
    const preset = FILTER_PRESETS.find(p => p.id === selectedFilterPreset);
    const presetFilter = preset && preset.id !== 'raw' ? preset.filter : '';
    return {
      filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) ${presetFilter}`
    };
  };

  return (
    <div className={cn(
      "min-h-full flex flex-col font-sans transition-all duration-500 relative overflow-hidden",
      darkMode 
        ? "bg-slate-950 text-slate-100 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.07)_0%,rgba(15,23,42,1)_50%,rgba(2,6,23,1)_100%)]" 
        : "bg-slate-50 text-slate-900 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.05)_0%,rgba(248,250,252,1)_60%,rgba(241,245,249,1)_100%)]"
    )}>
      {/* Decorative background grid and orbs for state-of-the-art styling */}
      <div className={cn(
        "absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none opacity-80 z-0",
        darkMode ? "[mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_100%)]" : "[mask-image:radial-gradient(ellipse_at_center,black_80%,transparent_100%)]"
      )} />
      
      {/* Ambient background glowing orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none animate-pulse z-0" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-primary/5 blur-[100px] pointer-events-none animate-pulse z-0" style={{ animationDuration: '12s' }} />

      <div className={cn(
        "p-4 md:p-6 border-b flex items-center justify-between sticky top-0 backdrop-blur-md z-45 transition-colors shadow-sm",
        darkMode ? "bg-slate-950/70 border-white/5 shadow-black/10" : "bg-white/70 border-slate-200/60 shadow-slate-100"
      )}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-tr from-primary/30 to-emerald-400/20 text-primary rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-primary/30 animate-pulse" style={{ animationDuration: '4s' }}>
            <Sparkles size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight transition-colors">Art Studio</h1>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Malawian Neural Node v4.0</p>
          </div>
        </div>
        <div className={cn(
          "flex p-1 rounded-2xl border transition-colors relative z-10",
          darkMode ? "bg-slate-900/60 border-white/5" : "bg-slate-100/80 border-slate-200/80"
        )}>
          <button 
            onClick={() => setActiveTab('create')} 
            className={cn(
              "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 cursor-pointer", 
              activeTab === 'create' 
                ? "bg-gradient-to-r from-primary to-emerald-500 text-white shadow-lg shadow-primary/25" 
                : darkMode ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-white/60"
            )}
          >
            Studio
          </button>
          <button 
            onClick={() => setActiveTab('gallery')} 
            className={cn(
              "px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 active:scale-95 cursor-pointer", 
              activeTab === 'gallery' 
                ? "bg-gradient-to-r from-primary to-emerald-500 text-white shadow-lg shadow-primary/25" 
                : darkMode ? "text-slate-400 hover:text-white hover:bg-white/5" : "text-slate-500 hover:text-slate-900 hover:bg-white/60"
            )}
          >
            Vault
          </button>
        </div>
      </div>

      <div className="pb-28 md:pb-8 relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'create' ? (
            <motion.div 
              key="create" 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }} 
              exit={{ opacity: 0, y: -10 }} 
              className="p-4 md:p-8 max-w-4xl mx-auto space-y-8"
            >
              <div className="space-y-6">
                <div className={cn(
                  "aspect-square md:aspect-video w-full rounded-[2.5rem] overflow-hidden border-2 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] relative group transition-all duration-500",
                  darkMode 
                    ? "bg-gradient-to-b from-slate-900/80 to-slate-950/80 border-white/10 shadow-black/40 ring-1 ring-white/5" 
                    : "bg-gradient-to-b from-slate-50 to-slate-100 border-slate-200 shadow-slate-200/60"
                )}>
                  {/* Digital Viewfinder Framing Corners Overlay */}
                  <div className="absolute top-6 left-6 w-5 h-5 border-t-2 border-l-2 border-primary/30 rounded-tl-md pointer-events-none group-hover:scale-105 transition-transform duration-500 z-10" />
                  <div className="absolute top-6 right-6 w-5 h-5 border-t-2 border-r-2 border-primary/30 rounded-tr-md pointer-events-none group-hover:scale-105 transition-transform duration-500 z-10" />
                  <div className="absolute bottom-6 left-6 w-5 h-5 border-b-2 border-l-2 border-primary/30 rounded-bl-md pointer-events-none group-hover:scale-105 transition-transform duration-500 z-10" />
                  <div className="absolute bottom-6 right-6 w-5 h-5 border-b-2 border-r-2 border-primary/30 rounded-br-md pointer-events-none group-hover:scale-105 transition-transform duration-500 z-10" />

                  {generatedImage ? (
                    <div className="w-full h-full relative">
                      <img src={generatedImage} alt="Generated" className="w-full h-full object-cover transition-all" style={getCombinedFilterStyle()} />
                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-all p-6 flex flex-col justify-end backdrop-blur-[2px]">
                         <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                               <Button onClick={handleDownload} variant="secondary" className="h-10 rounded-xl bg-white/10 backdrop-blur-md text-white border-white/10 hover:bg-white/20">
                                 <Download size={16} />
                               </Button>
                               <Button onClick={handleShareAsPost} disabled={isSharing} className="h-10 px-6 rounded-xl bg-primary hover:bg-emerald-600 font-black text-[10px] uppercase tracking-widest shadow-lg shadow-primary/20">
                                 {isSharing ? <Loader2 size={14} className="animate-spin mr-2" /> : <Share2 size={14} className="mr-2" />}
                                 Project Artifact
                               </Button>
                            </div>
                            <Button onClick={() => setGeneratedImage(null)} variant="ghost" className="h-10 w-10 p-0 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20">
                               <Trash2 size={18} />
                            </Button>
                         </div>
                      </div>
                    </div>
                  ) : isGenerating ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.15)_0%,transparent_70%)] relative">
                       {/* Animated scan line */}
                       <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_49%,rgba(16,185,129,0.1)_50%,transparent_51%)] bg-[size:100%_12px] animate-pulse" />
                       <div className="relative">
                          <div className="absolute inset-0 rounded-full blur-xl bg-primary/30 animate-ping opacity-40" />
                          <Loader2 size={64} className="text-primary animate-spin mb-6 relative z-10" />
                       </div>
                       <div className="text-center relative z-10">
                          <p className="text-sm font-black uppercase tracking-[0.5em] bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent animate-pulse">Neural Forge Active</p>
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-2.5 font-semibold">Synthesizing local Malawian creative nodes...</p>
                       </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-6 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08)_0%,transparent_75%)] relative">
                       <div className={cn(
                          "w-24 h-24 rounded-[2rem] border-[3px] border-dashed flex items-center justify-center transition-all bg-gradient-to-tr",
                          darkMode ? "border-white/10 from-slate-900 to-slate-950 text-slate-700" : "border-slate-200 from-slate-50 to-slate-100 text-slate-400"
                       )}>
                          <ImageIcon size={38} className="animate-pulse" style={{ animationDuration: '3s' }} />
                       </div>
                       <div className="text-center px-4">
                          <p className={cn("text-[11px] font-black uppercase tracking-[0.4em]", darkMode ? "text-slate-400" : "text-slate-600")}>Empty Neural Container</p>
                          <p className={cn("text-[10px] uppercase font-semibold mt-2 max-w-xs mx-auto leading-relaxed", darkMode ? "text-slate-600" : "text-slate-400")}>Describe your custom vision below to manifest a digital masterwork</p>
                       </div>
                       {/* Grid ambient detail */}
                       <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between text-[8px] font-mono opacity-25">
                         <span>NODE_ID::ZATHU_01</span>
                         <span>SYS_STABLE_100%</span>
                       </div>
                    </div>
                  )}
                </div>

                {generatedImage && (
                  <div className="flex justify-center">
                    <Button
                      id="save-to-device-button"
                      onClick={handleDownload}
                      className="w-full md:w-auto bg-gradient-to-r from-emerald-500 to-primary hover:from-emerald-600 hover:to-emerald-500 text-white font-black text-xs uppercase tracking-widest py-3.5 px-8 rounded-2xl shadow-xl shadow-primary/10 hover:shadow-primary/20 transition-all duration-300 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Download size={16} className="animate-bounce" style={{ animationDuration: '2s' }} />
                      Save to Device
                    </Button>
                  </div>
                )}

                {/* Micro Workflow Pipeline Deck */}
                <div className={cn(
                  "grid grid-cols-2 md:grid-cols-4 gap-4 p-5 rounded-3xl border transition-colors shadow-inner select-none",
                  darkMode ? "bg-slate-900/30 border-white/5" : "bg-slate-100/50 border-slate-200/60"
                )}>
                  <div className="flex items-center gap-2.5 px-1">
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      prompt.trim() ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500"
                    )} />
                    <div className="text-[9px] uppercase leading-tight font-black">
                      <span className="text-slate-400 dark:text-slate-500 block font-black uppercase text-[8px] tracking-wider mb-0.5">Step 1: Description</span>
                      {prompt.trim() ? "Active & Configured" : "Awaiting Input"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 px-1 border-t md:border-t-0 md:border-l border-slate-200/10 dark:border-white/5 pt-2.5 md:pt-0">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] shrink-0" />
                    <div className="text-[9px] uppercase leading-tight font-black">
                      <span className="text-slate-400 dark:text-slate-500 block font-black uppercase text-[8px] tracking-wider mb-0.5">Step 2: Creative Style</span>
                      {STYLES.find(s => s.id === selectedStyle)?.name || 'Custom style'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 px-1 border-t md:border-t-0 md:border-l border-slate-200/10 dark:border-white/5 pt-2.5 md:pt-0">
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      capturedImage ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" : "bg-slate-400/30"
                    )} />
                    <div className="text-[9px] uppercase leading-tight font-black">
                      <span className="text-slate-400 dark:text-slate-500 block font-black uppercase text-[8px] tracking-wider mb-0.5">Step 3: Source Blend</span>
                      {capturedImage ? "Camera Snapshot Tied" : "Disabled (Pure AI)"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 px-1 border-t md:border-t-0 md:border-l border-slate-200/10 dark:border-white/5 pt-2.5 md:pt-0">
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      isGenerating ? "bg-emerald-500 animate-ping" : "bg-slate-400/30"
                    )} />
                    <div className="text-[9px] uppercase leading-tight font-black">
                      <span className="text-slate-400 dark:text-slate-500 block font-black uppercase text-[8px] tracking-wider mb-0.5">Step 4: Creation State</span>
                      {isGenerating ? "Forging Active" : generatedImage ? "Manifested" : "Standby Target"}
                    </div>
                  </div>
                </div>

                {generatedImage && (
                  <div className={cn(
                    "p-6 rounded-[2rem] border flex flex-col sm:flex-row items-center justify-between gap-6 transition-colors shadow-xl",
                    darkMode ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-200"
                  )}>
                    <div className="text-center sm:text-left space-y-1">
                       <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Artwork Export Matrix</p>
                       <p className={cn("text-[10px] font-mono", darkMode ? "text-slate-400" : "text-slate-500")}>
                         Resolution: <span className="text-primary font-bold">{getResolutionString(aspectRatio)}</span> ({aspectRatio}) • Format: <span className="text-primary font-bold">Lossless PNG</span>
                       </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                       <Button 
                         onClick={handleDownload} 
                         className="bg-primary hover:bg-emerald-600 rounded-2xl h-11 px-6 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group transition-all w-full sm:w-auto active:scale-95"
                       >
                         <Download size={14} className="group-hover:translate-y-0.5 transition-transform" />
                         Download HD Artwork
                       </Button>
                       <Button 
                         onClick={handleShareAsPost} 
                         disabled={isSharing} 
                         variant="outline"
                         className={cn(
                           "rounded-2xl h-11 px-5 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all w-full sm:w-auto active:scale-95",
                           darkMode ? "bg-slate-900 border-white/5 text-slate-300 hover:bg-slate-800" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                         )}
                       >
                         {isSharing ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={13} />}
                         Share Community
                       </Button>
                       <Button 
                         onClick={() => {
                           setGeneratedImage(null);
                           toast.info('Workspace cleared');
                         }} 
                         variant="ghost" 
                         className="h-11 w-11 p-0 rounded-2xl bg-red-500/10 text-red-500 hover:bg-red-500/20 shrink-0 hidden sm:flex items-center justify-center"
                         title="Discard Artwork"
                       >
                         <Trash2 size={15} />
                       </Button>
                    </div>
                  </div>
                )}

                {generatedImage && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                      <Palette size={12} className="text-primary animate-pulse" />
                      Neural Post-Processing Filters
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {FILTER_PRESETS.map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedFilterPreset(p.id);
                            toast.success(`Filter Preset applied: ${p.name}`);
                          }}
                          className={cn(
                            "py-2.5 px-3 rounded-2xl text-[10px] uppercase font-black tracking-wider border-2 text-center transition-all cursor-pointer relative overflow-hidden active:scale-95",
                            selectedFilterPreset === p.id
                              ? "bg-gradient-to-r from-primary to-emerald-500 text-white border-transparent shadow-md shadow-primary/10 font-bold"
                              : darkMode
                                ? "bg-slate-950/60 border-white/5 text-slate-400 hover:border-white/10 hover:bg-slate-900"
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {generatedImage && (
                  <div className={cn(
                    "grid grid-cols-1 md:grid-cols-3 gap-6 p-6 rounded-3xl border shadow-inner transition-colors",
                    darkMode ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-200"
                  )}>
                     {[
                       { l: "Brightness", v: brightness, s: setBrightness, i: <Zap size={10} /> }, 
                       { l: "Contrast", v: contrast, s: setContrast, i: <Zap size={10} /> }, 
                       { l: "Saturation", v: saturation, s: setSaturation, i: <Zap size={10} /> }
                     ].map(f => (
                       <div key={f.l} className="space-y-3">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                             <span className="flex items-center gap-2">{f.i} {f.l}</span>
                             <span className="text-primary">{f.v}%</span>
                          </div>
                          <input type="range" min="50" max="150" value={f.v} onChange={(e) => f.s(Number(e.target.value))} className={cn(
                            "w-full accent-primary h-1.5 rounded-lg appearance-none cursor-pointer",
                            darkMode ? "bg-white/10" : "bg-slate-200"
                          )} />
                       </div>
                     ))}
                  </div>
                )}
              </div>

              {isDrawerOpen && (
                <div 
                  onClick={() => setIsDrawerOpen(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-45 md:hidden animate-in fade-in duration-300"
                />
              )}

              <div className={cn(
                "space-y-8 p-6 md:p-8 border relative overflow-hidden backdrop-blur-md shadow-2xl transition-all duration-300 ring-1 ring-inset",
                // Desktop styling (md screens)
                darkMode 
                  ? "md:bg-slate-900/40 md:border-white/10 md:shadow-black/80 md:ring-white/5 md:rounded-[3rem]" 
                  : "md:bg-white/80 md:border-slate-200/80 md:shadow-slate-200/30 md:ring-slate-100 md:rounded-[3rem]",
                // Mobile drawer styling
                isDrawerOpen 
                  ? cn(
                      "fixed bottom-0 left-0 right-0 rounded-t-[2.5rem] rounded-b-none border-t border-x-0 border-b-0 z-50 max-h-[85vh] overflow-y-auto block md:relative md:max-h-none md:block md:border md:rounded-[3rem] animate-in slide-in-from-bottom duration-350 ease-out",
                      darkMode 
                        ? "bg-slate-950/95 border-white/10 shadow-black/80 ring-white/5" 
                        : "bg-white/95 border-slate-200 shadow-slate-200/30 ring-slate-100"
                    )
                  : "hidden md:block md:relative"
              )}>
                {/* Mobile Drawer Header Block */}
                <div className="flex md:hidden flex-col items-center pb-2 pt-1 border-b border-slate-200/10 dark:border-white/5 mb-4 sticky top-0 bg-inherit z-10 select-none">
                  <div className="w-12 h-1 bg-slate-400 dark:bg-slate-700 rounded-full mb-3" />
                  <div className="flex items-center justify-between w-full">
                    <span className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                      <Sliders size={12} />
                      Studio Workspace Panels
                    </span>
                    <button 
                      onClick={() => setIsDrawerOpen(false)}
                      className="p-1.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-300 hover:opacity-80 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* Minimal glowing colored top bar */}
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-emerald-400 to-primary/40 opacity-80 hidden md:block" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Seed Description</p>
                    <button 
                      onClick={polishPrompt} 
                      disabled={isPolishing || !prompt.trim()} 
                      className="text-[9px] font-black text-primary uppercase flex items-center gap-2 hover:opacity-80 transition-opacity disabled:opacity-30 cursor-pointer"
                    >
                      {isPolishing ? <RefreshCw size={12} className="animate-spin" /> : <Wand2 size={12} />} 
                      AI Neural Polish
                    </button>
                  </div>
                  <textarea 
                    value={prompt} 
                    onChange={(e) => setPrompt(e.target.value)} 
                    placeholder="Describe your vision (e.g. A futuristic Lilongwe skyline with floating markets)..." 
                    className={cn(
                      "w-full border-2 rounded-[2rem] p-6 text-sm min-h-[140px] focus:ring-4 focus:ring-primary/10 transition-all resize-none shadow-inner leading-relaxed outline-none font-medium",
                      darkMode 
                        ? "bg-slate-950/90 border-white/5 focus:border-primary/50 text-slate-100 placeholder:text-slate-800" 
                        : "bg-white border-slate-200 focus:border-primary/40 text-slate-900 placeholder:text-slate-300"
                    )} 
                  />
                  
                  {/* Dynamic Shuffler and Cleanup Panel */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const rand = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
                          setPrompt(rand);
                          toast.success("Entropy algorithm applied: Loaded random seed");
                        }}
                        className={cn(
                          "px-[14px] py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm hover:translate-y-[-1px]",
                          darkMode
                            ? "bg-slate-900 border-white/5 text-emerald-400 hover:border-emerald-500/35 hover:bg-emerald-950/10"
                            : "bg-white border-slate-200 text-emerald-600 hover:border-emerald-200 hover:bg-emerald-50/50"
                        )}
                      >
                        <span>🎲 Cosmic Shuffle</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPrompt("");
                          toast.info("Seed description cleared");
                        }}
                        disabled={!prompt}
                        className={cn(
                          "px-[14px] py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm hover:translate-y-[-1px] disabled:opacity-30 disabled:cursor-not-allowed",
                          darkMode
                            ? "bg-slate-900 border-white/5 text-rose-400 hover:border-rose-500/35 hover:bg-rose-950/10"
                            : "bg-white border-slate-200 text-rose-600 hover:border-rose-200 hover:bg-rose-50/50"
                        )}
                      >
                        <span>🧹 Clear Seed</span>
                      </button>
                    </div>
                    {prompt && (
                      <span className="text-[9px] font-mono opacity-40 uppercase tracking-widest px-2 select-none">
                        Length: {prompt.length} chars
                      </span>
                    )}
                  </div>

                  {/* Interactive Creative Additive Tags */}
                  <div className="space-y-2 pt-3 border-t border-dashed border-slate-200/50 dark:border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aesthetic Detail Additives</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CREATIVE_TAGS.map((tag, idx) => {
                        const hasTag = prompt.toLowerCase().includes(tag.text.split(" ").slice(1).join(" ").toLowerCase());
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              if (hasTag) {
                                // Find modifier in string case-insensitively and remove
                                const regex = new RegExp(tag.value.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
                                setPrompt(prev => prev.replace(regex, "").replace(tag.value.trim().substring(2), "").trim());
                                toast.info(`Removed: ${tag.text}`);
                              } else {
                                // Append
                                setPrompt(prev => {
                                  const trimmed = prev.trim();
                                  if (!trimmed) return tag.value.substring(2);
                                  return trimmed.endsWith(",") ? `${trimmed} ${tag.value.substring(2)}` : `${trimmed}${tag.value}`;
                                });
                                toast.success(`Multiplier Injected: ${tag.text}`);
                              }
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-wider border transition-all active:scale-95 cursor-pointer flex items-center gap-1.5",
                              hasTag
                                ? "bg-primary/10 border-primary text-primary"
                                : darkMode
                                  ? "bg-slate-950/40 border-white/5 text-slate-400 hover:text-white hover:border-white/10"
                                  : "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300"
                            )}
                          >
                            <span>{tag.text}</span>
                            {hasTag && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Prompt Inspiration Templates */}
                  <div className="space-y-2 pt-3 border-t border-dashed border-slate-200/50 dark:border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Inspiring Regional Scapes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {PROMPT_TEMPLATES.map((t, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setPrompt(t.prompt);
                            toast.success(`Loaded Seed: ${t.text}`);
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all active:scale-95 cursor-pointer hover:shadow-sm",
                            darkMode
                              ? "bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/10"
                              : "bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 hover:border-slate-300"
                          )}
                        >
                          {t.text}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Real-time Camera Feed for AI Style Transfer */}
                <div className={cn(
                  "space-y-4 p-5 rounded-[2rem] border transition-colors",
                  darkMode ? "bg-white/5 border-white/5" : "bg-slate-50 border-slate-200"
                )}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                        <Camera size={12} className="text-primary animate-pulse" />
                        Camera Source Node
                      </p>
                      <p className="text-[9px] text-slate-500 uppercase mt-0.5">Snapshot for AI style transfer</p>
                    </div>
                    {capturedImage && (
                      <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full animate-pulse">
                        Style Transfer Active
                      </span>
                    )}
                  </div>

                  {isCameraOpen ? (
                    <div className="space-y-4">
                      {cameraPermission === 'denied' ? (
                        <div className={cn(
                          "p-6 rounded-3xl border border-dashed text-center max-w-md mx-auto space-y-4",
                          darkMode ? "border-red-500/20 bg-red-500/5 text-slate-200" : "border-red-200 bg-red-50/50 text-slate-800"
                        )}>
                          <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
                            <Camera size={22} className="animate-pulse" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-red-500">Camera Permissions Blocked</h4>
                            <p className="text-[10px] text-slate-500 leading-relaxed mt-2">
                              Your browser has blocked camera access. To take real-time snapshots for style transfer neural mapping, follow these directions:
                            </p>
                            <div className="mt-3 text-left bg-black/5 dark:bg-white/5 p-3.5 rounded-2xl text-[9px] text-slate-500 space-y-2 leading-relaxed">
                              <p>📱 <strong className="text-slate-700 dark:text-slate-300">iOS Safari:</strong> Tap the <code className="font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">aA</code> icon or lock icon in the address bar, choose <strong className="text-slate-700 dark:text-slate-300">Website Settings</strong>, and set Camera to <strong className="text-emerald-500">Allow</strong>.</p>
                              <p>🤖 <strong className="text-slate-700 dark:text-slate-300">Android Chrome/Browser:</strong> Tap the lock or settings icon next to the URL in the address bar, select <strong className="text-slate-700 dark:text-slate-300">Permissions</strong>, and enable Camera access.</p>
                              <p>💻 <strong className="text-slate-700 dark:text-slate-300">In-App Webview:</strong> Tap the external Safari/Chrome icon to open Zathu in your main browser if capabilities are limited.</p>
                            </div>
                          </div>
                          <div className="flex gap-2 justify-center">
                            <Button 
                              onClick={async () => {
                                await checkCameraPermission();
                                await startCamera();
                              }} 
                              size="sm"
                              className="bg-primary hover:bg-emerald-600 rounded-xl text-[9px] uppercase tracking-widest font-black"
                            >
                              Try Again
                            </Button>
                            <Button 
                              onClick={stopCamera} 
                              variant="secondary"
                              size="sm"
                              className="rounded-xl text-[9px] uppercase tracking-widest font-black"
                            >
                              Go Back
                            </Button>
                          </div>
                        </div>
                      ) : cameraPermission === 'prompt' ? (
                        <div className={cn(
                          "p-6 rounded-3xl border border-dashed text-center max-w-md mx-auto space-y-4",
                          darkMode ? "border-primary/20 bg-primary/5 text-slate-200" : "border-slate-200 bg-slate-50/50 text-slate-800"
                        )}>
                          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                            <Camera size={22} />
                          </div>
                          <div>
                            <h4 className="text-xs font-black uppercase tracking-widest text-primary">Camera Access Required</h4>
                            <p className="text-[10px] text-slate-500 leading-relaxed mt-2">
                              To capture custom artwork sources directly inside the Zathu Neural Studio, we require brief browser camera permission.
                            </p>
                            <div className="mt-3 text-left bg-black/5 dark:bg-white/5 p-3.5 rounded-2xl text-[9px] text-slate-500 space-y-1.5 leading-relaxed">
                              <p className="flex items-center gap-1.5">🔒 <strong>100% Secure & On-Device:</strong> All image processing flows execute locally in your browser memory. We never transmit video raw frames to any database or server.</p>
                              <p className="flex items-center gap-1.5">💡 <strong>Interactive Transfer:</strong> Recreate real-life portraits or environments with retro, paint, or cyber styling immediately.</p>
                            </div>
                          </div>
                          <div className="flex gap-2 justify-center">
                            <Button 
                              onClick={startCamera} 
                              size="sm"
                              className="bg-primary hover:bg-emerald-600 rounded-xl text-[9px] uppercase tracking-widest font-black"
                            >
                              Grant Camera Access
                            </Button>
                            <Button 
                              onClick={stopCamera} 
                              variant="secondary"
                              size="sm"
                              className="rounded-xl text-[9px] uppercase tracking-widest font-black"
                            >
                              Go Back
                            </Button>
                          </div>
                        </div>
                      ) : cameraPermission === 'checking' ? (
                        <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                          <Loader2 size={24} className="animate-spin text-primary" />
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Negotiating Secure Feed...</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {/* Video Viewfinder */}
                          <div className="relative aspect-video w-full max-w-md mx-auto rounded-3xl overflow-hidden border border-primary/25 bg-black flex items-center justify-center group shadow-xl">
                            <video 
                              ref={videoRef} 
                              autoPlay 
                              playsInline 
                              className="w-full h-full object-cover scale-x-[-1]"
                            />
                            
                            {/* Viewing frames & scanlines for high-tech look */}
                            <div className="absolute inset-0 border-[10px] border-black/10 pointer-events-none" />
                            <div className="absolute inset-4 border border-dashed border-white/20 pointer-events-none rounded-2xl flex items-center justify-center">
                              <div className=" Scaler border-2 border-white/30 rounded-full w-12 h-12" />
                            </div>
                            
                            {/* Tech Labels */}
                            <div className="absolute top-3 left-3 bg-black/60 text-emerald-400 text-[8px] font-mono px-2 py-0.5 rounded backdrop-blur-sm">
                              REC_NODE_ONLINE
                            </div>
                            <div className="absolute bottom-3 right-3 bg-black/60 text-white/70 text-[8px] font-mono px-2 py-0.5 rounded backdrop-blur-sm">
                              60 FPS
                            </div>
                          </div>

                          {/* Device Selection & Actions */}
                          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center max-w-md mx-auto">
                            {devices.length > 1 && (
                              <select
                                value={selectedCameraId}
                                onChange={(e) => setSelectedCameraId(e.target.value)}
                                className={cn(
                                  "text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border flex-1 w-full outline-none",
                                  darkMode ? "bg-slate-950 border-white/5 text-slate-300" : "bg-white border-slate-200 text-slate-700"
                                )}
                              >
                                {devices.map((device, i) => (
                                  <option key={device.deviceId} value={device.deviceId}>
                                    {device.label || `Camera ${i + 1}`}
                                  </option>
                                ))}
                              </select>
                            )}
                            <div className="flex gap-2 w-full justify-center">
                              <Button 
                                onClick={capturePhoto} 
                                className="bg-primary hover:bg-emerald-600 rounded-xl h-10 px-5 text-[10px] uppercase tracking-widest font-black flex-1"
                              >
                                <Camera size={14} className="mr-2" />
                                Capture Photo
                              </Button>
                              <Button 
                                onClick={stopCamera} 
                                variant="secondary"
                                className="rounded-xl h-10 px-5 text-[10px] uppercase tracking-widest font-black"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : capturedImage ? (
                    <div className="flex flex-col sm:flex-row items-center gap-6 p-4 rounded-2xl border border-dashed border-primary/20 bg-primary/5">
                      {/* Captured Image Preview */}
                      <div className="relative w-28 h-28 shrink-0 rounded-xl overflow-hidden shadow-lg border-2 border-primary/20">
                        <img 
                          src={capturedImage} 
                          alt="Captured source" 
                          className="w-full h-full object-cover" 
                        />
                        <button 
                          onClick={() => setCapturedImage(null)}
                          className="absolute top-1.5 right-1.5 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-lg shadow transition-colors cursor-pointer"
                          title="Clear Photo"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {/* Info & Retake */}
                      <div className="space-y-3 flex-1 text-center sm:text-left">
                        <div>
                          <h4 className={cn("text-xs font-black uppercase tracking-wider", darkMode ? "text-slate-200" : "text-slate-800")}>Source Image Active</h4>
                          <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                            Your camera snapshot is locked in. The Neural Forge will recreate this photo using the selected style and prompt below.
                          </p>
                        </div>
                        <div className="flex gap-2 justify-center sm:justify-start">
                          <Button 
                            onClick={startCamera} 
                            variant="outline"
                            className="rounded-xl h-8 px-4 text-[9px] uppercase tracking-widest font-black"
                          >
                            <RefreshCw size={10} className="mr-1.5" />
                            Take Another
                          </Button>
                          <Button 
                            onClick={() => setCapturedImage(null)} 
                            variant="ghost"
                            className="rounded-xl h-8 px-4 text-[9px] uppercase tracking-widest font-black text-red-500 hover:bg-red-500/5"
                          >
                            Remove Source
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Default inactive camera option */
                    <button 
                      onClick={startCamera}
                      className={cn(
                        "w-full aspect-[4/1] md:aspect-[6/1] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 hover:border-primary/50 transition-all group overflow-hidden relative cursor-pointer",
                        darkMode ? "border-white/10 hover:bg-white/5" : "border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Camera size={18} />
                        </div>
                        <div className="text-left">
                          <p className={cn("text-[10px] font-black uppercase tracking-wider", darkMode ? "text-slate-200" : "text-slate-800")}>Capture Real-time Photo</p>
                          <p className="text-[9px] text-slate-500 uppercase mt-0.5">Use your device camera to provide a style transfer reference</p>
                        </div>
                      </div>
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Aesthetic Matrix</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {STYLES.map(s => (
                      <button 
                        key={s.id} 
                        onClick={() => setSelectedStyle(s.id)} 
                        className={cn(
                          "p-5 rounded-[2rem] text-left border-2 transition-all duration-300 relative overflow-hidden group cursor-pointer active:scale-95", 
                          selectedStyle === s.id 
                            ? "bg-gradient-to-br from-primary to-emerald-600 border-transparent shadow-lg shadow-emerald-500/20 scale-[1.02]" 
                            : darkMode 
                              ? "bg-slate-950/60 border-white/5 hover:border-primary/20 hover:bg-slate-900/80 hover:scale-[1.01] text-slate-300" 
                              : "bg-white border-slate-200/80 hover:border-primary/20 hover:bg-white hover:shadow-lg hover:shadow-slate-200/40 hover:scale-[1.01] text-slate-700"
                        )}
                      >
                        <span className="text-2xl block mb-2 group-hover:scale-125 transition-transform duration-500">{s.icon}</span>
                        <p className={cn("text-[10px] font-black uppercase tracking-tight", selectedStyle === s.id ? "text-white" : "text-inherit")}>{s.name}</p>
                        <p className={cn("text-[8px] font-medium mt-1 leading-relaxed", selectedStyle === s.id ? "text-white/80" : "text-slate-400")}>{s.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                   <button 
                    onClick={() => setAdvancedMode(!advancedMode)} 
                    className={cn(
                      "text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors mx-auto px-4 py-2 rounded-full border",
                      darkMode ? "text-slate-600 hover:text-white bg-white/5 border-white/5" : "text-slate-400 hover:text-slate-900 bg-slate-100 border-slate-200"
                    )}
                   >
                     <Settings2 size={14} /> 
                     {advancedMode ? "Hide System Grid" : "Advanced System Grid"}
                   </button>
                   
                   <AnimatePresence>
                     {advancedMode && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }} 
                          animate={{ height: 'auto', opacity: 1 }} 
                          exit={{ height: 0, opacity: 0 }}
                          className={cn(
                            "pt-4 grid grid-cols-1 md:grid-cols-2 gap-8 overflow-hidden border-t transition-colors",
                            darkMode ? "border-white/5" : "border-slate-200"
                          )}
                        >
                            <div className="space-y-4 md:col-span-2 border-b border-dashed border-slate-200/10 dark:border-white/5 pb-4">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Semantic Image Modifiers</p>
                              <div className="flex flex-wrap gap-2">
                                {MODIFIERS.map(m => {
                                  const isSelected = selectedModifiers.includes(m.id);
                                  return (
                                    <button
                                      key={m.id}
                                      onClick={() => {
                                        if (isSelected) {
                                          setSelectedModifiers(selectedModifiers.filter(id => id !== m.id));
                                          toast.info(`Removed modifier: ${m.label}`);
                                        } else {
                                          setSelectedModifiers([...selectedModifiers, m.id]);
                                          toast.success(`Active rendering multiplier: ${m.label}`);
                                        }
                                      }}
                                      className={cn(
                                        "px-4 py-2 rounded-2xl text-[10px] uppercase font-black tracking-wider border transition-all cursor-pointer active:scale-95",
                                        isSelected
                                          ? "bg-primary border-primary text-white shadow-md shadow-primary/10"
                                          : darkMode
                                            ? "bg-slate-950/60 border-white/5 text-slate-400 hover:border-white/10"
                                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                                      )}
                                    >
                                      {m.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                           <div className="space-y-4">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Aspect Ratio Matrix</p>
                              <div className="flex gap-2">
                                 {ASPECT_RATIOS.map(r => (
                                   <button 
                                      key={r.id} 
                                      onClick={() => setAspectRatio(r.id)} 
                                      className={cn(
                                        "flex-1 py-3 rounded-2xl border text-[9px] font-black transition-all", 
                                        aspectRatio === r.id 
                                          ? darkMode ? "bg-white/10 border-white/20 text-white" : "bg-slate-200 border-slate-300 text-slate-900"
                                          : darkMode ? "border-white/5 text-slate-600" : "border-slate-200 text-slate-400"
                                      )}
                                    >
                                      {r.label}
                                    </button>
                                 ))}
                              </div>
                           </div>
                           <div className="space-y-2">
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Neural Blockers (Negative)</p>
                              <Input 
                                value={negativePrompt} 
                                onChange={(e) => setNegativePrompt(e.target.value)} 
                                placeholder="Low quality, distorted, extra limbs..."
                                className={cn(
                                  "h-12 rounded-2xl text-[11px] font-mono transition-colors",
                                  darkMode ? "bg-slate-950 border-white/5 text-slate-400" : "bg-white border-slate-200 text-slate-600"
                                )} 
                              />
                           </div>
                        </motion.div>
                     )}
                   </AnimatePresence>
                </div>

                <Button 
                  onClick={handleGenerate} 
                  disabled={isGenerating || !prompt.trim()} 
                  className="w-full bg-gradient-to-r from-primary via-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-primary h-20 rounded-[2.5rem] font-black text-xs uppercase tracking-[0.4em] shadow-xl shadow-primary/30 text-white transition-all duration-500 hover:shadow-emerald-500/40 active:scale-[0.98] group relative overflow-hidden cursor-pointer"
                >
                  {isGenerating ? (
                    <div className="flex items-center gap-4">
                       <Loader2 size={24} className="animate-spin" />
                       Forging Visual...
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                       <Wand2 size={24} className="group-hover:rotate-12 transition-transform" />
                       Manifest Vision
                    </div>
                  )}
                </Button>
              </div>

              {/* Tips Section */}
              <div className={cn(
                "rounded-[2.5rem] p-8 border flex flex-col md:flex-row items-center gap-8 transition-all hover:scale-[1.01] duration-300 shadow-[0_15px_30px_-15px_rgba(0,0,0,0.05)]",
                darkMode ? "bg-slate-900/40 border-white/5 hover:bg-slate-900/60" : "bg-white border-slate-200/80 hover:bg-white hover:shadow-slate-100"
              )}>
                 <div className="w-16 h-16 bg-gradient-to-br from-primary/10 to-emerald-400/20 text-primary rounded-[1.75rem] flex items-center justify-center shrink-0 shadow-inner">
                    <Brush size={28} className="animate-pulse" style={{ animationDuration: '4s' }} />
                 </div>
                 <div className="text-center md:text-left space-y-2">
                    <h3 className={cn("text-xs font-black uppercase tracking-widest", darkMode ? "text-slate-200" : "text-slate-800")}>Creative Synthesis</h3>
                    <p className="text-[11px] text-slate-500 leading-relaxed italic max-w-md font-medium">
                      Prompting is an art of specificity. Use keywords like "8k resolution," "volumetric lighting," or "octane render" to push the neural grid to its limits.
                    </p>
                 </div>
              </div>
            </motion.div>
          ) : (
             <motion.div 
                key="gallery" 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }} 
                className="p-4 md:p-8 max-w-6xl mx-auto space-y-8"
             >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2 border-b border-dashed border-slate-200 dark:border-white/10 pb-4">
                   <div>
                      <h2 className={cn("text-2xl font-serif italic", darkMode ? "text-white" : "text-slate-900")}>The Neural Vault</h2>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{history.length} Units Recovered</p>
                   </div>
                   {history.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                         {!isSelectionMode ? (
                            <Button
                               onClick={() => {
                                  setIsSelectionMode(true);
                                  setSelectedIds([]);
                               }}
                               variant="outline"
                               size="sm"
                               className={cn(
                                  "h-9 rounded-xl text-[9px] font-black uppercase tracking-widest px-4 cursor-pointer border-2 shadow-sm font-sans flex items-center gap-1.5",
                                  darkMode 
                                    ? "bg-slate-950 border-white/5 hover:bg-slate-900 text-white" 
                                    : "bg-white border-slate-200/80 hover:bg-slate-50 text-slate-700"
                               )}
                            >
                               <Layers size={11} className="text-primary" />
                               Bulk Export
                            </Button>
                         ) : (
                            <>
                               <Button
                                  onClick={() => {
                                     if (selectedIds.length === history.length) {
                                        setSelectedIds([]);
                                     } else {
                                        setSelectedIds(history.map(item => item.id));
                                     }
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className={cn(
                                     "h-9 rounded-xl text-[9px] font-black uppercase tracking-widest px-4 cursor-pointer border-2 shadow-sm font-sans",
                                     darkMode 
                                       ? "bg-slate-950 border-white/5 hover:bg-slate-900 text-white" 
                                       : "bg-white border-slate-200/80 hover:bg-slate-50 text-slate-700"
                                  )}
                               >
                                  {selectedIds.length === history.length ? "Deselect All" : "Select All"}
                               </Button>
                               <Button
                                  onClick={handleExportZip}
                                  disabled={selectedIds.length === 0 || isExporting}
                                  size="sm"
                                  className={cn(
                                     "h-9 rounded-xl text-[9px] font-black uppercase tracking-widest px-4 cursor-pointer shadow-lg bg-primary text-white flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                  )}
                               >
                                  {isExporting ? (
                                     <>
                                        <Loader2 size={11} className="animate-spin" />
                                        Zipping...
                                     </>
                                  ) : (
                                     <>
                                        <Download size={11} />
                                        Download ZIP ({selectedIds.length})
                                     </>
                                  )}
                               </Button>
                               <Button
                                  onClick={() => {
                                     setIsSelectionMode(false);
                                     setSelectedIds([]);
                                  }}
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 rounded-xl text-[9px] font-black uppercase tracking-widest px-3 cursor-pointer text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 font-sans"
                               >
                                  Cancel
                               </Button>
                            </>
                         )}
                      </div>
                   )}
                </div>

                {history.length === 0 ? (
                  <div className="py-32 text-center opacity-10">
                    <div className={cn(
                      "w-24 h-24 border-2 border-dashed flex items-center justify-center rounded-full mx-auto mb-6",
                      darkMode ? "border-white" : "border-slate-900"
                    )}>
                       <History size={48} />
                    </div>
                    <p className={cn("text-sm font-black uppercase tracking-[0.5em]", darkMode ? "text-white" : "text-slate-900")}>No Manifests Archived</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                    {history.map((item, idx) => (
                       <motion.div 
                          key={`${item.id}-${idx}`} 
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.05 }}
                          className="flex flex-col gap-3"
                       >
                          <div
                            className={cn(
                              "group/card relative aspect-square rounded-[2.2rem] overflow-hidden border-2 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] transition-all duration-500 ease-out hover:shadow-primary/15 hover:scale-[1.02]",
                              isSelectionMode && selectedIds.includes(item.id)
                                ? "border-primary ring-4 ring-primary/20 scale-[1.02]"
                                : darkMode ? "bg-slate-900/60 border-white/5 hover:border-primary/40 shadow-black/60" : "bg-white border-slate-200/60 hover:border-primary/30 shadow-slate-200/30"
                            )}
                          >
                             <img src={item.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                             
                             {isSelectionMode && (
                                <div className="absolute top-4 right-4 z-20">
                                   <div className={cn(
                                      "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                                      selectedIds.includes(item.id)
                                        ? "bg-primary border-primary text-white scale-110 shadow-lg shadow-primary/35"
                                        : "bg-black/40 border-white/50 text-transparent hover:border-white hover:bg-black/60"
                                   )}>
                                      <CheckCircle2 size={16} className={selectedIds.includes(item.id) ? "opacity-100" : "opacity-0"} />
                                   </div>
                                 </div>
                             )}

                             {isSelectionMode ? (
                                <div 
                                   onClick={(e) => {
                                      e.preventDefault();
                                      toggleSelect(item.id);
                                   }}
                                   className={cn(
                                      "absolute inset-0 z-10 transition-colors duration-300 cursor-pointer flex items-center justify-center",
                                      selectedIds.includes(item.id) 
                                        ? "bg-primary/10" 
                                        : "bg-black/0 hover:bg-black/15"
                                   )}
                                >
                                </div>
                             ) : (
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-900/40 opacity-0 group-hover:opacity-100 transition-all duration-500 p-5 flex flex-col justify-end gap-3 backdrop-blur-[3px]">
                                   <p className="text-[10px] text-white line-clamp-2 italic mb-2 opacity-80">"{item.prompt}"</p>
                                   <div className="flex gap-1.5">
                                      <Button 
                                        onClick={() => remixHistory(item)} 
                                        variant="secondary" 
                                        className="flex-1 h-9 rounded-xl text-[8px] font-black uppercase tracking-widest bg-white/10 text-white hover:bg-white hover:text-black p-0"
                                      >
                                        Remix
                                      </Button>
                                      <Button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(item.prompt);
                                          toast.success('Prompt copied to clipboard!');
                                        }}
                                        variant="secondary"
                                        className="h-9 w-9 rounded-xl bg-white/10 text-white hover:bg-white/20 p-0 flex items-center justify-center shrink-0"
                                        title="Copy Prompt"
                                      >
                                        <Copy size={13} />
                                      </Button>
                                      <Button 
                                        onClick={() => {
                                          const link = document.createElement('a');
                                          link.href = item.imageUrl;
                                          link.download = `zathu-vault-art-${item.id}.png`;
                                          link.click();
                                          toast.success('Archived masterwork exported!');
                                        }}
                                        variant="secondary"
                                        className="h-9 w-9 rounded-xl bg-white/10 text-white hover:bg-white/20 p-0 flex items-center justify-center shrink-0"
                                        title="Download Image"
                                      >
                                        <Download size={13} />
                                      </Button>
                                      <Button 
                                        onClick={() => setGeneratedImage(item.imageUrl)} 
                                        className="flex-1 h-9 rounded-xl text-[8px] font-black uppercase tracking-widest bg-primary text-white p-0"
                                      >
                                        Expand
                                      </Button>
                                   </div>
                                   <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest text-center mt-2 border-t border-white/5 pt-2">Manifested on Node-01</p>
                                </div>
                             )}
                          </div>
 
                          {/* Tags and Quick Remix button under the artwork */}
                          <div className="flex flex-col gap-2 px-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={cn(
                                "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border-2 transition-colors",
                                darkMode ? "bg-white/5 border-white/5 text-slate-300 group-hover/card:border-white/10" : "bg-slate-100 border-slate-200 text-slate-600 group-hover/card:border-slate-300"
                              )}>
                                {STYLES.find(s => s.id === item.style)?.name || item.style || 'Custom Style'}
                              </span>
                              <span className={cn(
                                "px-2.5 py-1 rounded-lg text-[9px] font-mono font-black border-2 transition-colors",
                                darkMode ? "bg-primary/5 border-primary/10 text-primary" : "bg-emerald-50 border-emerald-100/60 text-emerald-700"
                              )}>
                                {item.aspectRatio || '1:1'}
                              </span>
                            </div>
 
                            {!isSelectionMode && (
                              <Button
                                onClick={() => remixHistory(item)}
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "w-full h-9 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 border-2 shadow-sm font-sans cursor-pointer",
                                  darkMode 
                                    ? "bg-slate-900/60 border-white/5 text-slate-300 hover:bg-primary hover:border-transparent hover:text-white hover:shadow-lg hover:shadow-primary/20" 
                                    : "bg-white border-slate-200/80 text-slate-600 hover:bg-primary hover:border-transparent hover:text-white hover:shadow-lg hover:shadow-primary/25"
                                )}
                              >
                                <Wand2 size={10} className="text-primary" />
                                Quick Remix
                              </Button>
                            )}
                          </div>
                       </motion.div>
                    ))}
                 </div>
               )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Footer System Status */}
      <div className="fixed bottom-6 left-0 right-0 p-4 pointer-events-none z-50 hidden md:block">
        <div className={cn(
          "max-w-xs mx-auto backdrop-blur-md border px-6 py-2.5 rounded-full shadow-2xl flex items-center justify-between pointer-events-auto transition-colors",
          darkMode ? "bg-slate-900/90 border-white/10" : "bg-white/90 border-slate-200 shadow-slate-200/50"
        )}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className={cn("text-[9px] font-black uppercase tracking-widest", darkMode ? "text-slate-300" : "text-slate-600")}>Neural Node Online</span>
          </div>
          <span className="text-[9px] font-black text-slate-600 tracking-tighter">v4.2.0-STABLE</span>
        </div>
      </div>

      {/* Mobile Workspace Trigger Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-slate-950/50 via-slate-950/20 to-transparent md:hidden border-t-0 z-40">
        <div className={cn(
          "max-w-md mx-auto flex items-center justify-between gap-3 p-2.5 rounded-2xl border transition-all shadow-xl backdrop-blur-lg",
          darkMode ? "bg-slate-900/95 border-white/5" : "bg-white/95 border-slate-200"
        )}>
          {/* Active Preset Summary */}
          <div className="flex items-center gap-2 max-w-[55%] overflow-hidden">
            <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
              <Brush size={16} />
            </div>
            <div className="text-left leading-tight">
              <p className={cn("text-[9px] font-black uppercase tracking-wider", darkMode ? "text-slate-300" : "text-slate-700")}>
                Style: {STYLES.find(s => s.id === selectedStyle)?.icon || '🎨'} {STYLES.find(s => s.id === selectedStyle)?.name || 'Custom'}
              </p>
              <p className="text-[8px] text-slate-500 truncate max-w-[130px] font-medium font-sans">
                {prompt ? `"${prompt}"` : 'Write description...'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button 
              onClick={() => setIsDrawerOpen(true)}
              size="sm"
              className="bg-primary hover:bg-emerald-600 rounded-xl h-8.5 text-[9px] font-black uppercase tracking-widest px-3 flex items-center gap-1.5 shadow-md shadow-primary/20 text-white"
            >
              <Sliders size={11} />
              Set Tools
            </Button>
            
            {/* Quick Generate Action */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              size="sm"
              variant="outline"
              className={cn(
                "rounded-xl h-8.5 w-8.5 p-0 flex items-center justify-center border transition-all cursor-pointer",
                darkMode 
                  ? "bg-slate-950 border-white/5 text-slate-300 hover:bg-slate-800" 
                  : "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200"
              )}
              title="Quick Manifest"
            >
              {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} className="text-primary" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
