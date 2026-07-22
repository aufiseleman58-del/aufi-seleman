import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, ShieldCheck, CreditCard, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, runTransaction, serverTimestamp, collection, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PromotionModalProps {
  itemId: string;
  itemType: 'post' | 'video' | 'marketItem';
  title: string;
  userId: string;
  onClose: () => void;
}

const PROMOTION_PLANS = [
  { 
    id: 'basic', 
    name: 'Starter Boost', 
    duration: 1, 
    price: 5000, 
    reach: '1,500+', 
    benefits: ['Feed Placement', 'Daily Analytics'],
    accent: 'bg-emerald-500'
  },
  { 
    id: 'standard', 
    name: 'Growth Engine', 
    duration: 3, 
    price: 12000, 
    reach: '8,000+', 
    benefits: ['Priority Placement', 'Marketplace Spotlight', 'Direct Support'],
    accent: 'bg-indigo-600',
    bestValue: true
  },
  { 
    id: 'premium', 
    name: 'Zathu Elite', 
    duration: 7, 
    price: 25000, 
    reach: '25,000+', 
    benefits: ['Elite Sidebar Ads', 'Push Notifications', 'Global Visibility', 'Premium Badge'],
    accent: 'bg-slate-900',
    elite: true
  },
];

export default function PromotionModal({ itemId, itemType, title, userId, onClose }: PromotionModalProps) {
  const [selectedPlan, setSelectedPlan] = useState(PROMOTION_PLANS[1]); // Default to Standard
  const [loading, setLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  React.useEffect(() => {
    const fetchBalance = async () => {
      const walletRef = doc(db, 'wallets', userId);
      const snap = await getDoc(walletRef);
      if (snap.exists()) {
        setWalletBalance(snap.data().balance);
      }
    };
    fetchBalance();
  }, [userId]);

  const handlePromote = async () => {
    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        // 1. Check wallet balance
        const walletRef = doc(db, 'wallets', userId);
        const walletDoc = await transaction.get(walletRef);
        
        if (!walletDoc.exists()) {
          throw new Error("Wallet not found. Please setup your wallet first.");
        }
        
        const balance = walletDoc.data().balance;
        if (balance < selectedPlan.price) {
          throw new Error("Insufficient balance in your Zathu Wallet.");
        }

        // 2. Deduct balance
        transaction.update(walletRef, {
          balance: balance - selectedPlan.price,
          updatedAt: serverTimestamp()
        });

        // 3. Create transaction log
        const txRef = doc(db, 'transactions', `${userId}_promo_${Date.now()}`);
        transaction.set(txRef, {
          fromId: userId,
          toId: 'system_ads',
          amount: selectedPlan.price,
          type: 'billpay',
          status: 'completed',
          description: `Promotion: ${selectedPlan.name} for ${itemType} "${title.slice(0, 20)}..."`,
          createdAt: serverTimestamp()
        });

        // 4. Update item status
        const itemRef = doc(db, itemType === 'post' ? 'posts' : itemType === 'video' ? 'videos' : 'marketItems', itemId);
        const untilDate = new Date();
        untilDate.setDate(untilDate.getDate() + selectedPlan.duration);
        
        transaction.update(itemRef, {
          isPromoted: true,
          promotedUntil: untilDate,
          promotionPlan: selectedPlan.id
        });

        // 5. Create entry in 'ads' collection for global placement
        const adRef = doc(collection(db, 'ads'));
        transaction.set(adRef, {
          title: title,
          description: `Boosted ${itemType}`,
          imageUrl: '', // This will be handled by the AdPlacement component which gets the source content if needed, 
                        // but for now, we'll store a placeholder or try to find an image
          targetUrl: itemType === 'post' ? `/profile/${userId}` : '/marketplace',
          adType: itemType === 'post' ? 'sponsored_post' : 'marketplace_boost',
          status: 'active',
          placement: itemType === 'post' ? 'feed' : 'marketplace',
          impressions: 0,
          clicks: 0,
          budget: selectedPlan.price,
          sourceId: itemId,
          sourceType: itemType,
          ownerId: userId,
          createdAt: serverTimestamp(),
          expiryDate: untilDate
        });
      });

      toast.success(`${selectedPlan.name} active! Your content is now being boosted.`);
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to initiate promotion.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white max-w-md w-full rounded-3xl overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-accent to-primary z-20" />
        
        <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10 text-left">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-primary" />
            <h3 className="font-bold uppercase tracking-widest text-slate-800 text-[11px] md:text-sm">Boost Transmission</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors active:scale-95" id="promotion-modal-close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-5 md:space-y-6 scrollbar-hide">
          <div className="space-y-1">
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selected Unit</p>
            <p className="text-xs md:text-sm font-bold text-slate-900 truncate">"{title}"</p>
            <p className="text-[9px] md:text-[10px] text-slate-400 font-mono capitalize">{itemType}</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Choose Your Power</p>
              {walletBalance !== null && (
                <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-full">
                   <div className={cn("w-1.5 h-1.5 rounded-full", walletBalance >= selectedPlan.price ? "bg-emerald-500" : "bg-red-500")} />
                   <span className="text-[8px] md:text-[9px] font-black text-slate-500">MWK {walletBalance.toLocaleString()}</span>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-2 px-2 snap-x">
              {PROMOTION_PLANS.map((plan: any) => (
                <div 
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className={`shrink-0 w-[180px] md:w-[220px] p-4 md:p-5 rounded-[1.5rem] border-2 transition-all cursor-pointer relative group snap-start overflow-hidden flex flex-col justify-between min-h-[160px] md:min-h-[180px] ${
                    selectedPlan.id === plan.id 
                      ? 'border-primary bg-emerald-50 shadow-lg shadow-primary/5' 
                      : 'border-slate-100 hover:border-emerald-100 bg-white'
                  }`}
                >
                  {plan.bestValue && (
                    <div className="absolute top-0 right-0 bg-primary text-white text-[7px] font-black uppercase px-2 py-0.5 rounded-bl-lg shadow-sm z-20">
                      Value
                    </div>
                  )}

                  <div className="relative z-10 text-left">
                    <div className="flex items-start justify-between mb-2">
                       <div className="flex items-center gap-1.5">
                          <div className={cn("w-1.5 h-1.5 rounded-full", plan.accent)} />
                          <h4 className="font-black text-[11px] md:text-[12px] text-slate-900 leading-tight">{plan.name}</h4>
                       </div>
                       {selectedPlan.id === plan.id && <CheckCircle2 size={12} className="text-primary md:w-[14px] md:h-[14px]" />}
                    </div>
                    
                    <div className="space-y-1 mb-3">
                       {plan.benefits.slice(0, 3).map((benefit: string, bidx: number) => (
                         <div key={bidx} className="flex items-center gap-1.5 text-[8px] md:text-[9px] text-slate-500 font-bold leading-none">
                            <CheckCircle2 size={8} className="text-emerald-500" />
                            <span className="truncate">{benefit}</span>
                         </div>
                       ))}
                    </div>
                  </div>

                  <div className="relative z-10 space-y-2 text-left">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-1 bg-white/80 backdrop-blur-sm rounded-md px-1 py-0.5 border border-slate-100">
                          <TrendingUp size={7} className="text-primary" /> 
                          <span className="text-[7px] md:text-[8px] font-black uppercase tracking-tighter text-slate-600">{plan.reach} Reach</span>
                       </div>
                       <p className="text-[8px] md:text-[9px] text-slate-400 font-bold">
                         {plan.duration}d
                       </p>
                    </div>
                    <p className="font-black text-sm md:text-base text-primary tracking-tight">MWK {plan.price.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 p-3 md:p-4 rounded-2xl border border-slate-100 space-y-1 md:space-y-2 text-left">
            <div className="flex justify-between text-[10px] md:text-[11px] font-bold">
              <span className="text-slate-400 uppercase tracking-widest">Total Investment</span>
              <span className="text-slate-900 font-black">MWK {selectedPlan.price.toLocaleString()}</span>
            </div>
            <p className="text-[8px] md:text-[9px] text-slate-400 leading-tight font-medium">
              Funds will be deducted from your Zathu Wallet. Promotion starts immediately after confirmation.
            </p>
          </div>

          <div className="flex gap-3 md:gap-4">
            <Button 
              onClick={onClose} 
              variant="outline" 
              className="flex-1 rounded-2xl h-11 md:h-12 font-bold text-slate-500 uppercase tracking-widest text-[10px] md:text-[11px]"
            >
              Cancel
            </Button>
            <Button 
              onClick={handlePromote}
              disabled={loading}
              id="promotion-confirm-boost"
              className="flex-1 rounded-2xl h-11 md:h-12 font-black uppercase tracking-widest text-[10px] md:text-[11px] shadow-lg shadow-primary/20 bg-primary hover:bg-emerald-600 text-white"
            >
              {loading ? 'Transmitting...' : 'Confirm Boost'}
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 pt-1 md:pt-2">
            <ShieldCheck size={12} className="text-emerald-500" />
            <span className="text-[8px] md:text-[9px] font-bold text-slate-400 uppercase tracking-widest">Secure Zathu Transaction</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
