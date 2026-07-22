import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { generateCaption } from '../lib/gemini';
import { Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VideoUploadModal({ isOpen, onClose }: VideoUploadModalProps) {
  const { user, profile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingStream) recordingStream.getTracks().forEach(track => track.stop());
    };
  }, [recordingStream]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) {
        toast.error("Please select a video file");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error("Video too large. Max 20MB.");
        return;
      }
      setSelectedFile(file);
      setVideoPreview(URL.createObjectURL(file));
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }, 
        audio: true 
      });
      setRecordingStream(stream);
      if (recordingVideoRef.current) {
        recordingVideoRef.current.srcObject = stream;
      }

      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const file = new File([blob], `recorded_video_${Date.now()}.webm`, { type: 'video/webm' });
        setSelectedFile(file);
        setVideoPreview(URL.createObjectURL(blob));
        
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !user) return;

    setUploading(true);
    let attempts = 0;
    const maxAttempts = 3;

    const performUpload = (): Promise<string> => {
      return new Promise((resolve, reject) => {
        const storageRef = ref(storage, `videos/${user.uid}/${Date.now()}_${selectedFile.name}`);
        const uploadTask = uploadBytesResumable(storageRef, selectedFile);

        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(progress);
          },
          (error) => reject(error),
          async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          }
        );
      });
    };

    while (attempts < maxAttempts) {
      try {
        const videoUrl = await performUpload();

        await addDoc(collection(db, 'videos'), {
          userId: user.uid,
          userProfile: {
            displayName: profile?.displayName || user.displayName || 'User',
            photoURL: profile?.photoURL || user.photoURL || '',
            isVerified: profile?.isVerified || false
          },
          caption,
          videoUrl,
          likesCount: 0,
          commentsCount: 0,
          createdAt: serverTimestamp()
        });

        toast.success("Video uploaded successfully!");
        onClose();
        setCaption('');
        setSelectedFile(null);
        setVideoPreview(null);
        return;
      } catch (error: any) {
        attempts++;
        console.error(`Upload attempt ${attempts} failed:`, error);
        
        if (attempts === maxAttempts) {
          toast.error(`Upload failed after ${maxAttempts} attempts: ${error.message || 'Unknown error'}`);
          break;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
      }
    }
    setUploading(false);
  };

  const handleGenerateCaption = async () => {
    if (!caption && !selectedFile) {
      toast.error("Enter a topic or select a video first");
      return;
    }
    setIsGeneratingCaption(true);
    try {
      const topic = caption || (selectedFile?.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ")) || "a new video";
      const captions = await generateCaption(topic);
      if (captions && captions.length > 0) {
        setCaption(captions[0]);
        toast.success("AI generated a caption for you!");
      }
    } catch (error) {
      console.error("AI Caption error:", error);
      toast.error("Failed to generate caption");
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <h3 className="font-bold text-sm uppercase tracking-wider">Share Video</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleUpload} className="p-6 space-y-6 overflow-y-auto scrollbar-hide">
          <div className="flex gap-2 mb-2">
            <Button 
              type="button" 
              variant={!isRecording && !recordingStream ? "default" : "outline"}
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 rounded-xl h-10 text-xs gap-2"
              disabled={isRecording}
            >
              <Upload size={14} />
              Select File
            </Button>
            {!isRecording && !recordingStream ? (
              <Button 
                type="button" 
                variant="outline"
                onClick={startRecording}
                className="flex-1 rounded-xl h-10 text-xs gap-2"
              >
                <Camera size={14} />
                Record
              </Button>
            ) : (
              <Button 
                type="button" 
                variant="destructive"
                onClick={isRecording ? stopRecording : cancelRecording}
                className="flex-1 rounded-xl h-10 text-xs gap-2"
              >
                <X size={14} />
                {isRecording ? "Stop" : "Cancel"}
              </Button>
            )}
          </div>

          <div 
            className="aspect-[9/16] max-h-[300px] mx-auto bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors overflow-hidden relative"
          >
            {isRecording || recordingStream ? (
              <div className="w-full h-full relative">
                <video 
                  ref={recordingVideoRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  className="w-full h-full object-cover scale-x-[-1]" 
                />
                {isRecording && (
                  <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 px-2 py-1 rounded-full text-white text-[10px] font-bold">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                  </div>
                )}
              </div>
            ) : videoPreview ? (
              <div className="w-full h-full relative">
                <video src={videoPreview} className="w-full h-full object-cover" controls />
                <button 
                  type="button"
                  onClick={() => {
                    setVideoPreview(null);
                    setSelectedFile(null);
                  }}
                  className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full hover:bg-black/70"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="text-center p-6" onClick={() => fileInputRef.current?.click()}>
                <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-primary mx-auto mb-3">
                  <Upload size={24} />
                </div>
                <p className="text-sm font-bold">No video selected</p>
                <p className="text-[10px] text-text-muted mt-1">Select a file or record a new one</p>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="video/*" 
              onChange={handleFileSelect} 
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Caption</label>
              <button 
                type="button"
                onClick={handleGenerateCaption}
                disabled={isGeneratingCaption}
                className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline disabled:opacity-50"
              >
                {isGeneratingCaption ? (
                  <Loader2 size={10} className="animate-spin" />
                ) : (
                  <Sparkles size={10} />
                )}
                AI Suggest
              </button>
            </div>
            <Input 
              placeholder="Write a catchy caption..." 
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="bg-slate-50 border-none rounded-xl h-12"
            />
          </div>

          <Button 
            type="submit" 
            disabled={!selectedFile || uploading}
            className="w-full bg-primary hover:bg-emerald-700 text-white rounded-xl h-12 font-bold shadow-lg overflow-hidden relative"
          >
            {uploading && uploadProgress > 0 && uploadProgress < 100 && (
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
                className="absolute left-0 top-0 bottom-0 bg-emerald-600 z-0"
              />
            )}
            <div className="relative z-10 flex items-center justify-center">
              {uploading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={18} className="animate-spin" />
                  <span>{Math.round(uploadProgress)}% Uploading...</span>
                </div>
              ) : (
                "Post Video"
              )}
            </div>
          </Button>
        </form>
      </div>
    </div>
  );
}
