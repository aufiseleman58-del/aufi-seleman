import React, { useState, useEffect } from 'react';
import { Search, Plus, MapPin, ShoppingCart, ShieldCheck, X, CreditCard, Smartphone, Filter, ChevronRight, ChevronLeft, Tag, Loader2, Info, TrendingUp, CheckCircle2, Heart, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, where, limit, doc, getDoc, setDoc, deleteDoc, updateDoc, increment, serverTimestamp, runTransaction } from 'firebase/firestore';
import CreateMarketListingModal from '../components/CreateMarketListingModal';
import MarketItemCard from '../components/MarketItemCard';
import MarketItemComments from '../components/MarketItemComments';
import AdPlacement from '../components/AdPlacement';
import BoostedMarketItemCard from '../components/BoostedMarketItemCard';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { useNavigate, useLocation } from 'react-router-dom';
import CommodityPrices from '../components/CommodityPrices';

const CATEGORIES = ['All', 'Agriculture', 'Vehicles', 'Electronics', 'Property', 'Fashion', 'Home & Garden', 'Services', 'Other'];

export default function Marketplace() {
  const { user, signIn } = useAuth();
  const { t } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState<any[]>([]);
  const [escrows, setEscrows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialListingData, setInitialListingData] = useState<any>(null);

  useEffect(() => {
    if (location.state?.marketShare) {
      setInitialListingData(location.state.marketShare);
      setIsListingModalOpen(true);
      // Clean state to prevent duplicate modals on reload/history back
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate, location.pathname]);

  // Fetch escrows for the user
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'escrows'),
      where('buyerId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setEscrows(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [user]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'mpamba' | 'airtel' | 'card'>('mpamba');
  const [isListingModalOpen, setIsListingModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'input' | 'waiting' | 'success'>('input');
  const [likedItems, setLikedItems] = useState<Record<string, boolean>>({});
  const [showEscrowExplanation, setShowEscrowExplanation] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(collection(db, 'users', user.uid, 'likedItems'), (snapshot) => {
      const liked: Record<string, boolean> = {};
      snapshot.docs.forEach(doc => {
        liked[doc.id] = true;
      });
      setLikedItems(liked);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user?.uid}/likedItems`);
    });
    return () => unsubscribe();
  }, [user]);

  const toggleLike = async (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) {
      signIn();
      return;
    }
    const likeRef = doc(db, 'users', user.uid, 'likedItems', itemId);
    const itemRef = doc(db, 'marketItems', itemId);
    
    try {
      if (likedItems[itemId]) {
        await deleteDoc(likeRef);
        await updateDoc(itemRef, {
          likesCount: increment(-1)
        });
      } else {
        await setDoc(likeRef, { likedAt: serverTimestamp() });
        await updateDoc(itemRef, {
          likesCount: increment(1)
        });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      handleFirestoreError(error, OperationType.WRITE, 'marketItems/likes');
    }
  };

  const handleMessageSeller = (sellerId: string, itemName: string) => {
    if (!user) {
      signIn();
      return;
    }
    navigate(`/messages?chatWith=${sellerId}`);
    toast.info(`Starting conversation about "${itemName}"`);
  };

  useEffect(() => {
    let q = query(collection(db, 'marketItems'), orderBy('createdAt', 'desc'), limit(50));
    
    if (activeCategory !== 'All') {
      q = query(collection(db, 'marketItems'), where('category', '==', activeCategory), orderBy('createdAt', 'desc'), limit(50));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((mDoc) => {
        const itemData = mDoc.data();
        return { 
          ...itemData, 
          id: mDoc.id, 
          sellerVerified: itemData.sellerVerified || false 
        };
      });
      setItems(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'marketItems');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeCategory]);

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleBuy = async () => {
    if (!user || !selectedItem) return;

    setIsProcessing(true);
    setPaymentStep('waiting');

    try {
      // Verify Wallet and Balance
      const walletRef = doc(db, 'wallets', user.uid);
      const walletDoc = await getDoc(walletRef);

      if (!walletDoc.exists() || (walletDoc.data().balance || 0) < selectedItem.price) {
        throw new Error("Insufficient balance in your Zathu Wallet. Please top up first.");
      }

      await runTransaction(db, async (transaction) => {
        const freshWalletDoc = await transaction.get(walletRef);
        const currentBalance = freshWalletDoc.data()?.balance || 0;

        if (currentBalance < selectedItem.price) {
          throw new Error("Insufficient balance.");
        }

        // Hold funds from buyer
        transaction.update(walletRef, {
          balance: currentBalance - selectedItem.price,
          updatedAt: serverTimestamp()
        });

        // Create Escrow
        const escrowRef = doc(collection(db, 'escrows'));
        transaction.set(escrowRef, {
          itemId: selectedItem.id,
          itemName: selectedItem.name,
          buyerId: user.uid,
          sellerId: selectedItem.sellerId,
          amount: selectedItem.price,
          status: 'held',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Log Transaction
        const transRef = doc(collection(db, 'transactions'));
        transaction.set(transRef, {
          fromId: user.uid,
          toId: selectedItem.sellerId,
          fromName: user.displayName || 'Buyer',
          toName: selectedItem.sellerName,
          amount: selectedItem.price,
          type: 'escrow_hold',
          status: 'completed',
          category: 'Marketplace',
          description: `Zathu Escrow: Funds held for "${selectedItem.name}"`,
          createdAt: serverTimestamp()
        });
      });

      setPaymentStep('success');
      setTimeout(() => {
        setIsProcessing(false);
        setShowPayment(false);
        setPaymentStep('input');
        toast.success(t('payment.success'), {
          description: `K${selectedItem.price.toLocaleString()} is held in Escrow. Contact seller for delivery.`,
        });
        setSelectedItem(null);
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Marketplace transaction failed");
      setIsProcessing(false);
      setPaymentStep('input');
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0,
    }).format(price).replace('MWK', 'MK');
  };

  return (
    <div className="p-4 space-y-4 relative pb-24 bg-bg-main">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-text-main">Zathu Market</h1>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Malawi Local Trade</p>
        </div>
        <Button 
          onClick={() => {
            if (!user) {
              signIn();
              return;
            }
            setIsListingModalOpen(true);
          }}
          className="bg-primary hover:bg-emerald-700 text-white rounded-2xl gap-2 h-10 px-5 font-bold shadow-lg shadow-primary/20 transition-all active:scale-95"
        >
          <Plus size={18} />
          <span>{t('market.sell')}</span>
        </Button>
      </div>

      {/* Commodity Prices Section */}
      <CommodityPrices />

      {/* Search & Stats */}
      <div className="space-y-3">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" size={16} />
          <Input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.search')} 
            className="pl-11 bg-surface border-none text-sm h-12 rounded-2xl shadow-sm focus-visible:ring-2 focus-visible:ring-primary/20" 
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button 
              key={cat} 
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-[10px] font-black whitespace-nowrap transition-all border shrink-0 uppercase tracking-wider",
                activeCategory === cat 
                  ? "bg-primary text-white border-primary shadow-sm" 
                  : "bg-white text-text-muted border-border hover:bg-slate-50"
              )}
            >
              {cat === 'All' ? '🌐 All' :
               cat === 'Agriculture' ? '🌽 Agriculture' :
               cat === 'Vehicles' ? '🚗 Vehicles' :
               cat === 'Electronics' ? '💻 Electronics' :
               cat === 'Property' ? '🏠 Property' :
               cat === 'Fashion' ? '👕 Fashion' :
               cat === 'Home & Garden' ? '🪴 Home & Garden' :
               cat === 'Services' ? '🛠️ Services' :
               cat === 'Other' ? '📦 Other' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Verification Banner */}
      <div 
        onClick={() => {
          if (escrows.some(e => e.status === 'held' && e.buyerId === user?.uid)) {
            navigate('/wallet');
          } else {
            setShowEscrowExplanation(true);
          }
        }}
        className={cn(
          "rounded-2xl p-4 text-white flex items-center gap-4 relative overflow-hidden group cursor-pointer hover:shadow-xl transition-all active:scale-[0.98]",
          escrows.some(e => e.status === 'held' && e.buyerId === user?.uid)
            ? "bg-gradient-to-r from-primary to-indigo-600 shadow-primary/20 shadow-lg"
            : "bg-indigo-600 shadow-indigo-500/20"
        )}
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/20 transition-colors" />
        <div className="p-2 bg-white/20 rounded-xl backdrop-blur-md">
          <ShieldCheck size={24} />
        </div>
        <div className="flex-1 relative z-10 text-left">
          <p className="text-xs font-bold leading-tight">
            {escrows.some(e => e.status === 'held' && e.buyerId === user?.uid)
              ? "You have 1 item held in Escrow"
              : "Pay securely with Zathu Escrow"}
          </p>
          <p className="text-[9px] opacity-80 mt-1 uppercase tracking-wider">
            {escrows.some(e => e.status === 'held' && e.buyerId === user?.uid)
              ? "Click to manage your trade safety"
              : "Payments held until delivery"}
          </p>
        </div>
        <div className="flex items-center gap-2 relative z-10">
          <span className="text-[8px] font-black uppercase bg-white/20 px-2 py-1 rounded-lg backdrop-blur-sm">
            {escrows.some(e => e.status === 'held' && e.buyerId === user?.uid) ? "Manage" : "Learn More"}
          </span>
          <ChevronRight size={18} className="opacity-50" />
        </div>
      </div>

      {/* Featured Boosts Scroller */}
      {!loading && filteredItems.some(item => item.isPromoted) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
             <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                <TrendingUp size={14} className="animate-bounce" />
                Featured Marketplace Boosts
             </h2>
             <div className="flex gap-2">
                 <button 
                   onClick={() => {
                     const el = document.getElementById('boost-scroller-market');
                     if (el) el.scrollBy({ left: -200, behavior: 'smooth' });
                   }}
                   className="p-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
                 >
                    <ChevronLeft size={14} />
                 </button>
                 <button 
                    onClick={() => {
                      const el = document.getElementById('boost-scroller-market');
                      if (el) el.scrollBy({ left: 200, behavior: 'smooth' });
                    }}
                    className="p-1 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
                 >
                    <ChevronRight size={14} />
                 </button>
              </div>
          </div>
          <div 
            id="boost-scroller-market"
            className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 snap-x"
          >
             {filteredItems.filter(item => item.isPromoted).map((item, index) => (
                <BoostedMarketItemCard 
                   key={`boost-${item.id}-${index}`}
                   item={item}
                   user={user}
                   isLiked={!!likedItems[item.id]}
                   onLike={toggleLike}
                   onMessage={handleMessageSeller}
                   onViewProfile={(sellerId, e) => {
                     e.stopPropagation();
                     navigate(`/profile/${sellerId}`);
                   }}
                   onClick={() => setSelectedItem(item)}
                />
             ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="animate-spin text-primary" size={32} />
          <p className="text-[10px] font-bold text-text-muted tracking-widest uppercase">Fetching listings...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-20 bg-surface rounded-3xl border border-dashed border-border space-y-3">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
            <Search size={24} className="text-slate-300" />
          </div>
          <div>
            <p className="font-bold text-sm">No items found</p>
            <p className="text-[10px] text-text-muted uppercase tracking-wider mt-1">Try a different search or category</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4 p-3 md:p-6 pb-24 max-w-7xl mx-auto">
          <AdPlacement placement="marketplace" className="col-span-2 md:col-span-1" />
          {filteredItems.map((item, index) => (
            <React.Fragment key={`${item.id}-${index}`}>
              <MarketItemCard
                item={item}
                user={user}
                isLiked={!!likedItems[item.id]}
                onLike={toggleLike}
                onMessage={handleMessageSeller}
                onViewProfile={(sellerId, e) => {
                  e.stopPropagation();
                  navigate(`/profile/${sellerId}`);
                }}
                onClick={() => setSelectedItem(item)}
              />
              {(index + 1) % 8 === 0 && <AdPlacement key={`ad-marketplace-${item.id}-${index}`} placement="marketplace" className="col-span-2 md:col-span-1" />}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateMarketListingModal 
        isOpen={isListingModalOpen} 
        onClose={() => {
          setIsListingModalOpen(false);
          setInitialListingData(null);
        }} 
        initialData={initialListingData}
      />

      {/* Item Details Modal */}
      <AnimatePresence>
        {selectedItem && !showPayment && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-end md:items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-surface w-full max-w-md rounded-t-[32px] md:rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="relative h-80 shrink-0">
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
                <img 
                  src={selectedItem.images?.[0] || `https://picsum.photos/seed/${selectedItem.id}/800/600`} 
                  alt="" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="absolute top-4 right-4 z-20 bg-black/20 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/40 transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="absolute bottom-6 left-6 right-6 z-20">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <span className="bg-primary px-2 py-0.5 rounded text-[9px] font-bold text-white uppercase tracking-widest">{selectedItem.category}</span>
                      <h2 className="text-2xl font-black text-white leading-tight">{selectedItem.name}</h2>
                      <div className="flex items-center gap-2 text-white/80 text-[10px] font-bold uppercase tracking-wider">
                        <MapPin size={12} className="text-primary" />
                        <span>{selectedItem.location}</span>
                      </div>
                    </div>
                    <p className="text-2xl font-black text-white">{formatPrice(selectedItem.price)}</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto scrollbar-hide">
                <div className="bg-slate-50 p-4 rounded-2xl border border-border flex items-center gap-4">
                  <div 
                    onClick={() => navigate(`/profile/${selectedItem.sellerId}`)}
                    className="w-12 h-12 rounded-2xl bg-white border border-border overflow-hidden shadow-sm cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                  >
                    <img src={selectedItem.sellerPhoto || `https://i.pravatar.cc/150?u=${selectedItem.sellerId}`} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 cursor-pointer" onClick={() => navigate(`/profile/${selectedItem.sellerId}`)}>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Seller</p>
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-extrabold text-text-main hover:text-primary transition-colors">{selectedItem.sellerName}</p>
                      {selectedItem.sellerVerified && <ShieldCheck size={14} className="text-primary fill-current" />}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={(e) => toggleLike(selectedItem.id, e)}
                      variant="outline" 
                      size="sm" 
                      className={cn(
                        "rounded-xl h-9 text-[11px] font-bold transition-all",
                        likedItems[selectedItem.id] 
                          ? "bg-red-50 border-red-200 text-red-500 hover:bg-red-100" 
                          : "border-border text-text-muted hover:text-red-500 hover:border-red-200"
                      )}
                    >
                      <Heart size={14} className={cn("mr-1", likedItems[selectedItem.id] && "fill-current")} />
                      {likedItems[selectedItem.id] ? 'Liked' : 'Like'}
                    </Button>
                    <Button 
                      onClick={() => handleMessageSeller(selectedItem.sellerId, selectedItem.name)}
                      variant="outline" 
                      size="sm" 
                      className="rounded-xl h-9 text-[11px] font-bold border-primary text-primary hover:bg-emerald-50"
                    >
                      <MessageCircle size={14} className="mr-1" />
                      Message
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-2">
                    <Info size={12} />
                    Product Description
                  </h4>
                  <p className="text-sm text-text-main leading-relaxed font-medium">
                    {selectedItem.description || `High quality ${selectedItem.name} in great condition. Located in ${selectedItem.location}. Perfect for users looking for value and reliability.`}
                  </p>
                </div>

                <div className="pt-4 border-t border-border">
                   <MarketItemComments itemId={selectedItem.id} />
                </div>

                <div className="flex gap-4 pt-4 sticky bottom-0 bg-surface">
                  <Button 
                    onClick={() => setShowPayment(true)}
                    className="flex-1 bg-primary hover:bg-emerald-700 text-white rounded-2xl h-14 font-black gap-3 shadow-xl shadow-primary/20 transition-all active:scale-95"
                  >
                    <ShoppingCart size={20} />
                    <span>Purchase Item</span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPayment && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-6 space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-black tracking-tight">{t('payment.mobileMoney')}</h3>
                    <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Secure Zathu Gateway</p>
                  </div>
                  {!isProcessing && (
                    <button onClick={() => setShowPayment(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                      <X size={20} />
                    </button>
                  )}
                </div>

                {paymentStep === 'input' && (
                  <>
                    <div className="bg-slate-900 rounded-2xl p-4 text-white flex justify-between items-center relative overflow-hidden group">
                       <div className="absolute top-0 right-0 w-24 h-24 bg-primary/20 rounded-full -mr-12 -mt-12 blur-2xl" />
                      <div className="relative z-10">
                        <p className="text-[9px] opacity-60 uppercase font-black tracking-widest mb-1">Total Payable</p>
                        <p className="text-2xl font-black">{formatPrice(selectedItem.price)}</p>
                      </div>
                      <div className="bg-white/10 p-2 rounded-xl backdrop-blur-md border border-white/10">
                        <ShieldCheck size={28} className="text-primary" />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest pl-1">Payment Method</p>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          { id: 'mpamba', name: t('payment.tnm'), type: 'Instant', icon: <Smartphone size={18}/>, color: 'emerald' },
                          { id: 'airtel', name: t('payment.airtel'), type: 'Fast', icon: <Smartphone size={18}/>, color: 'red' },
                        ].map((method) => (
                          <button 
                            key={method.id}
                            onClick={() => setPaymentMethod(method.id as any)}
                            className={`flex items-center gap-4 p-3.5 rounded-2xl border-2 transition-all active:scale-95 ${
                              paymentMethod === method.id 
                                ? `border-primary bg-emerald-50` 
                                : 'border-border hover:border-slate-300'
                            }`}
                          >
                            <div className={`w-11 h-11 bg-${method.color === 'red' ? 'red-600' : 'emerald-600'} rounded-xl flex items-center justify-center text-white shrink-0 shadow-md`}>
                              {method.icon}
                            </div>
                            <div className="text-left flex-1">
                              <p className="text-xs font-black text-text-main tracking-tight">{method.name}</p>
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-wider">{method.type} Settlement</p>
                            </div>
                            {paymentMethod === method.id && (
                              <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                <ShieldCheck size={12} className="text-white" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="relative group">
                        <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" size={16} />
                        <Input placeholder="Enter Number (08... or 09...)" className="h-12 rounded-xl border-border bg-slate-50 pl-10 font-mono text-sm tracking-widest placeholder:tracking-normal" />
                      </div>
                      <Button 
                        onClick={handleBuy}
                        className="w-full bg-primary hover:bg-emerald-700 text-white rounded-2xl h-14 font-black shadow-xl shadow-primary/20 transition-all active:scale-95"
                      >
                        {t('payment.confirm')}
                      </Button>
                    </div>
                  </>
                )}

                {paymentStep === 'waiting' && (
                  <div className="py-12 text-center space-y-6">
                    <div className="relative inline-block">
                      <div className="w-20 h-20 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                      <Smartphone className="absolute inset-0 m-auto text-primary" size={32} />
                    </div>
                    <div className="space-y-2">
                       <h4 className="text-lg font-black">{t('payment.processing')}</h4>
                       <p className="text-xs text-text-muted animate-pulse">{t('payment.wait')}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-border inline-block mx-auto">
                      <p className="text-[10px] font-mono font-bold text-text-main">REF: ZTH-{Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
                    </div>
                  </div>
                )}

                {paymentStep === 'success' && (
                  <div className="py-12 text-center space-y-6">
                    <motion.div 
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      className="w-20 h-20 bg-emerald-50 text-primary rounded-full flex items-center justify-center mx-auto"
                    >
                      <CheckCircle2 size={48} />
                    </motion.div>
                    <div className="space-y-1">
                       <h4 className="text-lg font-black">{t('payment.success')}</h4>
                       <p className="text-xs text-text-muted">Item secured in Zathu Escrow</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Escrow Explanation Modal */}
      <AnimatePresence>
        {showEscrowExplanation && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-surface w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl p-8 space-y-6"
            >
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto group-hover:scale-110 transition-transform">
                <ShieldCheck size={32} />
              </div>
              
              <div className="text-center space-y-2">
                <h3 className="text-xl font-black text-text-main">Zathu Escrow Protection</h3>
                <p className="text-xs text-text-muted font-bold uppercase tracking-widest">How we keep your trade safe</p>
              </div>

              <div className="space-y-4">
                {[
                  { t: 'Payment Held', d: 'When you buy, Zathu holds the money securely. It is not sent to the seller yet.' },
                  { t: 'Confirm Receipt', d: 'Once you receive and inspect the item, you confirm the delivery in the app.' },
                  { t: 'Funds Released', d: 'Only after your confirmation, we release the funds to the seller\'s Zathu Wallet.' }
                ].map((step, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black shrink-0 border border-primary/20">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-text-main">{step.t}</p>
                      <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed font-medium">{step.d}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Button 
                onClick={() => setShowEscrowExplanation(false)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl h-14 font-black shadow-xl shadow-indigo-500/20 transition-all active:scale-95"
              >
                I Understand
              </Button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
