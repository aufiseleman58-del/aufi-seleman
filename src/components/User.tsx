import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback, AvatarBadge } from '@/components/ui/avatar';

interface UserProps {
  displayName?: string | null;
  photoURL?: string | null;
  isVerified?: boolean;
  size?: "default" | "sm" | "lg";
  className?: string;
  showBadge?: boolean;
}

/**
 * A reusable User identity component that displays an avatar and a verification badge
 * if the user is verified.
 */
export default function User({ 
  displayName, 
  photoURL, 
  isVerified, 
  size = "default", 
  className,
  showBadge = true
}: UserProps) {
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <Avatar size={size} className="rounded-2xl border border-border/50">
        <AvatarImage src={photoURL || undefined} alt={displayName || 'User'} referrerPolicy="no-referrer" />
        <AvatarFallback className="bg-slate-100 text-primary font-bold rounded-2xl">
          {displayName?.[0] || 'U'}
        </AvatarFallback>
        {isVerified && showBadge && (
          <AvatarBadge className="bg-white border-none p-0.5 shadow-md -bottom-1 -right-1 ring-2 ring-white">
            <ShieldCheck 
              size={size === "sm" ? 10 : (size === "lg" ? 16 : 12)} 
              className="text-primary fill-current" 
            />
          </AvatarBadge>
        )}
      </Avatar>
    </div>
  );
}
