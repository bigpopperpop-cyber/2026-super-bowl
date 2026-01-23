
import React from 'react';
import { NFL_TEAMS } from '../constants.tsx';

interface TeamHelmetProps {
  teamId: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const TeamHelmet: React.FC<TeamHelmetProps> = ({ teamId, size = 'md', className = '' }) => {
  const team = NFL_TEAMS.find(t => t.id === teamId) || NFL_TEAMS[0];
  
  const dimensions = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20'
  };

  return (
    <div className={`${dimensions[size]} ${className} flex items-center justify-center relative`}>
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
        <path 
          d="M20,50 Q20,15 55,15 Q90,15 90,55 L85,80 Q50,85 20,70 Z" 
          fill={team.primary} 
          stroke="white" 
          strokeWidth="1"
        />
        <path 
          d="M45,15 Q55,15 55,80" 
          fill="none" 
          stroke={team.secondary} 
          strokeWidth="6" 
          opacity="0.8"
        />
        <path 
          d="M75,55 L95,60 L92,75 L70,68 M85,60 L82,85 L65,75" 
          fill="none" 
          stroke={team.secondary} 
          strokeWidth="4" 
          strokeLinecap="round"
        />
        <circle cx="55" cy="55" r="5" fill="black" opacity="0.2" />
      </svg>
      {size === 'xl' && (
        <span className="absolute -bottom-1 bg-black/80 px-1.5 py-0.5 rounded text-[8px] font-black text-white border border-white/20">
          {team.id}
        </span>
      )}
    </div>
  );
};

export default TeamHelmet;
