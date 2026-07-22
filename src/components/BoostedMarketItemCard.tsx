import React from 'react';
import { motion } from 'motion/react';
import { Heart, MessageCircle, MapPin, ShieldCheck, Zap, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BoostedMarketItemCardProps {
  item: any;
  user?: any;
  isLiked: boolean;
  onLike: (itemId: string, e: React.MouseEvent) => void;
  onMessage: (sellerId: string, itemName: string, e: React.MouseEvent) => void;
  onViewProfile: (sellerId: string, e: React.MouseEvent) => void;
  onClick: () => void;
}

const BoostedMarketItemCard: React.FC<BoostedMarketItemCardProps> = ({
  item,
  user,
  isLiked,
  onLike,
  onMessage,
  onViewProfile,
  onClick
}) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-MW', {
      style: 'currency',
      currency: 'MWK',
      minimumFractionDigits: 0
    }).format(price);
  };

  return (
    <motion.div 
      whileHover={{ y: -4, scale: 1.01 }}
      onClick={onClick}
      className="shrink-0 w-52 bg-white rounded-[2rem] border-2 border-primary/20 shadow-xl shadow-primary/5 overflow-hidden relative group cursor-pointer snap-start"
    >
      {/* Premium Badge */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-1.5">
         <div className="bg-primary text-white text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1 border border-white/20">
            <Zap size={8} className="fill-white" />
            Featured
         </div>
      </div>

      {/* Floating Action Buttons */}
      <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5 translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300">
          <button 
            onClick={(e) => { e.stopPropagation(); onLike(item.id, e); }}
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-lg backdrop-blur-md",
              isLiked ? "bg-red-500 text-white" : "bg-white/90 text-slate-400 hover:text-red-500"
            )}
          >
            <Heart size={14} className={cn(isLiked && "fill-current")} />
          </button>
      </div>

      {/* Hero Image Section */}
      <div className="aspect-[4/5] overflow-hidden relative">
        <img 
          src={item.images?.[0] || `https://picsum.photos/seed/${item.id}/400/500`} 
          alt={item.name} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent" />
        
        {/* Detail Overlay */}
        <div className="absolute bottom-4 left-4 right-4 text-white space-y-0.5">
           <div className="flex items-center gap-1.5 mb-1 opacity-80">
              <div className="flex items-center gap-1 text-[8px] font-bold text-white/90">
                 <MapPin size={8} className="text-primary" />
                 {item.location}
              </div>
           </div>
           <h3 className="text-sm font-black leading-tight drop-shadow-md line-clamp-1">{item.name}</h3>
           <div className="pt-1">
              <span className="text-lg font-black text-primary drop-shadow-md">
                 {formatPrice(item.price)}
              </span>
           </div>
        </div>
      </div>

      {/* Seller Mini Bar */}
      <div className="px-4 py-3 bg-slate-50 border-t border-border flex items-center justify-between">
         <div className="flex items-center gap-1.5" onClick={(e) => onViewProfile(item.sellerId, e)}>
            <div className="w-6 h-6 rounded-lg border border-white shadow-sm overflow-hidden bg-white">
               <img src={item.sellerPhoto || `https://i.pravatar.cc/150?u=${item.sellerId}`} className="w-full h-full object-cover" alt="" />
            </div>
            <div>
               <p className="text-[8px] font-black text-slate-900 truncate max-w-[60px]">@{item.sellerName || 'Verified'}</p>
               <div className="flex items-center gap-0.5 text-emerald-500">
                  {[...Array(5)].map((_, i) => <Star key={i} size={6} fill="currentColor" />)}
               </div>
            </div>
         </div>
         <button className="bg-primary/10 text-primary text-[8px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg group-hover:bg-primary group-hover:text-white transition-all">
            View
         </button>
      </div>
    </motion.div>
  );
};

export default BoostedMarketItemCard;
