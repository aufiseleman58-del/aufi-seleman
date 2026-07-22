import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, MessageCircle, Play, ShoppingBag, ShieldCheck } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import UserComponent from './User';
import { cn } from '@/lib/utils';

export default function Navbar() {
  const { profile } = useAuth();
  const { t } = useSettings();
  const isAdmin = profile?.role === 'admin';

  return (
    <nav className={`h-[74px] bg-surface/95 backdrop-blur-md border-t border-border/60 grid ${isAdmin ? 'grid-cols-6' : 'grid-cols-5'} pt-2.5 pb-4 px-1 shrink-0 z-20 shadow-md`}>
      <NavLink to="/" className={({ isActive }) => `flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${isActive ? 'text-primary scale-105' : 'text-text-muted hover:text-text-main'}`}>
        <Home size={20} className="stroke-[2.25] transition-transform" />
        <span className="text-[10px] font-bold tracking-tight">{t('nav.home')}</span>
      </NavLink>
      
      <NavLink to="/videos" className={({ isActive }) => `flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${isActive ? 'text-primary scale-105' : 'text-text-muted hover:text-text-main'}`}>
        <Play size={20} className="stroke-[2.25] transition-transform" />
        <span className="text-[10px] font-bold tracking-tight">{t('nav.videos')}</span>
      </NavLink>

      <NavLink to="/messages" className={({ isActive }) => `flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${isActive ? 'text-primary scale-105' : 'text-text-muted hover:text-text-main'}`}>
        <MessageCircle size={20} className="stroke-[2.25] transition-transform" />
        <span className="text-[10px] font-bold tracking-tight">{t('nav.messages')}</span>
      </NavLink>

      <NavLink to="/marketplace" className={({ isActive }) => `flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${isActive ? 'text-primary scale-105' : 'text-text-muted hover:text-text-main'}`}>
        <ShoppingBag size={20} className="stroke-[2.25] transition-transform" />
        <span className="text-[10px] font-bold tracking-tight">{t('nav.market')}</span>
      </NavLink>

      {isAdmin && (
        <NavLink to="/admin" className={({ isActive }) => `flex flex-col items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 ${isActive ? 'text-primary scale-105' : 'text-text-muted hover:text-text-main'}`}>
          <ShieldCheck size={20} className="stroke-[2.25] transition-transform" />
          <span className="text-[10px] font-bold tracking-tight">Admin</span>
        </NavLink>
      )}

      <NavLink to="/profile" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 ${isActive ? 'text-primary scale-105' : 'text-text-muted'}`}>
        {({ isActive }) => (
          <>
            <UserComponent 
              displayName={profile?.displayName}
              photoURL={profile?.photoURL}
              isVerified={profile?.isVerified}
              size="sm"
              className={cn("transition-all", isActive ? 'opacity-100 ring-2 ring-primary ring-offset-2 rounded-2xl' : 'opacity-70 hover:opacity-100')}
            />
            <span className="text-[10px] font-bold tracking-tight mt-0.5">{t('nav.profile')}</span>
          </>
        )}
      </NavLink>
    </nav>
  );
}
