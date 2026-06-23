import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, MessageCircle, Play, ShoppingBag, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import UserComponent from './User';

export default function Navbar() {
  const { profile } = useAuth();
  const { t } = useSettings();
  const isAdmin = profile?.role === 'admin';

  return (
    <nav className={`absolute bottom-0 left-0 right-0 h-16 bg-surface border-t border-border grid ${isAdmin ? 'grid-cols-7' : 'grid-cols-6'} pb-3 shrink-0`}>
      <NavLink to="/" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 ${isActive ? 'text-primary' : 'text-text-muted'}`}>
        <Home size={20} />
        <span className="text-[9px] font-medium">{t('nav.home')}</span>
      </NavLink>
      
      <NavLink to="/videos" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 ${isActive ? 'text-primary' : 'text-text-muted'}`}>
        <Play size={20} />
        <span className="text-[9px] font-medium">{t('nav.videos')}</span>
      </NavLink>

      <NavLink to="/messages" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 ${isActive ? 'text-primary' : 'text-text-muted'}`}>
        <MessageCircle size={20} />
        <span className="text-[9px] font-medium">{t('nav.messages')}</span>
      </NavLink>

      <NavLink to="/marketplace" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 ${isActive ? 'text-primary' : 'text-text-muted'}`}>
        <ShoppingBag size={20} />
        <span className="text-[9px] font-medium">{t('nav.market')}</span>
      </NavLink>

      <NavLink to="/creator" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 ${isActive ? 'text-primary' : 'text-text-muted'}`}>
        <Sparkles size={20} />
        <span className="text-[9px] font-medium">Creator</span>
      </NavLink>

      {isAdmin && (
        <NavLink to="/admin" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 ${isActive ? 'text-primary' : 'text-text-muted'}`}>
          <ShieldCheck size={20} />
          <span className="text-[9px] font-medium">Admin</span>
        </NavLink>
      )}

      <NavLink to="/profile" className={({ isActive }) => `flex flex-col items-center justify-center gap-1 ${isActive ? 'text-primary' : 'text-text-muted'}`}>
        {({ isActive }) => (
          <>
            <UserComponent 
              displayName={profile?.displayName}
              photoURL={profile?.photoURL}
              isVerified={profile?.isVerified}
              size="sm"
              className={isActive ? 'opacity-100' : 'opacity-60'}
            />
            <span className="text-[9px] font-medium">{t('nav.wallet')}</span>
          </>
        )}
      </NavLink>
    </nav>
  );
}
