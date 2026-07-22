import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, Zap, Target, ShieldCheck, CheckCircle2, Clock, Smartphone, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, updateDoc, increment, serverTimestamp, runTransaction, collection } from 'firebase/firestore';
import { useAuth } from '../AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface BoostModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetType: 'post' | 'marketItem';
  targetTitle: string;
  targetImage?: string;
}

const PLANS = [
  { 
    id: 'starter', 
    name: 'Starter Boost', 
    price: 5000, 
    impressions: '1,000+', 
    duration: '24 Hours',
    icon: <Zap size={20} className="text-amber-500" />,
    color: 'border-amber-200 bg-amber-50/30'
  },
  { 
    id: 'pro', 
    name: 'Pro Visibility', 
    price: 15000, 
    impressions: '5,000+', 
    duration: '3 Days',
    icon: <TrendingUp size={20} className="text-primary" />,
    color: 'border-primary/20 bg-emerald-50/30'
  },
  { 
    id: 'elite', 
    name: 'Elite Growth', 
    price: 45000, 
    impressions: '20,000+', 
    duration: '7 Days',
    icon: <Target size={20} className="text-indigo-600" />,
    color: 'border-indigo-200 bg-indigo-50/30'
  }
];

export default function BoostModal({ isOpen, onClose, targetId, targetType, targetTitle, targetImage }: BoostModalProps) {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState(PLANS[1]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleBoost = async () => {
    if (!user) return;
    setIsProcessing(true);

    try {
      await runTransaction(db, async (transaction) => {
        const walletRef = doc(db, 'wallets', user.uid);
        const walletDoc = await transaction.get(walletRef);

        if (!walletDoc.exists() || walletDoc.data().balance < selectedPlan.price) {
          throw new Error("Insufficient Zathu Wallet balance. Please top up to boost.");
        }

        // 1. Deduct from wallet
        transaction.update(walletRef, {
          balance: walletDoc.data().balance - selectedPlan.price,
          updatedAt: serverTimestamp()
        });

        // 2. Update target item
        const targetRef = doc(db, targetType === 'post' ? 'posts' : 'marketItems', targetId);
        transaction.update(targetRef, {
          isPromoted: true,
          promotedAt: serverTimestamp(),
          promotionExpiry: new Date(Date.now() + (selectedPlan.id === 'starter' ? 24 : selectedPlan.id === 'pro' ? 72 : 168) * 60 * 60 * 1000)
        });

        // 3. Create Ad Entry
        const adRef = doc(collection(db, 'ads'));
        transaction.set(adRef, {
          title: targetTitle,
          description: "Promoted " + (targetType === 'post' ? 'Post' : 'Product'),
          imageUrl: targetImage || '',
          targetUrl: targetType === 'post' ? `/profile/${user.uid}` : `/marketplace`,
          adType: targetType === 'post' ? 'sponsored_post' : 'marketplace_boost',
          status: 'active',
          placement: targetType === 'post' ? 'feed' : 'marketplace',
          impressions: 0,
          clicks: 0,
          budget: selectedPlan.price,
          sourceId: targetId,
          sourceType: targetType,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          expiryDate: new Date(Date.now() + (selectedPlan.id === 'starter' ? 24 : selectedPlan.id === 'pro' ? 72 : 168) * 60 * 60 * 1000)
        });

        // 4. Log Transaction
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          fromId: user.uid,
          toId: 'system_ads',
          fromName: 'User',
          toName: 'Zathu Ads',
          amount: selectedPlan.price,
          type: 'ad_payment',
          status: 'completed',
          category: 'Promotion',
          description: `Boost: ${selectedPlan.name} for "${targetTitle}"`,
          createdAt: serverTimestamp()
        });
      });

      setIsSuccess(true);
      toast.success("Content boosted successfully!");
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Failed to boost content");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl border border-white/20 flex flex-col max-h-[90vh]"
          >
            {isSuccess ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 text-center space-y-4">
                <motion.div 
                  initial={{ scale: 0.5, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="w-16 h-16 md:w-20 md:h-20 bg-emerald-50 text-primary rounded-[2rem] flex items-center justify-center mx-auto shadow-sm"
                >
                  <CheckCircle2 size={40} className="md:w-12 md:h-12" />
                </motion.div>
                <div className="space-y-1">
                  <h4 className="text-lg md:text-xl font-black">Boost Active!</h4>
                  <p className="text-[10px] md:text-xs text-text-muted">Your content is now climbing the ranks</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10 text-left">
                  <div>
                    <h3 className="text-sm md:text-lg font-black tracking-tight">Boost Visibility</h3>
                    <p className="text-[8px] md:text-[10px] font-bold text-text-muted uppercase tracking-widest leading-none">Reach more Malawians</p>
                  </div>
                  <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors active:scale-95" id="boost-modal-close">
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 scrollbar-hide">
                  <div className="bg-slate-50 p-3 md:p-4 rounded-2xl border border-border flex items-center gap-3">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white border border-border overflow-hidden shrink-0">
                      {targetImage ? (
                        <img src={targetImage} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-primary/5 text-primary">
                          <MessageSquare size={16} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[8px] md:text-[10px] font-bold text-text-muted uppercase tracking-widest">Selected Item</p>
                      <p className="text-[11px] md:text-sm font-black text-text-main truncate">{targetTitle}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[9px] md:text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">Select Boost Tier</p>
                    <div className="space-y-2">
                      {PLANS.map((plan) => (
                        <button
                          key={plan.id}
                          onClick={() => setSelectedPlan(plan)}
                          className={cn(
                            "w-full p-3 md:p-4 rounded-2xl border-2 transition-all flex items-center gap-3 md:gap-4 text-left group active:scale-[0.98]",
                            selectedPlan.id === plan.id
                              ? "border-primary bg-emerald-50/50"
                              : "border-border hover:border-slate-300"
                          )}
                        >
                          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-white flex items-center justify-center shadow-sm border border-border/50 shrink-0">
                            {plan.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] md:text-sm font-black text-text-main leading-tight">{plan.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                               <div className="flex items-center gap-1 text-[8px] md:text-[9px] font-bold text-text-muted">
                                  <Clock size={8} className="md:w-[10px] md:h-[10px]" />
                                  {plan.duration}
                               </div>
                               <div className="flex items-center gap-1 text-[8px] md:text-[9px] font-bold text-primary">
                                  <TrendingUp size={8} className="md:w-[10px] md:h-[10px]" />
                                  {plan.impressions}
                               </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px] md:text-xs font-black text-primary">MK {plan.price.toLocaleString()}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div className="flex items-start gap-2 bg-indigo-50 p-3 rounded-xl border border-indigo-100/50">
                      <ShieldCheck size={14} className="text-indigo-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] font-medium leading-relaxed text-indigo-700">
                        Payment will be deducted from your <span className="font-black">Zathu Wallet</span> instantly. No refunds on active boosts.
                      </p>
                    </div>
                    
                    <Button
                      onClick={handleBoost}
                      disabled={isProcessing}
                      id="boost-activate-now"
                      className="w-full bg-primary hover:bg-emerald-700 text-white rounded-2xl h-12 md:h-14 font-black shadow-xl shadow-primary/20 transition-all active:scale-95 gap-3 text-xs md:text-sm"
                    >
                      {isProcessing ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <TrendingUp size={18} />
                      )}
                      <span>Activate Boost Now</span>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
