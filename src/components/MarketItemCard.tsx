import React from 'react';
import { motion } from 'motion/react';
import { Heart, MessageCircle, MapPin, ShieldCheck, ShoppingCart, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import PromotionModal from './PromotionModal';

interface MarketItemCardProps {
  item: any;
  user?: any;
  isLiked: boolean;
  onLike: (itemId: string, e: React.MouseEvent) => void;
  onMessage: (sellerId: string, itemName: string, e: React.MouseEvent) => void;
  onViewProfile: (sellerId: string, e: React.MouseEvent) => void;
  onClick: () => void;
}

const MarketItemCard: React.FC<MarketItemCardProps> = ({
  item,
  user,
  isLiked,
  onLike,
  onMessage,
  onViewProfile,
  onClick
}) => {
  const [showPromote, setShowPromote] = React.useState(false);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(price);
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/20 transition-all cursor-pointer group"
    >
      <div className="relative aspect-square overflow-hidden">
        <img 
          src={item.images?.[0] || `https://picsum.photos/seed/${item.id}/400/400`} 
          alt={item.name} 
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        
        <div className="absolute top-2 right-2 flex flex-col gap-2">
          <button 
            onClick={(e) => onLike(item.id, e)}
            className={cn(
              "p-2 rounded-xl backdrop-blur-md transition-all active:scale-90",
              isLiked ? "bg-red-500 text-white shadow-lg shadow-red-500/20" : "bg-white/80 text-text-muted hover:bg-white hover:text-red-500"
            )}
          >
            <Heart size={16} className={cn(isLiked && "fill-current")} />
          </button>
          
          <button 
            onClick={(e) => onMessage(item.sellerId, item.name, e)}
            className="p-2 rounded-xl bg-white/80 backdrop-blur-md text-text-muted hover:bg-white hover:text-primary transition-all active:scale-90"
          >
            <MessageCircle size={16} />
          </button>

          {user && item.sellerId === user.uid && !item.isPromoted && (
            <button 
              onClick={(e) => { e.stopPropagation(); setShowPromote(true); }}
              className="p-2 rounded-xl bg-primary text-white shadow-lg shadow-primary/20 transition-all active:scale-90"
              title="Boost Listing"
            >
              <TrendingUp size={16} />
            </button>
          )}
        </div>

        <div className="absolute top-2 left-2 flex flex-col gap-1.5">
          {item.isVerified && (
            <div className="bg-primary/90 backdrop-blur-md px-2 py-0.5 rounded-lg shadow-sm flex items-center gap-1 border border-primary/20">
              <ShieldCheck size={10} className="text-white" />
              <span className="text-[8px] font-black text-white uppercase tracking-tighter">Safe</span>
            </div>
          )}
          <div className="bg-slate-900/60 backdrop-blur-md px-2 py-0.5 rounded-lg text-[8px] font-black text-white uppercase tracking-widest border border-white/10">
            {item.category}
          </div>
        </div>

        <div className="absolute bottom-3 left-3 right-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all">
          <div className="bg-white/95 backdrop-blur-md rounded-xl p-2.5 shadow-lg border border-white/40 flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Price</span>
            <p className="text-primary font-black text-xs">{formatPrice(item.price)}</p>
          </div>
        </div>
      </div>
      
      <div className="p-3.5 space-y-2">
        <div className="flex justify-between items-start gap-2">
          <h3 className="text-[12px] font-black text-text-main line-clamp-2 leading-tight group-hover:text-primary transition-colors">{item.name}</h3>
          <p className="text-[10px] font-black text-primary bg-emerald-50 px-1.5 py-0.5 rounded-md md:hidden">{formatPrice(item.price)}</p>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[9px] text-text-muted font-bold">
            <MapPin size={10} className="text-primary" />
            <span>{item.location}</span>
          </div>
          
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <div 
              onClick={(e) => onViewProfile(item.sellerId, e)}
              className="w-5 h-5 rounded-lg border border-border overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
            >
              <img src={item.sellerPhoto || `https://i.pravatar.cc/150?u=${item.sellerId}`} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </div>
      
      {showPromote && user && (
        <PromotionModal 
          itemId={item.id}
          itemType="marketItem"
          title={item.name}
          userId={user.uid}
          onClose={() => setShowPromote(false)}
        />
      )}
    </motion.div>
  );
};

export default MarketItemCard;
