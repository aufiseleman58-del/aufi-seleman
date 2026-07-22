import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Plus, 
  CreditCard, 
  History, 
  TrendingUp, 
  ChevronRight,
  Wallet as WalletIcon,
  ArrowRight,
  Bell,
  Search,
  Settings,
  Send,
  X,
  UserCheck,
  Loader2,
  Zap,
  Droplets,
  Tv,
  Phone,
  Sparkles,
  PieChart as PieChartIcon,
  Activity,
  ArrowRightLeft,
  Lightbulb,
  ShieldCheck,
  Check,
  Eye,
  EyeOff,
  Bot,
  ChevronLeft,
  Globe,
  Coins,
  Gem,
  Briefcase,
  Shield,
  LayoutGrid,
  Heart,
  Target,
  ShoppingCart,
  QrCode,
  ScanLine,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { QRCodeSVG } from "qrcode.react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { useSettings } from '../SettingsContext';
import { 
  AreaChart, 
  Area, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  runTransaction, 
  serverTimestamp, 
  addDoc,
  or,
  getDoc,
  updateDoc,
  increment,
  getDocFromServer
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { getWalletInsights } from '../lib/gemini';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

// Load Stripe
const stripePromise = loadStripe((import.meta as any).env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface Transaction {
  id: string;
  type: 'send' | 'receive' | 'topup' | 'cashout';
  title: string;
  amount: number;
  date: any;
  category: string;
}

function QRScannerComponent({ onScan, onClose }: { onScan: (data: string) => void, onClose: () => void }) {
  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    try {
      scanner = new Html5QrcodeScanner("qr-reader", { 
        qrbox: { width: 250, height: 250 }, 
        fps: 10,
        aspectRatio: 1
      }, false);
      
      scanner.render((text) => {
        if (scanner) {
          scanner.clear().then(() => {
            onScan(text);
          }).catch(console.error);
        }
      }, (err) => {
        // ignore errors during scanning frame
      });
    } catch (e) {
      console.error(e);
    }
    
    return () => {
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [onScan]);

  return (
    <div className="w-full flex flex-col items-center">
      <div id="qr-reader" className="w-full max-w-sm overflow-hidden rounded-2xl border-2 border-primary/20 [&_video]:rounded-2xl"></div>
    </div>
  );
}

function TopUpForm({ onComplete, onTopUpSuccess }: { onComplete: () => void; onTopUpSuccess?: (amount: number, recipient: string, ref: string, provider: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  const [method, setMethod] = useState<'momo' | 'card'>('momo');
  
  // Card states
  const [cardAmount, setCardAmount] = useState('');
  const [isProcessingCard, setIsProcessingCard] = useState(false);

  // Expanded Mobile Money & Bank Mobile Wallet states (horizontally scrollable system)
  const [momoProvider, setMomoProvider] = useState<'airtel' | 'tnm' | 'fdh' | 'nbm' | 'standard' | 'nbs'>('airtel');
  const [momoPhone, setMomoPhone] = useState('');
  const [momoAmount, setMomoAmount] = useState('');
  const [isProcessingMomo, setIsProcessingMomo] = useState(false);
  const [ussdOpen, setUssdOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [smsNotification, setSmsNotification] = useState<string | null>(null);

  const providers = [
    { id: 'airtel', name: 'Airtel Money', short: 'Airtel', color: 'border-red-500 bg-red-500/5 text-red-600', activeBadge: 'bg-red-500', isBank: false },
    { id: 'tnm', name: 'TNM Mpamba', short: 'Mpamba', color: 'border-amber-500 bg-amber-500/5 text-amber-700', activeBadge: 'bg-amber-500', isBank: false },
    { id: 'fdh', name: 'FDH Ufulu', short: 'FDH Bank', color: 'border-emerald-500 bg-emerald-500/5 text-emerald-700', activeBadge: 'bg-emerald-500', isBank: true },
    { id: 'nbm', name: 'NBM Mo626', short: 'NBM Bank', color: 'border-blue-500 bg-blue-500/5 text-blue-700', activeBadge: 'bg-blue-500', isBank: true },
    { id: 'standard', name: 'Standard Bank', short: 'Standard', color: 'border-indigo-500 bg-indigo-500/5 text-indigo-700', activeBadge: 'bg-indigo-500', isBank: true },
    { id: 'nbs', name: 'NBS EazyMobile', short: 'NBS Bank', color: 'border-rose-500 bg-rose-500/5 text-rose-700', activeBadge: 'bg-rose-500', isBank: true },
  ];

  // Card payment handler
  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !user) return;

    const numAmount = Number(cardAmount);
    if (numAmount < 100) {
      toast.error("Minimum top up is K100");
      return;
    }

    setIsProcessingCard(true);

    try {
      // 1. Create Payment Intent on the server
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numAmount * 100, currency: 'mwk' }), // MWK smallest unit
      });
      
      const { clientSecret, error } = await response.json();
      if (error) throw new Error(error);

      // 2. Confirm Payment
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error("Card element not found");

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement as any,
          billing_details: { name: user.displayName || user.email || 'Anonymous' },
        },
      });

      if (result.error) {
        toast.error(result.error.message);
      } else if (result.paymentIntent.status === 'succeeded') {
        const txnId = `TXN${Math.floor(10000000 + Math.random() * 90000000)}`;
        // 3. Update Wallet on success
        await runTransaction(db, async (transaction) => {
          const walletRef = doc(db, 'wallets', user.uid);
          const walletDoc = await transaction.get(walletRef);
          
          if (!walletDoc.exists()) {
            transaction.set(walletRef, {
              userId: user.uid,
              balance: numAmount,
              currency: 'MWK',
              updatedAt: serverTimestamp()
            });
          } else {
            transaction.update(walletRef, {
              balance: walletDoc.data().balance + numAmount,
              updatedAt: serverTimestamp()
            });
          }

          // log transaction
          const transRef = doc(collection(db, 'transactions'));
          transaction.set(transRef, {
            fromId: 'SYSTEM',
            toId: user.uid,
            fromName: 'Stripe Topup',
            toName: user.displayName || 'Me',
            amount: numAmount,
            type: 'topup',
            status: 'completed',
            category: 'Transfer',
            description: `Wallet top up via Card`,
            createdAt: serverTimestamp()
          });
        });

        if (onTopUpSuccess) {
          onTopUpSuccess(numAmount, 'Stripe Card Payment', txnId, 'CARD');
        } else {
          toast.success(`Succesfully topped up K${numAmount.toLocaleString()}`);
        }
        onComplete();
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsProcessingCard(false);
    }
  };

  // Mobile Money transaction handler
  const handleMomoComplete = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;

    const numAmount = Number(momoAmount);
    if (!numAmount || numAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!momoPhone || momoPhone.length < 9) {
      toast.error("Please enter a valid identifier/number");
      return;
    }
    if (!pin || pin.length < 4) {
      toast.error("Please enter your 4-digit PIN");
      return;
    }

    setUssdOpen(false);
    setIsProcessingMomo(true);

    try {
      // Simulate operator response time
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const selectedProv = providers.find(p => p.id === momoProvider) || providers[0];

      // Update Firebase wallet
      await runTransaction(db, async (transaction) => {
        const walletRef = doc(db, 'wallets', user.uid);
        const walletDoc = await transaction.get(walletRef);
        
        if (!walletDoc.exists()) {
          transaction.set(walletRef, {
            userId: user.uid,
            balance: numAmount,
            currency: 'MWK',
            updatedAt: serverTimestamp()
          });
        } else {
          transaction.update(walletRef, {
            balance: walletDoc.data().balance + numAmount,
            updatedAt: serverTimestamp()
          });
        }

        let fromId = 'SYSTEM';
        let fromName = 'Deposit';
        let description = `Wallet load`;

        if (momoProvider === 'airtel') {
          fromId = 'AIRTEL_MONEY';
          fromName = 'Airtel Money Topup';
          description = `Wallet load via Airtel Money (+265${momoPhone})`;
        } else if (momoProvider === 'tnm') {
          fromId = 'TNM_MPAMBA';
          fromName = 'Mpamba Topup';
          description = `Wallet load via TNM Mpamba (+265${momoPhone})`;
        } else if (momoProvider === 'fdh') {
          fromId = 'FDH_MOBILE';
          fromName = 'FDH Mobilis';
          description = `Wallet load via FDH Ufulu (${momoPhone})`;
        } else if (momoProvider === 'nbm') {
          fromId = 'NBM_MO626';
          fromName = 'NBM Mo626 Deposit';
          description = `Wallet load via NBM Mo626 (${momoPhone})`;
        } else if (momoProvider === 'standard') {
          fromId = 'STANDARD_MOBILE';
          fromName = 'Standard Bank 247';
          description = `Wallet load via Standard Bank Mobile (${momoPhone})`;
        } else if (momoProvider === 'nbs') {
          fromId = 'NBS_EAZY';
          fromName = 'NBS EazyMobile Deposit';
          description = `Wallet load via NBS EazyMobile (${momoPhone})`;
        }

        // log transaction
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          fromId,
          toId: user.uid,
          fromName,
          toName: user.displayName || 'Me',
          amount: numAmount,
          type: 'topup',
          status: 'completed',
          category: 'Transfer',
          description,
          createdAt: serverTimestamp()
        });
      });

      const txnId = `TXN${Math.floor(10000000 + Math.random() * 90000000)}`;
      let smsText = "";
      if (momoProvider === 'airtel') {
        smsText = `Airtel Money: Txn ${txnId} completed. You have transferred K${numAmount.toLocaleString()} to ZATHU SUPER APP. Fee: K0. New balance available inside Zathu App.`;
      } else if (momoProvider === 'tnm') {
        smsText = `Mpamba Msg: K${numAmount.toLocaleString()} has been sent to ZATHU. Ref: ${txnId}. Thank you for using Mpamba.`;
      } else {
        smsText = `${selectedProv.name} Alert: K${numAmount.toLocaleString()} debited to ZATHU Wallets. Ref ${txnId}. Mobile Banking transfer successful.`;
      }
      
      setSmsNotification(smsText);
      if (onTopUpSuccess) {
        onTopUpSuccess(numAmount, `${selectedProv.name} (+265${momoPhone})`, txnId, selectedProv.short);
      } else {
        toast.success(`Loaded K${numAmount.toLocaleString()} successfully!`);
      }
      onComplete();
    } catch (err: any) {
      toast.error("Top up failed: " + err.message);
    } finally {
      setIsProcessingMomo(false);
      setPin('');
    }
  };

  const handleMomoInitiate = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(momoAmount);
    if (!numAmount || numAmount < 100) {
      toast.error("Minimum top up is K100");
      return;
    }
    if (!momoPhone || momoPhone.length < 9) {
      toast.error("Please enter a valid identifier/number");
      return;
    }
    setUssdOpen(true);
  };

  return (
    <div className="space-y-6 relative">
      {/* Method Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200/50">
        <button
          type="button"
          onClick={() => setMethod('momo')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
            method === 'momo'
              ? "bg-white dark:bg-slate-800 text-primary shadow-sm"
              : "text-text-muted hover:text-slate-900"
          )}
        >
          <Phone size={14} className="text-emerald-500" />
          Mobile Money / Bank
        </button>
        <button
          type="button"
          onClick={() => setMethod('card')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all",
            method === 'card'
              ? "bg-white dark:bg-slate-800 text-primary shadow-sm"
              : "text-text-muted hover:text-slate-900"
          )}
        >
          <CreditCard size={14} className="text-blue-500" />
          Credit Card
        </button>
      </div>

      {method === 'momo' ? (
        <form onSubmit={handleMomoInitiate} className="space-y-5">
          {/* Provider Selectors - Horizontally Scrollable System */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Select Provider (Scroll Left/Right)</label>
              <span className="text-[8px] font-black text-primary uppercase animate-pulse">Swipe &gt;</span>
            </div>
            
            <div className="flex gap-2.5 overflow-x-auto pb-4 pt-1.5 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300 scrollbar-track-transparent snap-x">
              {providers.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setMomoProvider(p.id as any)}
                  className={cn(
                    "p-3 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-1.5 relative overflow-hidden shrink-0 w-[105px] snap-center",
                    momoProvider === p.id
                      ? cn("border-transparent font-black shadow-md", p.color)
                      : "border-transparent bg-slate-50 hover:bg-slate-100 text-slate-500"
                  )}
                >
                  {momoProvider === p.id && (
                    <div className={cn(
                      "w-2 h-2 rounded-full absolute top-2 right-2",
                      p.activeBadge, "animate-pulse"
                    )} />
                  )}
                  {p.isBank ? (
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-xs font-black">
                      <Briefcase size={16} />
                    </div>
                  ) : (
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-[8px] font-black uppercase tracking-tighter",
                      p.id === 'airtel' ? "bg-red-600 text-white" : "bg-amber-500 text-slate-900"
                    )}>
                      {p.short}
                    </div>
                  )}
                  <span className="text-[10px] font-black uppercase tracking-tight text-center truncate w-full">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* momo Phone / Bank Account input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
              {providers.find(p => p.id === momoProvider)?.isBank ? 'Linked Bank Account Number' : 'Mobile Money Phone Number'}
            </label>
            <div className="relative">
              {!(providers.find(p => p.id === momoProvider)?.isBank) && (
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">+265</span>
              )}
              <Input
                type="tel"
                value={momoPhone}
                onChange={(e) => {
                  let val = e.target.value.replace(/\D/g, '');
                  if (!(providers.find(p => p.id === momoProvider)?.isBank)) {
                    if (val.startsWith('0')) val = val.substring(1);
                    setMomoPhone(val.substring(0, 9));
                  } else {
                    setMomoPhone(val.substring(0, 16)); // Allow up to 16 digit account number
                  }
                }}
                placeholder={providers.find(p => p.id === momoProvider)?.isBank ? "e.g. 100 293 841 29" : "e.g. 990 000 000"}
                className={cn(
                  "h-11 bg-slate-50 border-none rounded-2xl text-xs font-mono font-bold tracking-widest placeholder:tracking-normal w-full",
                  !(providers.find(p => p.id === momoProvider)?.isBank) ? "pl-14" : "pl-4"
                )}
                required
              />
            </div>
          </div>

          {/* momo Amount */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Amount (MWK)</label>
              <span className="text-[9px] font-bold text-emerald-600">No Transaction Fees</span>
            </div>
            <Input
              type="number"
              value={momoAmount}
              onChange={(e) => setMomoAmount(e.target.value)}
              placeholder="e.g. 5000"
              className="h-11 bg-slate-50 border-none rounded-2xl text-lg font-black tracking-wide"
              required
              min="100"
            />
            {/* Presets */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[1000, 5000, 10000, 20000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setMomoAmount(amt.toString())}
                  className="py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-[10px] font-bold border border-transparent hover:border-slate-200 transition-all text-center focus:outline-none"
                >
                  K{amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            disabled={isProcessingMomo}
            className={cn(
              "w-full h-12 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 border-none",
              momoProvider === 'airtel' ? "bg-red-600 hover:bg-red-700 shadow-red-600/10" :
              momoProvider === 'tnm' ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/10 text-slate-900" :
              momoProvider === 'fdh' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/10" :
              momoProvider === 'nbm' ? "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10" :
              momoProvider === 'standard' ? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10" :
              "bg-rose-600 hover:bg-rose-700 shadow-rose-600/10"
            )}
          >
            {isProcessingMomo ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <>
                <Send size={12} />
                Load Wallet via {providers.find(p => p.id === momoProvider)?.short}
              </>
            )}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleCardSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Amount (MWK)</label>
            <Input 
              type="number"
              placeholder="5000"
              value={cardAmount}
              onChange={(e) => setCardAmount(e.target.value)}
              className="h-11 bg-slate-50 border-none rounded-2xl text-lg font-black tracking-wide"
              required
              min="100"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Card Details</label>
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <CardElement options={{
                style: { base: { fontSize: '15px', color: '#1e293b', '::placeholder': { color: '#94a3b8' } } }
              }} />
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={isProcessingCard || !stripe} 
            className="w-full h-12 bg-primary hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/10 transition-all active:scale-95 border-none"
          >
            {isProcessingCard ? <Loader2 className="animate-spin" size={16} /> : `Top Up K${Number(cardAmount || 0).toLocaleString()}`}
          </Button>
        </form>
      )}

      {/* --- POPUP USSD PROMPT SIMULATOR --- */}
      <AnimatePresence>
        {ussdOpen && (
          <div className="fixed inset-0 bg-black/75 z-[200] flex items-center justify-center p-6 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-slate-900 text-white border border-white/10 rounded-3xl overflow-hidden w-full max-w-[290px] shadow-2xl font-sans"
            >
              {/* Carrier Header */}
              <div className={cn(
                "p-3.5 flex items-center justify-between border-b border-white/5",
                momoProvider === 'airtel' ? "bg-red-800" : 
                momoProvider === 'tnm' ? "bg-amber-600" :
                momoProvider === 'fdh' ? "bg-emerald-800" :
                momoProvider === 'nbm' ? "bg-blue-800" :
                momoProvider === 'standard' ? "bg-indigo-800" :
                "bg-rose-800"
              )}>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/95 leading-none">
                    {providers.find(p => p.id === momoProvider)?.name} Secure Gateway
                  </span>
                </div>
                <button 
                  type="button"
                  onClick={() => {
                    setUssdOpen(false);
                    setPin('');
                    toast.info('Transaction aborted by user');
                  }} 
                  className="text-white/40 hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Simulated Window Screen */}
              <div className="p-5 space-y-4">
                <p className="text-xs font-mono font-medium text-slate-100 leading-relaxed text-center">
                  Enter your {providers.find(p => p.id === momoProvider)?.name} 4-digit PIN to authorize payment of <span className="text-emerald-500 font-bold">K{Number(momoAmount).toLocaleString()}</span> to <span className="underline font-bold">ZATHU SUPER APP</span>.
                </p>

                <form onSubmit={handleMomoComplete} className="space-y-3">
                  <div className="relative">
                    <Input
                      type="password"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').substring(0, 4))}
                      placeholder="Enter PIN"
                      className="h-11 bg-white/10 border-white/10 text-white placeholder:text-white/30 text-center font-mono font-bold text-lg tracking-[0.4em] focus:bg-white/15 focus:ring-0 rounded-xl"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-2 pt-2 gap-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUssdOpen(false);
                        setPin('');
                        toast.info('Transaction aborted');
                      }}
                      className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-widest text-white/70 hover:bg-white/10 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pin.length < 4}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-white cursor-pointer border-none",
                        momoProvider === 'airtel' ? "bg-red-600 hover:bg-red-700" : 
                        momoProvider === 'tnm' ? "bg-amber-500 text-slate-900 hover:bg-amber-650" :
                        momoProvider === 'fdh' ? "bg-emerald-600 hover:bg-emerald-750" :
                        momoProvider === 'nbm' ? "bg-blue-500 hover:bg-blue-650" :
                        momoProvider === 'standard' ? "bg-indigo-500 hover:bg-indigo-650" :
                        "bg-rose-500 hover:bg-rose-650"
                      )}
                    >
                      Authorize
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- IN-APP SMS INBOX ALERT EASTER EGG --- */}
      <AnimatePresence>
        {smsNotification && (
          <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-xs z-[250]">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="bg-slate-900 text-white rounded-2xl border border-white/10 p-4 shadow-2xl space-y-2 relative"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="p-1 rounded bg-white/10">
                    <Bell size={14} className="text-amber-400 font-bold" />
                  </div>
                  <div>
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-300">Carrier Message</h5>
                    <p className="text-[8px] text-slate-500 font-mono">Just Now • SIM 1</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setSmsNotification(null)} 
                  className="text-white/40 hover:text-white p-1"
                >
                  <X size={12} />
                </button>
              </div>
              <p className="text-[10px] font-mono leading-relaxed text-slate-200">
                {smsNotification}
              </p>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setSmsNotification(null)}
                  className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1 hover:underline cursor-pointer bg-transparent border-none"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Wallet() {
  const { profile, user } = useAuth();
  const { t } = useSettings();
  const navigate = useNavigate();
  
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Custom states for frictionless premium UI
  const [successTransaction, setSuccessTransaction] = useState<{
    type: 'transfer' | 'topup' | 'cashout' | 'billpay';
    amount: number;
    recipient: string;
    ref: string;
    provider?: string;
  } | null>(null);
  
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showMyQR, setShowMyQR] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [showBillsModal, setShowBillsModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
  
  const [cashOutAmount, setCashOutAmount] = useState('');
  const [cashOutMethod, setCashOutMethod] = useState<'airtel' | 'tnm' | 'bank'>('airtel');
  const [cashOutAccount, setCashOutAccount] = useState('');
  const [cashOutUssdOpen, setCashOutUssdOpen] = useState(false);
  const [cashOutPin, setCashOutPin] = useState('');
  const [cashOutBankName, setCashOutBankName] = useState('Standard Bank');
  const [cashOutAccountName, setCashOutAccountName] = useState('');
  const [cashOutSmsNotification, setCashOutSmsNotification] = useState<string | null>(null);

  const [billType, setBillType] = useState<'escom' | 'water' | 'tv' | 'airtime' | 'internet'>('escom');
  const [billProvider, setBillProvider] = useState('');
  const [billAccount, setBillAccount] = useState('');
  const [billAmount, setBillAmount] = useState('');
  
  const [showTierInfo, setShowTierInfo] = useState(false);
  const [ads, setAds] = useState<any[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);
  const [showCreateAdModal, setShowCreateAdModal] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [aiInsights, setAiInsights] = useState<{ summary: string; tip: string; score: number } | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [pools, setPools] = useState<any[]>([]);
  const [showCreatePoolModal, setShowCreatePoolModal] = useState(false);
  const [newPoolName, setNewPoolName] = useState('');
  const [newPoolTarget, setNewPoolTarget] = useState('');
  const [newPoolFrequency, setNewPoolFrequency] = useState<'weekly' | 'monthly'>('monthly');
  const [newPoolContribution, setNewPoolContribution] = useState('');
  const [isBalanceVisible, setIsBalanceVisible] = useState(true);
  const [escrows, setEscrows] = useState<any[]>([]);

  // Payment methods addition states
  const [showAddPaymentMethodModal, setShowAddPaymentMethodModal] = useState(false);
  const [newMethodType, setNewMethodType] = useState<'momo' | 'card'>('momo');
  const [newMomoProvider, setNewMomoProvider] = useState<'airtel' | 'tnm'>('airtel');
  const [newMomoPhone, setNewMomoPhone] = useState('');
  const [newCardHolder, setNewCardHolder] = useState('');
  const [newCardNumber, setNewCardNumber] = useState('');
  const [newCardExpiry, setNewCardExpiry] = useState('');
  const [newCardCvv, setNewCardCvv] = useState('');
  const [localPaymentMethods, setLocalPaymentMethods] = useState<any[]>([]);

  useEffect(() => {
    if (profile?.paymentMethods) {
      setLocalPaymentMethods(profile.paymentMethods);
    }
  }, [profile]);

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be logged in to add a payment method");
      return;
    }
    
    setIsProcessing(true);
    try {
      const newMethod: any = {
        id: 'pm_' + Date.now(),
        type: newMethodType,
        createdAt: new Date().toISOString()
      };

      if (newMethodType === 'momo') {
        if (!newMomoPhone.trim()) {
          toast.error("Please enter a phone number");
          setIsProcessing(false);
          return;
        }
        const cleanedPhone = newMomoPhone.replace(/\s+/g, '');
        newMethod.provider = newMomoProvider;
        newMethod.label = newMomoProvider === 'airtel' ? 'Airtel Money' : 'TNM Mpamba';
        newMethod.number = '**** **** ' + cleanedPhone.slice(-4);
        newMethod.phone = newMomoPhone;
      } else {
        if (!newCardNumber.trim() || !newCardHolder.trim() || !newCardExpiry.trim() || !newCardCvv.trim()) {
          toast.error("Please fill in all card details");
          setIsProcessing(false);
          return;
        }
        const cleanedCard = newCardNumber.replace(/\s+/g, '');
        if (cleanedCard.length < 12) {
          toast.error("Invalid card number format");
          setIsProcessing(false);
          return;
        }
        const firstDigit = cleanedCard[0];
        const provider = firstDigit === '4' ? 'visa' : 'mastercard';
        newMethod.provider = provider;
        newMethod.label = provider === 'visa' ? 'Visa Card' : 'Mastercard';
        newMethod.number = '**** **** ' + cleanedCard.slice(-4);
        newMethod.cardHolder = newCardHolder;
        newMethod.cardExpiry = newCardExpiry;
      }

      const userDocRef = doc(db, 'users', user.uid);
      const existingMethods = Array.isArray(profile?.paymentMethods) ? profile.paymentMethods : [];
      const updatedMethods = [...existingMethods, newMethod];

      await updateDoc(userDocRef, {
        paymentMethods: updatedMethods,
        updatedAt: serverTimestamp()
      });

      setLocalPaymentMethods(updatedMethods);
      toast.success(t('wallet.addMethod') + " successful");
      
      // Reset fields
      setNewMomoPhone('');
      setNewCardHolder('');
      setNewCardNumber('');
      setNewCardExpiry('');
      setNewCardCvv('');
      setShowAddPaymentMethodModal(false);
    } catch (error) {
      console.error("Error adding payment method:", error);
      toast.error("Failed to add payment method");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeletePaymentMethod = async (methodId: string) => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to remove this payment method?")) return;

    setIsProcessing(true);
    try {
      const existingMethods = Array.isArray(profile?.paymentMethods) ? profile.paymentMethods : [];
      const updatedMethods = existingMethods.filter((m: any) => m.id !== methodId);

      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        paymentMethods: updatedMethods,
        updatedAt: serverTimestamp()
      });

      setLocalPaymentMethods(updatedMethods);
      toast.success("Payment method removed successfully");
    } catch (error) {
      console.error("Error deleting payment method:", error);
      toast.error("Failed to remove payment method");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'escrows'),
      or(where('buyerId', '==', user.uid), where('sellerId', '==', user.uid))
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setEscrows(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'escrows'));
    return () => unsubscribe();
  }, [user]);

  const handleReleaseEscrow = async (escrow: any) => {
    if (!user || user.uid !== escrow.buyerId) return;
    if (!window.confirm(`Release K${escrow.amount.toLocaleString()} to the seller? Confirm only if you have received the item.`)) return;

    setIsProcessing(true);
    try {
      await runTransaction(db, async (trans) => {
        const escrowRef = doc(db, 'escrows', escrow.id);
        const sellerWalletRef = doc(db, 'wallets', escrow.sellerId);
        const sellerWalletDoc = await trans.get(sellerWalletRef);

        if (!sellerWalletDoc.exists()) {
           // Create wallet if doesn't exist
           trans.set(sellerWalletRef, {
             userId: escrow.sellerId,
             balance: escrow.amount,
             currency: 'MWK',
             createdAt: serverTimestamp(),
             updatedAt: serverTimestamp()
           });
        } else {
          trans.update(sellerWalletRef, { 
            balance: increment(escrow.amount),
            updatedAt: serverTimestamp()
          });
        }

        trans.update(escrowRef, { status: 'released', updatedAt: serverTimestamp() });

        // Add transaction log for seller (receive side)
        const txRef = doc(collection(db, 'transactions'));
        trans.set(txRef, {
          fromId: user.uid,
          toId: escrow.sellerId,
          fromName: user.displayName || 'Buyer',
          toName: 'Zathu Merchant',
          amount: escrow.amount,
          type: 'receive',
          status: 'completed',
          category: 'Marketplace',
          description: `Escrow Release: "${escrow.itemName}"`,
          createdAt: serverTimestamp()
        });
      });
      toast.success("Funds released successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to release funds");
    } finally {
      setIsProcessing(false);
    }
  };

  const PROVIDERS = {
    escom: [{ id: 'escom', name: 'ESCOM Prepaid', icon: <Zap size={14} /> }],
    water: [
      { id: 'bwb', name: 'Blantyre Water Board', icon: <Droplets size={14} /> },
      { id: 'lwb', name: 'Lilongwe Water Board', icon: <Droplets size={14} /> },
      { id: 'nrwb', name: 'Northern Region WB', icon: <Droplets size={14} /> },
      { id: 'srwb', name: 'Southern Region WB', icon: <Droplets size={14} /> }
    ],
    tv: [
      { id: 'dstv', name: 'DStv', icon: <Tv size={14} /> },
      { id: 'gotv', name: 'GOtv', icon: <Tv size={14} /> },
      { id: 'zuku', name: 'Zuku TV', icon: <Tv size={14} /> },
      { id: 'kwicce', name: 'KwiCCe', icon: <Tv size={14} /> }
    ],
    airtime: [
      { id: 'airtel', name: 'Airtel Malawi', icon: <Phone size={14} /> },
      { id: 'tnm', name: 'TNM Malawi', icon: <Phone size={14} /> },
      { id: 'mtl', name: 'MTL Fixed', icon: <Phone size={14} /> }
    ],
    internet: [
      { id: 'airtel_data', name: 'Airtel Data', icon: <Globe size={14} /> },
      { id: 'tnm_data', name: 'TNM Data', icon: <Globe size={14} /> },
      { id: 'fiber_globe', name: 'Fiber / Globe', icon: <Globe size={14} /> }
    ],
    loans: [
      { id: 'zathu_advance', name: 'Zathu Salary Advance', icon: <Briefcase size={14} /> },
      { id: 'katapila_safe', name: 'Micro Business Loan', icon: <TrendingUp size={14} /> }
    ],
    insurance: [
      { id: 'life_fodya', name: 'Personal Accident', icon: <Shield size={14} /> },
      { id: 'health_zathu', name: 'Community Health', icon: <Heart size={14} /> }
    ]
  };

  const getTierDetails = () => {
    if (balance > 1000000) return { name: 'Diamond Node', cashback: 0.03, fee: 0 };
    if (balance > 100000) return { name: 'Gold Node', cashback: 0.15, fee: 0.01 };
    return { name: 'Standard Node', cashback: 0.005, fee: 0.02 };
  };

  // Initialize & Listen to Wallet
  useEffect(() => {
    if (!user) return;

    const walletRef = doc(db, 'wallets', user.uid);
    
    // Check if wallet exists once, then listen
    const initWallet = async () => {
      try {
        // Test connection and get data
        const snap = await getDocFromServer(walletRef).catch(() => getDoc(walletRef));
        
        if (!snap.exists()) {
          await setDoc(walletRef, {
            userId: user.uid,
            balance: 0,
            currency: 'MWK',
            updatedAt: serverTimestamp()
          });
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('offline')) {
          console.warn("Wallet initializing in offline mode");
          return;
        }
        console.error("Error initializing wallet:", err);
      }
    };
    initWallet();

    const unsubscribeWallet = onSnapshot(walletRef, (docSnap) => {
      if (docSnap.exists()) {
        setBalance(docSnap.data().balance);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `wallets/${user?.uid}`);
    });

    // Secure transaction listener matching firestore rules
    const q = query(
      collection(db, 'transactions'),
      or(where('fromId', '==', user.uid), where('toId', '==', user.uid)),
      orderBy('createdAt', 'desc'),
      limit(15)
    );

    const unsubscribeTrans = onSnapshot(q, (snap) => {
      const allTx = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .map(tx => ({
          id: tx.id,
          type: tx.type === 'topup' ? 'receive' : (tx.fromId === user.uid ? 'send' : 'receive'),
          title: tx.fromId === user.uid ? `To: ${tx.toName}` : `From: ${tx.fromName}`,
          amount: tx.fromId === user.uid ? -tx.amount : tx.amount,
          date: tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString() : 'Pending',
          category: tx.category || 'Transfer'
        }));
      setTransactions(allTx);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    // Savings Pools
    const poolQuery = query(collection(db, 'savings_pools'), where('status', '==', 'active'), limit(10));
    const unsubscribePools = onSnapshot(poolQuery, (snap) => {
      setPools(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'savings_pools');
    });

    return () => {
      unsubscribeWallet();
      unsubscribeTrans();
      unsubscribePools();
    };
  }, [user]);

  const handleCreatePool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'savings_pools'), {
        name: newPoolName,
        creatorId: user.uid,
        members: [user.uid],
        targetAmount: Number(newPoolTarget),
        contributionAmount: Number(newPoolContribution),
        frequency: newPoolFrequency,
        totalCollected: 0,
        status: 'active',
        createdAt: serverTimestamp()
      });
      toast.success("Savings pool created successfully!");
      setShowCreatePoolModal(false);
      setNewPoolName('');
      setNewPoolTarget('');
      setNewPoolContribution('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    setLoadingAds(true);
    const q = query(
      collection(db, 'ads'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoadingAds(false);
    }, (error) => {
      console.error("Error fetching ads:", error);
      setLoadingAds(false);
    });
    return () => unsubscribe();
  }, [user]);

  const handleJoinPool = async (poolId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'savings_pools', poolId), {
        members: Array.from(new Set([...(pools.find(p => p.id === poolId).members), user.uid]))
      });
      toast.success("Joined pool successfully!");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const amount = Number(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    
    if (amount > balance) {
      toast.error("Insufficient balance");
      return;
    }

    setIsProcessing(true);
    
    try {
      const txnId = `TXN${Math.floor(10000000 + Math.random() * 90000000)}`;
      await runTransaction(db, async (transaction) => {
        const myWalletRef = doc(db, 'wallets', user.uid);
        const myWallet = await transaction.get(myWalletRef);
        
        if (myWallet.data()!.balance < amount) {
          throw new Error("Insufficient balance during processing");
        }

        // 1. Subtract from me
        transaction.update(myWalletRef, {
          balance: myWallet.data()!.balance - amount,
          updatedAt: serverTimestamp()
        });

        // 2. Try to find recipient (by placeholder or actual UID if we had email/search)
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          fromId: user.uid,
          fromName: user.displayName || 'User',
          toId: 'EXTERNAL_USER', 
          toName: transferRecipient,
          amount: amount,
          type: 'send',
          status: 'completed',
          category: 'Transfer',
          description: `Transfer to ${transferRecipient}`,
          createdAt: serverTimestamp()
        });
      });

      setSuccessTransaction({
        type: 'transfer',
        amount: amount,
        recipient: transferRecipient,
        ref: txnId
      });
      setShowTransferModal(false);
      setTransferAmount('');
      setTransferRecipient('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCashOutBank = async () => {
    if (!user) return;
    setIsProcessing(true);
    const amount = Number(cashOutAmount);

    try {
      const txnId = `TXN${Math.floor(10000000 + Math.random() * 90000000)}`;
      await runTransaction(db, async (transaction) => {
        const myWalletRef = doc(db, 'wallets', user.uid);
        const myWallet = await transaction.get(myWalletRef);
        
        if (!myWallet.exists() || myWallet.data()!.balance < amount) {
          throw new Error("Insufficient balance during processing");
        }

        // 1. Subtract from balance
        transaction.update(myWalletRef, {
          balance: myWallet.data()!.balance - amount,
          updatedAt: serverTimestamp()
        });

        // 2. Log withdrawal transaction
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          fromId: user.uid,
          fromName: user.displayName || 'User',
          toId: 'BANK_SYSTEM', 
          toName: `${cashOutBankName} (${cashOutAccount})`,
          amount: amount,
          type: 'cashout',
          status: 'pending',
          category: 'Cashout',
          description: `Cash out to ${cashOutBankName} account ${cashOutAccount} (Holder: ${cashOutAccountName || user.displayName || 'Me'})`,
          createdAt: serverTimestamp()
        });
      });

      setSuccessTransaction({
        type: 'cashout',
        amount: amount,
        recipient: `${cashOutBankName} Account ${cashOutAccount}`,
        provider: 'BANK CLEARANCE',
        ref: txnId
      });
      setShowCashOutModal(false);
      setCashOutAmount('');
      setCashOutAccount('');
      setCashOutAccountName('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCashOutMomoComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const amount = Number(cashOutAmount);
    if (!cashOutPin || cashOutPin.length < 4) {
      toast.error("Please enter your 4-digit PIN");
      return;
    }

    setCashOutUssdOpen(false);
    setIsProcessing(true);

    try {
      // Simulate mobile operator network latency
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await runTransaction(db, async (transaction) => {
        const myWalletRef = doc(db, 'wallets', user.uid);
        const myWallet = await transaction.get(myWalletRef);
        
        if (!myWallet.exists() || myWallet.data()!.balance < amount) {
          throw new Error("Insufficient balance during processing");
        }

        // 1. Subtract from balance
        transaction.update(myWalletRef, {
          balance: myWallet.data()!.balance - amount,
          updatedAt: serverTimestamp()
        });

        // 2. Log completed withdrawal transaction
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          fromId: user.uid,
          fromName: user.displayName || 'User',
          toId: cashOutMethod === 'airtel' ? 'AIRTEL_MONEY' : 'TNM_MPAMBA',
          toName: cashOutMethod === 'airtel' ? 'Airtel Money Agent' : 'Mpamba Agent',
          amount: amount,
          type: 'cashout',
          status: 'completed',
          category: 'Cashout',
          description: `Cash out via ${cashOutMethod === 'airtel' ? 'Airtel Money' : 'Mpamba'} to ${cashOutAccount}`,
          createdAt: serverTimestamp()
        });
      });

      const txnId = `TXN${Math.floor(10000000 + Math.random() * 90000000)}`;
      const smsText = cashOutMethod === 'airtel'
        ? `Airtel Money: You have received K${amount.toLocaleString()} from ZATHU. Ref: ${txnId}. New Airtel Money wallet balance is increased. Manage your wallet with Airtel Money menu.`
        : `Mpamba Msg: K${amount.toLocaleString()} has been credited to your Mpamba from ZATHU. Ref No: ${txnId}. Thank you!`;

      setCashOutSmsNotification(smsText);
      setSuccessTransaction({
        type: 'cashout',
        amount: amount,
        recipient: `${cashOutMethod === 'airtel' ? 'Airtel Money Agent' : 'Mpamba Agent'} (+265${cashOutAccount})`,
        provider: cashOutMethod.toUpperCase(),
        ref: txnId
      });
      setShowCashOutModal(false);
      setCashOutAmount('');
      setCashOutAccount('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
      setCashOutPin('');
    }
  };

  const handleCashOutInitiate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const amount = Number(cashOutAmount);
    if (isNaN(amount) || amount < 1000) {
      toast.error("Minimum cash out is K1,000");
      return;
    }
    
    if (amount > balance) {
      toast.error("Insufficient balance");
      return;
    }

    if (cashOutMethod === 'bank') {
      handleCashOutBank();
    } else {
      if (!cashOutAccount || cashOutAccount.length < 9) {
        toast.error("Please enter a valid mobile money number");
        return;
      }
      setCashOutUssdOpen(true);
    }
  };

  const handlePayBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!billProvider) {
      toast.error("Please select a provider");
      return;
    }

    const amount = Number(billAmount);
    if (isNaN(amount) || amount < 100) {
      toast.error("Minimum bill payment is K100");
      return;
    }
    
    if (amount > balance) {
      toast.error("Insufficient balance");
      return;
    }

    setIsProcessing(true);
    const txnId = `TXN${Math.floor(10000000 + Math.random() * 90000000)}`;
    const tier = getTierDetails();
    const cashbackAmount = Math.floor(amount * tier.cashback);
    
    try {
      await runTransaction(db, async (transaction) => {
        const myWalletRef = doc(db, 'wallets', user.uid);
        const myWallet = await transaction.get(myWalletRef);
        
        if (!myWallet.exists() || myWallet.data()!.balance < amount) {
          throw new Error("Insufficient balance during processing");
        }

        const providerObj = PROVIDERS[billType].find(p => p.id === billProvider);
        const providerName = providerObj ? providerObj.name : billProvider;

        // 1. Subtract from balance and add cashback
        transaction.update(myWalletRef, {
          balance: myWallet.data()!.balance - amount + cashbackAmount,
          updatedAt: serverTimestamp()
        });

        // 2. Log billpay transaction
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          fromId: user.uid,
          fromName: user.displayName || 'User',
          toId: 'BILL_SYSTEM', 
          toName: `${providerName} (${billAccount})`,
          amount: amount,
          type: 'billpay',
          status: 'completed',
          category: 'Bills',
          description: `Bill payment for ${providerName} account ${billAccount}`,
          createdAt: serverTimestamp()
        });

        // 3. Log cashback if any
        if (cashbackAmount > 0) {
          const cbRef = doc(collection(db, 'transactions'));
          transaction.set(cbRef, {
            fromId: 'REWARDS_SYSTEM',
            fromName: 'Zathu Rewards',
            toId: user.uid,
            toName: user.displayName || 'User',
            amount: cashbackAmount,
            type: 'receive',
            status: 'completed',
            category: 'Rewards',
            description: `${tier.name} Cashback (${(tier.cashback * 100).toFixed(1)}%) for ${providerName} payment`,
            createdAt: serverTimestamp()
          });
        }
      });

      const providerObj = PROVIDERS[billType].find(p => p.id === billProvider);
      const providerName = providerObj ? providerObj.name : billProvider;

      setSuccessTransaction({
        type: 'billpay',
        amount: amount,
        recipient: `${providerName} (${billAccount})`,
        provider: `${billType.toUpperCase()} UTILITY`,
        ref: txnId
      });
      setShowBillsModal(false);
      setBillAmount('');
      setBillAccount('');
      setBillProvider('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchAIInsights = async () => {
    if (!user || transactions.length === 0) return;
    setLoadingAI(true);
    try {
      const data = await getWalletInsights(transactions.slice(0, 10), balance);
      setAiInsights(data);
    } catch (err: any) {
      console.error("Failed to fetch AI insights:", err);
      const errorMessage = err.message?.includes('403') 
        ? "AI Permission Error. Please check model availability." 
        : "AI Insight service temporarily unavailable";
      toast.error(errorMessage);
    } finally {
      setLoadingAI(false);
    }
  };

  // Calculate chart data from real transactions
  const chartData = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toLocaleDateString();
    const income = transactions
      .filter(tx => tx.type === 'receive' && tx.date === dateStr)
      .reduce((acc, tx) => acc + tx.amount, 0);
    return { name: d.toLocaleDateString('en-US', { weekday: 'short' }), income };
  });

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-slate-50 pb-24 min-h-screen">
      {/* Professional Navbar */}
      <div className="bg-white border-b border-border sticky top-0 z-50">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/profile" className="w-8 h-8 rounded-full overflow-hidden border border-border">
              <img src={profile?.photoURL || undefined} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </Link>
            <h1 className="text-sm font-black uppercase tracking-tighter">Zathu Wallet</h1>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/notifications')}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors relative"
            >
              <Bell size={18} className="text-text-main" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <Settings size={18} className="text-text-main" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-6">
        {/* Main Balance Card - Futuristic Version */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-8 text-white min-h-[240px] flex flex-col justify-between group"
        >
          {/* Virtual Card Overlay Patterns */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
          
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-32 -right-32 w-96 h-96 bg-primary/30 rounded-full blur-[120px]" 
          />

          <motion.div 
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [0.05, 0.15, 0.05],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="absolute -bottom-32 -left-32 w-80 h-80 bg-indigo-500/20 rounded-full blur-[100px]" 
          />
          
          <div className="relative z-10 flex-1">
            <div className="flex justify-between items-start mb-8">
              <div>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setShowTierInfo(true)}
                  className="flex items-center gap-2 mb-3"
                >
                   <div className="px-2 py-0.5 rounded-full bg-primary/20 border border-primary/30 flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                        {balance > 1000000 ? "Diamond Node" : balance > 100000 ? "Gold Node" : "Standard Node"}
                      </span>
                   </div>
                </motion.button>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 mb-1 ml-1">Current Balance</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold text-primary/70">MK</span>
                    <motion.h2 
                      key={balance}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-5xl font-black tracking-tighter tabular-nums drop-shadow-2xl flex items-center gap-3"
                    >
                      {isBalanceVisible ? balance.toLocaleString() : "••••••••"}
                      <button 
                        onClick={() => setIsBalanceVisible(!isBalanceVisible)}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                      >
                        {isBalanceVisible ? <EyeOff size={20} className="text-white/30" /> : <Eye size={20} className="text-white/30" />}
                      </button>
                    </motion.h2>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-3">
                 <div className="flex gap-2">
                   <button
                     onClick={(e) => { e.stopPropagation(); setShowQRScanner(true); }}
                     className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-md flex items-center justify-center transition-colors border border-white/10"
                   >
                     <ScanLine size={18} className="text-white" />
                   </button>
                   <button
                     onClick={(e) => { e.stopPropagation(); setShowMyQR(true); }}
                     className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-md flex items-center justify-center transition-colors border border-white/10"
                   >
                     <QrCode size={18} className="text-white" />
                   </button>
                 </div>
                 <div className="text-right">
                    <p className="text-[8px] font-mono text-white/40 tracking-widest uppercase">Quick Connect</p>
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-tight flex items-center gap-1 justify-end">
                      <ScanLine size={10} /> P2P Ready
                    </p>
                 </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-auto">
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Account Holder</p>
                  <p className="text-xs font-black uppercase tracking-tight text-white/90">{profile?.displayName?.slice(0, 20) || 'STASH HOLDER'}</p>
                </div>
                <div className="w-[1px] h-6 bg-white/10" />
                <div>
                   <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">Identity UID</p>
                   <p className="text-[9px] font-mono text-white/60 tracking-wider">****{user?.uid.slice(-6)}</p>
                </div>
              </div>
              <div className="flex -space-x-3 group-hover:-space-x-1 transition-all duration-500">
                 <div className="w-9 h-9 rounded-full bg-red-600/60 backdrop-blur-md border border-white/20 shadow-lg" />
                 <div className="w-9 h-9 rounded-full bg-orange-500/60 backdrop-blur-md border border-white/20 shadow-lg" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Horizontal Features Scrolling System */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[12px] font-black uppercase tracking-tighter flex items-center gap-2 text-text-main">
              <LayoutGrid size={14} className="text-primary" />
              Zathu Ecosystem
            </h3>
            <span className="text-[9px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full uppercase tracking-widest">Scroll & Explore</span>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 scrollbar-hide snap-x snap-mandatory">
            {[
              { id: 'airtime', icon: <Phone size={22} />, label: 'Airtime', color: 'bg-red-50 text-red-600 border-red-100', sub: 'Instant Recharge' },
              { id: 'escom', icon: <Zap size={22} />, label: 'Electricity', color: 'bg-amber-50 text-amber-600 border-amber-100', sub: 'Units & Tokens' },
              { id: 'water', icon: <Droplets size={22} />, label: 'Water Bills', color: 'bg-blue-50 text-blue-600 border-blue-100', sub: 'Regional Boards' },
              { id: 'tv', icon: <Tv size={22} />, label: 'Digital TV', color: 'bg-purple-50 text-purple-600 border-purple-100', sub: 'Pay DSTV/GoTV' },
              { id: 'internet', icon: <Globe size={22} />, label: 'Data Bundles', color: 'bg-emerald-50 text-emerald-600 border-emerald-100', sub: 'High Speed Net' },
              { id: 'loans', icon: <Briefcase size={22} />, label: 'Cash Advance', color: 'bg-indigo-50 text-indigo-600 border-indigo-100', sub: 'Loan Eligibility' },
              { id: 'insurance', icon: <Shield size={22} />, label: 'Insurance', color: 'bg-teal-50 text-teal-600 border-teal-100', sub: 'Secure Future' }
            ].map((item) => (
              <motion.button
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.95 }}
                key={item.id}
                onClick={() => {
                  setBillType(item.id as any);
                  setBillProvider(PROVIDERS[item.id as keyof typeof PROVIDERS]?.[0]?.id || '');
                  setShowBillsModal(true);
                }}
                className="flex flex-col items-center gap-3 min-w-[110px] snap-center group"
              >
                <div className={cn(
                   "w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-sm border transition-all relative overflow-hidden", 
                   item.color
                )}>
                  <div className="absolute inset-0 bg-white/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                  {item.icon}
                </div>
                <div className="text-center">
                  <span className="block text-[11px] font-black tracking-tight text-text-main">{item.label}</span>
                  <span className="block text-[8px] font-bold text-text-muted uppercase tracking-tighter opacity-70 whitespace-nowrap">{item.sub}</span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Zathu AI Financial Advisor */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-[2rem] p-6 text-white border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Sparkles size={100} />
          </div>
          
          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30">
                  <Bot size={22} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight">Zathu Smart AI Advisor</h3>
                  <p className="text-[10px] text-indigo-300/70 font-bold uppercase tracking-widest">Neural Spending Analysis</p>
                </div>
              </div>
              {!aiInsights && (
                <Button 
                  onClick={fetchAIInsights}
                  disabled={loadingAI}
                  size="sm" 
                  className="bg-primary hover:bg-emerald-600 text-white rounded-xl border-none text-[10px] font-black uppercase tracking-widest"
                >
                  {loadingAI ? <Loader2 className="animate-spin w-4 h-4" /> : "Analyze"}
                </Button>
              )}
            </div>

            {aiInsights ? (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4 pt-2 border-t border-white/10"
              >
                <div className="flex items-start gap-3">
                  <Activity size={16} className="text-primary mt-1 shrink-0" />
                  <p className="text-[12px] leading-relaxed text-indigo-100 font-medium italic">
                    "{aiInsights.summary}"
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="bg-white/5 rounded-2xl p-3 flex-1 border border-white/10">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Lightbulb size={12} className="text-yellow-400" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300">AI Saving Tip</span>
                    </div>
                    <p className="text-[11px] font-medium leading-tight text-white/90">{aiInsights.tip}</p>
                  </div>
                  <div className="bg-white/5 rounded-2xl p-3 w-20 flex flex-col items-center border border-white/10">
                    <span className="text-[8px] font-black uppercase tracking-widest text-indigo-300 mb-1">HS CORE</span>
                    <span className="text-xl font-black text-primary">{aiInsights.score}</span>
                  </div>
                </div>

                <button 
                  onClick={() => setAiInsights(null)}
                  className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/70 hover:text-primary transition-colors text-center w-full"
                >
                  Clear Analysis
                </button>
              </motion.div>
            ) : (
              <p className="text-[11px] text-indigo-200/60 font-medium leading-relaxed">
                Click analyze to get a deep dive into your spending habits powered by Gemini AI.
              </p>
            )}
          </div>
        </div>

        {/* Action Grid (Secondary) */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { id: 'topup', icon: <Plus size={18} />, label: 'Add Funds', sub: 'Deposit Cash', action: () => setShowTopUpModal(true) },
            { id: 'send', icon: <ArrowRightLeft size={18} />, label: 'Transfer', sub: 'Send Peer', action: () => setShowTransferModal(true) },
            { id: 'cashout', icon: <ArrowDownLeft size={18} />, label: 'Withdraw', sub: 'To Bank/MoMo', action: () => setShowCashOutModal(true) }
          ].map((action) => (
            <motion.button 
              whileTap={{ scale: 0.98 }}
              key={action.id} 
              onClick={action.action}
              className="group bg-white p-3.5 rounded-[2rem] border border-border flex flex-col items-center text-center shadow-sm hover:border-primary/30 transition-all cursor-pointer"
            >
              <div className="w-11 h-11 rounded-2xl bg-slate-50 text-slate-800 flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all shadow-inner mb-2.5 shrink-0">
                {action.icon}
              </div>
              <div>
                <span className="block text-[11px] font-black tracking-tight leading-tight">{action.label}</span>
                <span className="block text-[8px] font-bold text-text-muted uppercase tracking-widest mt-0.5 whitespace-nowrap">{action.sub}</span>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Analytics Section */}
        <div className="bg-white rounded-3xl border border-border p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[12px] font-black uppercase tracking-tighter flex items-center gap-2">
                <TrendingUp size={14} className="text-primary" />
                {t('wallet.spendingTrends')}
              </h3>
              <p className="text-[10px] text-text-muted font-bold tracking-tight">{t('wallet.last30days')}</p>
            </div>
            <div className="text-right">
               <p className="text-[14px] font-black tracking-tighter">MWK {transactions.filter(t => t.type === 'send').reduce((acc, t) => acc + Math.abs(t.amount), 0).toLocaleString()}</p>
               <p className="text-[8px] font-bold text-red-500 uppercase tracking-widest">Total Expenses</p>
            </div>
          </div>
          
          <div className="h-44 w-full -ml-8">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none',
                    fontSize: '10px',
                    fontWeight: 'black',
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                    backgroundColor: '#1e293b',
                    color: '#fff'
                  }}
                  itemStyle={{ color: '#10b981' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="income" 
                  stroke="#10b981" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorIncome)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Goal Progress */}
          <div className="pt-2 space-y-3">
             <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                <span className="text-text-muted">Savings Goal: MK 500,000</span>
                <span className="text-primary">{(balance / 500000 * 100).toFixed(1)}%</span>
             </div>
             <div className="h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-50">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(balance / 500000 * 100, 100)}%` }}
                  className="h-full bg-primary" 
                />
             </div>
          </div>
        </div>

        {/* Zathu Escrow Management */}
        {escrows.length > 0 && (
          <div className="bg-white rounded-3xl border border-border p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
               <h3 className="text-[12px] font-black uppercase tracking-tighter flex items-center gap-2">
                  <ShieldCheck size={14} className="text-primary" />
                  Active Escrow Holds
               </h3>
               <span className="text-[8px] font-black text-primary bg-primary/10 px-2 py-1 rounded-full uppercase tracking-widest">
                 {escrows.filter(e => e.status === 'held').length} Pending
               </span>
            </div>

            <div className="space-y-3">
              {escrows.map(escrow => {
                const isBuyer = escrow.buyerId === user?.uid;
                if (escrow.status === 'released') return null;

                return (
                  <div key={escrow.id} className="p-4 bg-slate-50 rounded-2xl border border-border space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                         <h4 className="font-black text-sm tracking-tight">{escrow.itemName}</h4>
                         <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">
                           {isBuyer ? 'Money you paid' : 'Incoming Payment'} • STATUS: {escrow.status.toUpperCase()}
                         </p>
                      </div>
                      <div className="text-right">
                         <p className="font-black text-[13px] text-primary">MK {escrow.amount.toLocaleString()}</p>
                         <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">Escrow Held</p>
                      </div>
                    </div>
                    
                    {isBuyer ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-[10px] text-text-muted font-medium italic mb-1">
                          Release funds only after you have physically received and inspected the item.
                        </p>
                        <Button 
                          onClick={() => handleReleaseEscrow(escrow)} 
                          disabled={isProcessing}
                          size="sm" 
                          className="w-full h-10 rounded-xl text-[10px] font-black uppercase bg-slate-900 hover:bg-black text-white"
                        >
                          {isProcessing ? <Loader2 className="animate-spin" /> : "Confirm Receipt & Release"}
                        </Button>
                      </div>
                    ) : (
                      <div className="p-3 bg-white/50 rounded-xl border border-border/50">
                        <p className="text-[10px] text-text-muted font-medium leading-tight">
                          Waiting for the buyer to confirm receipt. Contact them if you have already delivered the item.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Community Savings (Chitipa) */}
        <div className="bg-white rounded-3xl border border-border p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
             <h3 className="text-[12px] font-black uppercase tracking-tighter flex items-center gap-2">
                <Droplets size={14} className="text-primary" />
                {t('wallet.chitipa')}
             </h3>
             <Button 
               size="sm" 
               className="h-8 rounded-xl bg-emerald-50 text-primary border-none shadow-none text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100"
               onClick={() => setShowCreatePoolModal(true)}
             >
                <Plus size={14} className="mr-1" />
                {t('wallet.createPool')}
             </Button>
          </div>

          <div className="space-y-3">
            {pools.length === 0 ? (
               <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-border">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest leading-relaxed">
                    No active savings pools.<br/>Start a group with friends!
                  </p>
               </div>
            ) : (
              pools.map(pool => (
                <div key={pool.id} className="p-4 bg-slate-50 rounded-2xl border border-border space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                       <h4 className="font-black text-sm tracking-tight">{pool.name}</h4>
                       <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">
                         {pool.frequency} • {pool.members.length} {t('wallet.members')}
                       </p>
                    </div>
                    <div className="text-right">
                       <p className="font-black text-[11px]">MK {pool.targetAmount.toLocaleString()}</p>
                       <p className="text-[8px] font-bold text-text-muted uppercase tracking-widest">{t('wallet.target')}</p>
                    </div>
                  </div>
                  
                  <div className="h-1.5 bg-white rounded-full overflow-hidden">
                     <div className="h-full bg-primary" style={{ width: `${(pool.totalCollected / pool.targetAmount * 100) || 5}%` }} />
                  </div>

                  <div className="flex gap-2">
                    {pool.members.includes(user?.uid) ? (
                       <Button size="sm" className="flex-1 h-9 rounded-xl text-[10px] font-black uppercase bg-primary text-white">
                         {t('wallet.contribution')}
                       </Button>
                    ) : (
                      <Button onClick={() => handleJoinPool(pool.id)} size="sm" variant="outline" className="flex-1 h-9 rounded-xl text-[10px] font-black uppercase border-primary text-primary">
                        Join Group
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Zathu Business & Ads */}
        <div className="bg-indigo-900 rounded-[2rem] p-6 text-white border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Target size={100} />
          </div>
          
          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 text-primary">
                  <TrendingUp size={22} />
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-tight">Zathu Business Growth</h3>
                  <p className="text-[10px] text-indigo-300/70 font-bold uppercase tracking-widest">Global Malawi Reach</p>
                </div>
              </div>
              <Button 
                onClick={() => setShowCreateAdModal(true)}
                size="sm" 
                className="bg-primary hover:bg-emerald-600 text-white rounded-xl border-none text-[10px] font-black uppercase tracking-widest"
              >
                Boost
              </Button>
            </div>

            {ads.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 mt-2">
                 <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-center">
                    <p className="text-2xl font-black text-primary">{ads.reduce((acc, a) => acc + (a.impressions || 0), 0)}</p>
                    <p className="text-[8px] font-bold text-indigo-300 uppercase tracking-widest">Total Reach</p>
                 </div>
                 <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-center">
                    <p className="text-2xl font-black text-emerald-400">{ads.reduce((acc, a) => acc + (a.clicks || 0), 0)}</p>
                    <p className="text-[8px] font-bold text-indigo-300 uppercase tracking-widest">Ad Conversions</p>
                 </div>
              </div>
            ) : (
              <p className="text-[11px] text-indigo-200/60 font-medium leading-relaxed">
                Start your first advertising campaign to reach thousands of Malawians across the platform.
              </p>
            )}

            <div className="flex items-center justify-between px-1">
               <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-300">Active Campaigns</h4>
               {ads.length > 3 && (
                 <div className="flex gap-1">
                   <button 
                     onClick={() => {
                       const el = document.getElementById('ads-scroller-wallet');
                       if (el) el.scrollBy({ left: -150, behavior: 'smooth' });
                     }}
                     className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                   >
                     <ChevronLeft size={12} />
                   </button>
                   <button 
                     onClick={() => {
                       const el = document.getElementById('ads-scroller-wallet');
                       if (el) el.scrollBy({ left: 150, behavior: 'smooth' });
                     }}
                     className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                   >
                     <ChevronRight size={12} />
                   </button>
                 </div>
               )}
            </div>

            <div 
              id="ads-scroller-wallet"
              className="flex gap-3 overflow-x-auto scrollbar-hide py-1 snap-x scroll-pl-1"
            >
              {ads.length === 0 ? (
                <div className="w-full py-4 text-center border border-dashed border-white/10 rounded-xl bg-white/5">
                  <p className="text-[10px] font-bold text-indigo-300/40 italic">No active campaigns</p>
                </div>
              ) : (
                ads.map(ad => (
                  <div 
                    key={ad.id} 
                    className="shrink-0 w-48 flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10 snap-start hover:bg-white/10 transition-colors cursor-pointer group/item"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300 shrink-0">
                        {ad.placement === 'feed' ? <LayoutGrid size={16} /> : <ShoppingCart size={16} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-black truncate">{ad.title}</p>
                        <p className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest">{ad.status}</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-indigo-400 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[12px] font-black uppercase tracking-tighter flex items-center gap-2">
              <History size={14} className="text-text-muted" />
              {t('wallet.recentTransactions')}
            </h3>
            <button className="text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-text-main flex items-center gap-1">
              View All <ChevronRight size={12} />
            </button>
          </div>

          <div className="space-y-2">
            {transactions.map((tx) => (
              <motion.div 
                whileHover={{ x: 5 }}
                key={tx.id} 
                className="bg-white p-4 rounded-2xl border border-border flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    tx.type === 'receive' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-600"
                  )}>
                    {tx.type === 'receive' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black tracking-tight">{tx.title}</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">{tx.category}</span>
                      <span className="text-[9px] text-text-muted">•</span>
                      <span className="text-[9px] font-bold text-text-muted">{tx.date}</span>
                    </div>
                  </div>
                </div>
                <p className={cn(
                  "text-sm font-black tabular-nums",
                  tx.type === 'receive' ? "text-emerald-600" : "text-text-main"
                )}>
                  {tx.type === 'receive' ? '+' : ''}{tx.amount.toLocaleString()}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Connected Methods */}
        <div className="bg-slate-900 rounded-3xl p-6 text-white space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              {t('wallet.paymentMethods')}
            </h3>
            <button 
              onClick={() => setShowAddPaymentMethodModal(true)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-all cursor-pointer"
              title={t('wallet.addMethod')}
            >
              <Plus size={16} />
            </button>
          </div>
          
          <div className="flex gap-3 overflow-x-auto scrollbar-hide py-2">
            {[
              { id: 'default-airtel', type: 'momo', provider: 'airtel', number: '**** **** 8271', label: 'Airtel Money' },
              { id: 'default-tnm', type: 'momo', provider: 'tnm', number: '**** **** 4492', label: 'TNM Mpamba' },
              ...localPaymentMethods
            ].map((method) => (
              <div key={method.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 min-w-[200px] shrink-0 space-y-4 relative group/card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-sans">
                    {method.type === 'momo' ? (
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-[7px] font-black shrink-0 uppercase",
                        method.provider === 'airtel' ? "bg-red-600 text-white" : "bg-yellow-500 text-black"
                      )}>
                        {method.provider}
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/25 text-indigo-300 flex items-center justify-center shrink-0">
                        <CreditCard size={14} />
                      </div>
                    )}
                    <span className="text-xs font-bold tracking-tight">{method.label}</span>
                  </div>
                  
                  {!method.id.startsWith('default-') && (
                    <button 
                      onClick={() => handleDeletePaymentMethod(method.id)}
                      className="w-5 h-5 rounded-full bg-white/10 hover:bg-red-500/80 flex items-center justify-center transition-all lg:opacity-0 group-hover/card:opacity-100 opacity-100 cursor-pointer"
                      title="Remove Method"
                    >
                      <X size={10} className="text-white" />
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-mono text-slate-400 leading-none">{method.number}</p>
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {showTierInfo && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-border"
              >
                <div className="p-6 space-y-6">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mx-auto">
                      <ShieldCheck size={32} />
                    </div>
                    <h2 className="text-xl font-black">Zathu Node Tiers</h2>
                    <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest">Premium Rewards System</p>
                  </div>

                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 scrollbar-hide pb-4">
                      {[
                        { 
                          name: 'Standard Node', 
                          req: '0 - 100k MK', 
                          perks: ['Standard 2% Fee', 'Basic AI Insights', '0.5% Bill Cashback'],
                          active: balance <= 100000,
                          color: 'bg-slate-50 border-slate-200'
                        },
                        { 
                          name: 'Gold Node', 
                          req: '100k - 1M MK', 
                          perks: ['Reduced 1% Fee', 'Priority Cash-out', 'Advanced AI', '1.5% Bill Cashback'],
                          active: balance > 100000 && balance <= 1000000,
                          color: 'bg-amber-50 border-amber-200'
                        },
                        { 
                          name: 'Diamond Node', 
                          req: '1M+ MK', 
                          perks: ['0% Peer Fee', 'Instant Cash-out', 'Zathu Concierge', '3.0% Bill Cashback'],
                          active: balance > 1000000,
                          color: 'bg-indigo-50 border-indigo-200'
                        }
                      ].map(tier => (
                      <div key={tier.name} className={cn(
                        "p-4 rounded-2xl border transition-all",
                        tier.color,
                        tier.active ? "ring-2 ring-primary ring-offset-2" : "opacity-60"
                      )}>
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-black text-sm">{tier.name}</h4>
                          {tier.active && <span className="text-[8px] bg-primary text-white px-2 py-0.5 rounded-full font-black uppercase">Active</span>}
                        </div>
                        <p className="text-[9px] font-bold text-text-muted mb-2 italic">Requirement: {tier.req}</p>
                        <div className="space-y-1">
                          {tier.perks.map(perk => (
                            <div key={perk} className="flex items-center gap-2 text-[10px] font-medium">
                              <Check className="text-emerald-500" size={10} />
                              {perk}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button 
                    onClick={() => setShowTierInfo(false)}
                    className="w-full h-12 bg-slate-900 text-white font-bold rounded-xl"
                  >
                    Got it
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Add Payment Method Modal */}
        <AnimatePresence>
          {showAddPaymentMethodModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-border"
              >
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                    <CreditCard size={18} className="text-primary" />
                    {t('wallet.addMethod')}
                  </h3>
                  <button 
                    onClick={() => setShowAddPaymentMethodModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                  >
                    <X size={20} className="text-text-muted" />
                  </button>
                </div>
                
                <form onSubmit={handleAddPaymentMethod} className="p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setNewMethodType('momo')}
                      className={cn(
                        "py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                        newMethodType === 'momo' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Mobile Money
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewMethodType('card')}
                      className={cn(
                        "py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                        newMethodType === 'card' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                      )}
                    >
                      Credit/Debit Card
                    </button>
                  </div>

                  {newMethodType === 'momo' ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Provider</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setNewMomoProvider('airtel')}
                            className={cn(
                              "flex items-center justify-center gap-2 p-3 rounded-2xl border-2 transition-all relative overflow-hidden h-12 text-center cursor-pointer",
                              newMomoProvider === 'airtel' 
                                ? "border-red-500 bg-red-500/5 text-red-600 font-bold"
                                : "border-transparent bg-slate-50 hover:bg-slate-100/80 text-slate-500"
                            )}
                          >
                            <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-[5px] font-black text-white uppercase tracking-tighter">airtel</div>
                            <span className="text-xs">Airtel Money</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewMomoProvider('tnm')}
                            className={cn(
                              "flex items-center justify-center gap-2 p-3 rounded-2xl border-2 transition-all relative overflow-hidden h-12 text-center cursor-pointer",
                              newMomoProvider === 'tnm' 
                                ? "border-amber-500 bg-amber-500/5 text-amber-700 font-bold"
                                : "border-transparent bg-slate-50 hover:bg-slate-100/80 text-slate-500"
                            )}
                          >
                            <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[7px] font-black text-slate-900 tracking-tighter">tnm</div>
                            <span className="text-xs">TNM Mpamba</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Phone Number</label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted shrink-0" size={14} />
                          <Input
                            type="tel"
                            placeholder="e.g. +265 888 12 34 56"
                            value={newMomoPhone}
                            onChange={(e) => setNewMomoPhone(e.target.value)}
                            className="pl-10 h-11 bg-slate-50 border-slate-200 rounded-xl text-xs font-mono"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Cardholder Name</label>
                        <Input
                          type="text"
                          placeholder="John Doe"
                          value={newCardHolder}
                          onChange={(e) => setNewCardHolder(e.target.value)}
                          className="h-11 bg-slate-50 border-slate-200 rounded-xl text-xs"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Card Number</label>
                        <div className="relative">
                          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted shrink-0" size={14} />
                          <Input
                            type="text"
                            placeholder="4000 1234 5678 9010"
                            maxLength={19}
                            value={newCardNumber}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
                              setNewCardNumber(v);
                            }}
                            className="pl-10 h-11 bg-slate-50 border-slate-200 rounded-xl text-xs font-mono"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">Expiry Date</label>
                          <Input
                            type="text"
                            placeholder="MM/YY"
                            maxLength={5}
                            value={newCardExpiry}
                            onChange={(e) => {
                              let v = e.target.value;
                              if (v.length === 2 && !v.includes('/')) {
                                v = v + '/';
                              }
                              setNewCardExpiry(v);
                            }}
                            className="h-11 bg-slate-50 border-slate-200 rounded-xl text-xs font-mono"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest block">CVV</label>
                          <Input
                            type="password"
                            placeholder="***"
                            maxLength={3}
                            value={newCardCvv}
                            onChange={(e) => setNewCardCvv(e.target.value.replace(/\D/g, ''))}
                            className="h-11 bg-slate-50 border-slate-200 rounded-xl text-xs font-mono"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <Button 
                      type="submit" 
                      disabled={isProcessing}
                      className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black tracking-wide uppercase transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        t('wallet.addMethod')
                      )}
                    </Button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showMyQR && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-border"
              >
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                    <QrCode size={18} className="text-primary" />
                    My QR Code
                  </h3>
                  <button 
                    onClick={() => setShowMyQR(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-text-muted" />
                  </button>
                </div>
                <div className="p-8 flex flex-col items-center justify-center space-y-6">
                  <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                    <QRCodeSVG 
                      value={`zathu:${user?.uid}`} 
                      size={200} 
                      fgColor="#0f172a" 
                      level="H"
                    />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="font-bold text-slate-800">{profile?.displayName || 'Zathu User'}</p>
                    <p className="text-xs text-slate-500">Scan this code to send me money instantly</p>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showQRScanner && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-border"
              >
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                    <ScanLine size={18} className="text-primary" />
                    Scan QR
                  </h3>
                  <button 
                    onClick={() => setShowQRScanner(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-text-muted" />
                  </button>
                </div>
                <div className="p-6">
                  <QRScannerComponent 
                    onScan={(data) => {
                      setShowQRScanner(false);
                      const uidMatch = data.match(/^zathu:(.+)$/);
                      if (uidMatch) {
                        setTransferRecipient(uidMatch[1]);
                        setShowTransferModal(true);
                      } else {
                        // Assuming it's just raw phone number or UID if it doesn't match zathu:
                        setTransferRecipient(data);
                        setShowTransferModal(true);
                      }
                    }} 
                    onClose={() => setShowQRScanner(false)} 
                  />
                  <p className="text-center text-xs text-slate-500 mt-4">Point your camera at a Zathu QR code</p>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showTransferModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-border"
              >
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                    <Send size={18} className="text-primary" />
                    Send Money
                  </h3>
                  <button 
                    onClick={() => setShowTransferModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-text-muted" />
                  </button>
                </div>
                
                <form onSubmit={handleTransfer} className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Recipient Name or Phone</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <UserCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                          <Input 
                            placeholder="e.g. 0990000000"
                            value={transferRecipient}
                            onChange={(e) => setTransferRecipient(e.target.value)}
                            className="pl-9 h-12 bg-slate-50 border-none rounded-xl"
                            required
                          />
                        </div>
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => {
                            setShowTransferModal(false);
                            setShowQRScanner(true);
                          }}
                          className="h-12 w-12 rounded-xl shrink-0 p-0 border-slate-200"
                        >
                          <ScanLine size={18} className="text-primary" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Amount (MWK)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-text-muted">K</span>
                        <Input 
                          type="number"
                          placeholder="0.00"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          className="pl-8 h-14 text-xl font-black bg-slate-50 border-none rounded-xl tabular-nums tracking-tighter"
                          required
                        />
                      </div>
                      <p className="text-[10px] text-text-muted font-medium flex justify-between">
                        <span>Available Balance:</span>
                        <span className="text-primary font-black">MWK {balance.toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                  
                  <Button 
                    type="submit"
                    disabled={isProcessing}
                    className="w-full h-14 bg-primary text-white font-bold text-lg rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
                  >
                    {isProcessing ? 'Processing...' : 'Send Money'}
                  </Button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Top Up Modal */}
        <AnimatePresence>
          {showTopUpModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-border flex flex-col max-h-[90vh]"
              >
                <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
                  <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                    <Plus size={18} className="text-primary" />
                    Top Up Wallet
                  </h3>
                  <button 
                    onClick={() => setShowTopUpModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-text-muted" />
                  </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-250 hover:scrollbar-thumb-slate-350 scrollbar-track-transparent">
                  <Elements stripe={stripePromise}>
                    <TopUpForm 
                      onComplete={() => setShowTopUpModal(false)}
                      onTopUpSuccess={(amount, recipient, ref, provider) => {
                        setSuccessTransaction({
                          type: 'topup',
                          amount,
                          recipient,
                          ref,
                          provider
                        });
                      }}
                    />
                  </Elements>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Cash Out Modal */}
        <AnimatePresence>
          {showCashOutModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-border"
              >
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                    <ArrowDownLeft size={18} className="text-primary" />
                    Cash Out Funds
                  </h3>
                  <button 
                    onClick={() => setShowCashOutModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-text-muted" />
                  </button>
                </div>
                
                <form onSubmit={handleCashOutInitiate} className="p-6 space-y-5">
                  <div className="space-y-4">
                    {/* Branded Cashout Method Toggle */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'airtel', label: 'Airtel Money', color: 'border-red-500 bg-red-500/5 text-red-600', activeBadge: 'bg-red-500', isAirtel: true },
                        { id: 'tnm', label: 'TNM Mpamba', color: 'border-amber-500 bg-amber-500/5 text-amber-700', activeBadge: 'bg-amber-500', isTnm: true },
                        { id: 'bank', label: 'Bank Transfer', color: 'border-blue-500 bg-blue-500/5 text-blue-600', activeBadge: 'bg-blue-500', isBank: true }
                      ].map(method => (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => setCashOutMethod(method.id as any)}
                          className={cn(
                            "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border-2 transition-all relative overflow-hidden h-16 min-h-[4rem] text-center",
                            cashOutMethod === method.id 
                              ? cn("border-transparent font-black shadow-md", method.color)
                              : "border-transparent bg-slate-50 hover:bg-slate-100/80 text-slate-500"
                          )}
                        >
                          {cashOutMethod === method.id && (
                            <div className={cn("w-1.5 h-1.5 rounded-full absolute top-1.5 right-1.5", method.activeBadge, "animate-pulse")} />
                          )}
                          {method.isAirtel && <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-[5px] font-black text-white uppercase tracking-tighter">airtel</div>}
                          {method.isTnm && <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center text-[7px] font-black text-slate-900 tracking-tighter">tnm</div>}
                          {method.isBank && <Briefcase size={14} className={cashOutMethod === 'bank' ? "text-blue-500" : "text-slate-400"} />}
                          <span className="text-[9px] font-bold tracking-tight whitespace-nowrap">{method.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Method Specific Inputs */}
                    {cashOutMethod === 'bank' ? (
                      <div className="space-y-3.5 pt-1">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Select Bank</label>
                          <select
                            value={cashOutBankName}
                            onChange={(e) => setCashOutBankName(e.target.value)}
                            className="w-full h-11 px-3 bg-slate-50 border-none rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="Standard Bank">Standard Bank Malawi</option>
                            <option value="National Bank of Malawi">National Bank of Malawi (NBM)</option>
                            <option value="FDH Bank">FDH Bank Limited</option>
                            <option value="NBS Bank">NBS Bank Limited</option>
                            <option value="MyBucks Bank">MyBucks Bank Malawi</option>
                            <option value="Ecobank Malawi">Ecobank Malawi</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Account Number</label>
                          <Input
                            placeholder="e.g. 1002938475"
                            value={cashOutAccount}
                            onChange={(e) => setCashOutAccount(e.target.value.replace(/\D/g, ''))}
                            className="h-11 bg-slate-50 border-none rounded-2xl text-xs font-mono font-bold tracking-wider"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Account Holder Name</label>
                          <Input
                            placeholder="e.g. Jean Phiri"
                            value={cashOutAccountName}
                            onChange={(e) => setCashOutAccountName(e.target.value)}
                            className="h-11 bg-slate-50 border-none rounded-2xl text-xs font-bold"
                            required
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 pt-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                          Registered {cashOutMethod === 'airtel' ? 'Airtel Money' : 'Mpamba'} Phone Number
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 font-mono">+265</span>
                          <Input
                            type="tel"
                            value={cashOutAccount}
                            onChange={(e) => {
                              let val = e.target.value.replace(/\D/g, '');
                              if (val.startsWith('0')) val = val.substring(1);
                              setCashOutAccount(val.substring(0, 9));
                            }}
                            placeholder="e.g. 990 000 000"
                            className="pl-14 h-11 bg-slate-50 border-none rounded-2xl text-xs font-mono font-bold tracking-widest placeholder:tracking-normal"
                            required
                          />
                        </div>
                        <p className="text-[8px] text-text-muted font-bold italic mt-1">
                          Funds will be transferred directly to this {cashOutMethod === 'airtel' ? 'Airtel Money' : 'Mpamba'} mobile wallet.
                        </p>
                      </div>
                    )}
                    
                    {/* Cashout Amount */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Amount (MWK)</label>
                        <span className="text-[9px] font-bold text-text-muted">Min: K1,000</span>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">K</span>
                        <Input 
                          type="number"
                          placeholder="e.g. 5000"
                          value={cashOutAmount}
                          onChange={(e) => setCashOutAmount(e.target.value)}
                          className="pl-8 h-11 bg-slate-50 border-none rounded-2xl text-md font-black tracking-wide"
                          required
                          min="1000"
                        />
                      </div>
                      <p className="text-[9px] text-text-muted font-bold flex justify-between px-1">
                        <span>Wallet Balance:</span>
                        <span className="text-primary font-black">K{balance.toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                  
                  <Button 
                    type="submit"
                    disabled={isProcessing}
                    className="w-full h-12 bg-primary hover:bg-emerald-600 border-none text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/10 transition-transform active:scale-95"
                  >
                    {isProcessing ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <>
                        <ArrowDownLeft size={12} className="mr-1" />
                        Cash Out K{Number(cashOutAmount || 0).toLocaleString()}
                      </>
                    )}
                  </Button>
                  <p className="text-[8px] text-text-muted text-center italic leading-tight">
                    {cashOutMethod === 'bank' 
                      ? 'Bank transfers are cleared within 24 business hours.' 
                      : 'Mobile Money cashout usually processes instantly.'}
                  </p>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Bills Payment Modal */}
        <AnimatePresence>
          {showBillsModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-border"
              >
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                    <CreditCard size={18} className="text-primary" />
                    Pay Utility Bills
                  </h3>
                  <button 
                    onClick={() => setShowBillsModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-text-muted" />
                  </button>
                </div>
                
                <form onSubmit={handlePayBill} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto scrollbar-hide">
                  <div className="space-y-4">
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
                      {[
                        { id: 'escom', label: 'Elec', icon: <Zap size={14} /> },
                        { id: 'water', label: 'Water', icon: <Droplets size={14} /> },
                        { id: 'tv', label: 'TV', icon: <Tv size={14} /> },
                        { id: 'internet', label: 'Data', icon: <Globe size={14} /> },
                        { id: 'airtime', label: 'Airtime', icon: <Phone size={14} /> },
                        { id: 'loans', label: 'Loans', icon: <Briefcase size={14} /> },
                        { id: 'insurance', label: 'Insur', icon: <Shield size={14} /> }
                      ].map(type => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => {
                            setBillType(type.id as any);
                            setBillProvider('');
                          }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 p-3 min-w-[70px] rounded-xl border-2 transition-all text-center snap-center",
                            billType === type.id 
                              ? "border-primary bg-primary/5 text-primary" 
                              : "border-transparent bg-slate-50 text-text-muted"
                          )}
                        >
                          {type.icon}
                          <span className="text-[10px] font-black uppercase whitespace-nowrap">{type.label}</span>
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Select Provider</label>
                       <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1 scrollbar-hide">
                         {PROVIDERS[billType as keyof typeof PROVIDERS]?.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setBillProvider(p.id)}
                              className={cn(
                                "p-3 rounded-xl border-2 text-[10px] font-bold transition-all text-left flex items-center gap-2",
                                billProvider === p.id
                                  ? "border-primary bg-primary/5 text-primary"
                                  : "border-transparent bg-slate-50 text-text-muted"
                              )}
                            >
                              {p.icon}
                              {p.name}
                            </button>
                         ))}
                       </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Account / Meter Number</label>
                      <Input 
                        placeholder={
                          billType === 'escom' ? "Meter Number" : 
                          billType === 'airtime' || billType === 'internet' ? "Phone Number" : "Account ID"
                        }
                        value={billAccount}
                        onChange={(e) => setBillAccount(e.target.value)}
                        className="h-12 bg-slate-50 border-none rounded-xl"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-muted uppercase tracking-wider">Amount (MWK)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-text-muted">K</span>
                        <Input 
                          type="number"
                          placeholder="min. 100"
                          value={billAmount}
                          onChange={(e) => setBillAmount(e.target.value)}
                          className="pl-8 h-14 text-xl font-black bg-slate-50 border-none rounded-xl tabular-nums tracking-tighter"
                          required
                        />
                      </div>
                      <div className="flex justify-between items-center bg-emerald-50 p-2 rounded-xl mt-2">
                         <div className="flex items-center gap-1.5">
                            <Sparkles size={12} className="text-primary" />
                            <span className="text-[9px] font-black uppercase text-primary tracking-widest">
                               {getTierDetails().name} Perk
                            </span>
                         </div>
                         <span className="text-[10px] font-bold text-emerald-700">
                           +K{Math.floor(Number(billAmount || 0) * getTierDetails().cashback).toLocaleString()} Cashback
                         </span>
                      </div>
                    </div>
                  </div>
                  
                  <Button 
                    type="submit"
                    disabled={isProcessing || Number(billAmount) > balance || !billProvider}
                    className="w-full h-14 bg-slate-900 text-white font-bold text-lg rounded-2xl shadow-xl hover:scale-[1.02] transition-transform"
                  >
                    {isProcessing ? 'Processing Payment...' : `Confirm Payment`}
                  </Button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Tier Info Modal */}
        <AnimatePresence>
          {showTierInfo && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-950 w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 text-white"
              >
                <div className="p-6 space-y-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-black tracking-tight">Tier Rewards</h3>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Node Status Benefits</p>
                    </div>
                    <button onClick={() => setShowTierInfo(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {[
                      { name: 'Standard Node', range: 'K0 - K100k', cashback: '0.5%', color: 'border-white/5 bg-white/5' },
                      { name: 'Gold Node', range: 'K100k - K1M', cashback: '1.5%', color: 'border-amber-500/30 bg-amber-500/10 text-amber-400' },
                      { name: 'Diamond Node', range: 'K1M+', cashback: '3.0%', color: 'border-primary/30 bg-primary/10 text-primary' }
                    ].map(tier => (
                      <div key={tier.name} className={cn("p-4 rounded-2xl border flex justify-between items-center", tier.color)}>
                        <div>
                           <p className="font-black text-sm">{tier.name}</p>
                           <p className="text-[10px] opacity-60 font-bold">{tier.range}</p>
                        </div>
                        <div className="text-right">
                           <p className="font-black text-sm">{tier.cashback}</p>
                           <p className="text-[9px] opacity-60 uppercase font-black tracking-widest">Cashback</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center gap-3">
                    <Zap size={20} className="text-indigo-400" />
                    <p className="text-[11px] font-medium leading-tight text-indigo-100">
                      Cashback is automatically credited to your balance instantly after every bill payment.
                    </p>
                  </div>

                  <Button onClick={() => setShowTierInfo(false)} className="w-full h-12 bg-white text-black font-black rounded-xl">
                    Got it
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showSettings && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: '100%' }}
                className="bg-white w-full max-w-sm rounded-t-[2rem] md:rounded-[2rem] overflow-hidden shadow-2xl border border-border"
              >
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                    <Settings size={18} className="text-primary" />
                    Wallet Settings
                  </h3>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-text-muted" />
                  </button>
                </div>
                
                <div className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-border">
                      <div>
                        <p className="text-xs font-black text-text-main">Hide Balance</p>
                        <p className="text-[10px] text-text-muted font-bold">Mask your balance on homepage</p>
                      </div>
                      <div className="w-10 h-5 bg-slate-200 rounded-full relative">
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-border">
                      <div>
                        <p className="text-xs font-black text-text-main">Currency Display</p>
                        <p className="text-[10px] text-text-muted font-bold">Change how currency is shown</p>
                      </div>
                      <span className="text-[10px] font-black text-primary bg-emerald-50 px-2 py-1 rounded-lg">MWK</span>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={() => setShowSettings(false)}
                    className="w-full h-12 bg-slate-900 text-white font-bold rounded-xl"
                  >
                    Close
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Create Pool Modal */}
        <AnimatePresence>
          {showCreatePoolModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-border"
              >
                 <div className="p-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-bold text-lg tracking-tight">Create Savings Pool</h3>
                    <button onClick={() => setShowCreatePoolModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                      <X size={20} />
                    </button>
                 </div>
                 <form onSubmit={handleCreatePool} className="p-6 space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Pool Name</label>
                       <Input value={newPoolName} onChange={e => setNewPoolName(e.target.value)} placeholder="e.g. Blantyre Agribusiness Group" className="h-12 bg-slate-50 border-none rounded-xl" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Target (MK)</label>
                         <Input type="number" value={newPoolTarget} onChange={e => setNewPoolTarget(e.target.value)} placeholder="1000000" className="h-12 bg-slate-50 border-none rounded-xl" required />
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Contrib. (MK)</label>
                         <Input type="number" value={newPoolContribution} onChange={e => setNewPoolContribution(e.target.value)} placeholder="50000" className="h-12 bg-slate-50 border-none rounded-xl" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-text-muted">Frequency</label>
                       <div className="flex gap-2">
                          {['weekly', 'monthly'].map(f => (
                            <button key={f} type="button" onClick={() => setNewPoolFrequency(f as any)} className={cn("flex-1 h-10 rounded-xl font-bold text-[10px] uppercase tracking-widest border-2 transition-all", newPoolFrequency === f ? "border-primary bg-primary/5 text-primary" : "border-transparent bg-slate-50 text-text-muted")}>
                              {f}
                            </button>
                          ))}
                       </div>
                    </div>
                    <Button type="submit" disabled={isProcessing} className="w-full h-14 bg-primary text-white font-black mt-4">
                       {isProcessing ? <Loader2 className="animate-spin" /> : 'Create and Launch Pool'}
                    </Button>
                 </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Create Ad Modal (Generic) */}
        <AnimatePresence>
          {showCreateAdModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl border border-border"
              >
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-lg tracking-tight flex items-center gap-2 text-text-main">
                    <TrendingUp size={18} className="text-primary" />
                    Create Ad Campaign
                  </h3>
                  <button 
                    onClick={() => setShowCreateAdModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X size={20} className="text-text-muted" />
                  </button>
                </div>
                
                <div className="p-6">
                  <div className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                      <Target size={32} />
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-bold">Grow with Zathu</h4>
                      <p className="text-xs text-text-muted leading-relaxed">Direct business advertising campaigns are currently in early access. You can boost existing marketplace items and posts directly for instant visibility.</p>
                    </div>
                    <Button 
                       onClick={() => setShowCreateAdModal(false)}
                       className="w-full h-11 bg-slate-900 text-white rounded-xl font-bold mt-4"
                    >
                       Got it
                    </Button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* --- CASH OUT USSD PROMPT SIMULATOR --- */}
        <AnimatePresence>
          {cashOutUssdOpen && (
            <div className="fixed inset-0 bg-black/75 z-[210] flex items-center justify-center p-6 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="bg-slate-900 text-white border border-white/10 rounded-3xl overflow-hidden w-full max-w-[290px] shadow-2xl font-sans"
              >
                {/* Carrier Header */}
                <div className={cn(
                  "p-3.5 flex items-center justify-between border-b border-white/5",
                  cashOutMethod === 'airtel' ? "bg-red-800" : "bg-neutral-800"
                )}>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/95 leading-none">
                      {cashOutMethod === 'airtel' ? 'Airtel Money Cashout' : 'TNM Mpamba Secure'}
                    </span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      setCashOutUssdOpen(false);
                      setCashOutPin('');
                      toast.info('Cashout aborted by user');
                    }} 
                    className="text-white/40 hover:text-white"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Simulated Window Screen */}
                <div className="p-5 space-y-4">
                  <p className="text-xs font-mono font-medium text-slate-100 leading-relaxed text-center">
                    Enter your {cashOutMethod === 'airtel' ? 'Airtel Money' : 'Mpamba'} PIN to confirm withdrawal of <span className="text-red-400 font-bold">K{Number(cashOutAmount).toLocaleString()}</span> from <span className="underline font-bold">ZATHU SUPER APP</span>.
                  </p>

                  <form onSubmit={handleCashOutMomoComplete} className="space-y-3">
                    <div className="relative">
                      <Input
                        type="password"
                        maxLength={4}
                        value={cashOutPin}
                        onChange={(e) => setCashOutPin(e.target.value.replace(/\D/g, '').substring(0, 4))}
                        placeholder="Enter PIN"
                        className="h-11 bg-white/10 border-white/10 text-white placeholder:text-white/30 text-center font-mono font-bold text-lg tracking-[0.4em] focus:bg-white/15 focus:ring-0 rounded-xl border"
                        required
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-2 pt-2 gap-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCashOutUssdOpen(false);
                          setCashOutPin('');
                          toast.info('Cashout aborted');
                        }}
                        className="flex-1 py-2.5 rounded-xl border border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-widest text-white/70 hover:bg-white/10 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={cashOutPin.length < 4}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-white cursor-pointer border-none",
                          cashOutMethod === 'airtel' ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 text-slate-900 hover:bg-amber-600"
                        )}
                      >
                        Verify PIN
                      </button>
                    </div>
                  </form>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* --- CASH OUT CARRIER SMS RECEIPT EASTER EGG --- */}
        <AnimatePresence>
          {cashOutSmsNotification && (
            <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-xs z-[250]">
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="bg-slate-900 text-white rounded-2xl border border-white/10 p-4 shadow-2xl space-y-2 relative"
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded bg-white/10">
                      <Bell size={14} className="text-amber-400 font-bold" />
                    </div>
                    <div>
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-300">Carrier Message</h5>
                      <p className="text-[8px] text-slate-500 font-mono">Just Now • SIM 1</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setCashOutSmsNotification(null)} 
                    className="text-white/40 hover:text-white p-1"
                  >
                    <X size={12} />
                  </button>
                </div>
                <p className="text-[10px] font-mono leading-relaxed text-slate-200">
                  {cashOutSmsNotification}
                </p>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setCashOutSmsNotification(null)}
                    className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-1 hover:underline cursor-pointer bg-transparent border-none"
                  >
                    Dismiss
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
