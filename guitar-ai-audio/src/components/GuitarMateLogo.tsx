import React from 'react';

interface GuitarMateLogoProps {
  className?: string;
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}

export const GuitarMateLogo: React.FC<GuitarMateLogoProps> = ({
  className = '',
  variant = 'light',
  size = 'md',
}) => {
  const isDark = variant === 'dark';

  // Size mapping
  const sizeConfig = {
    sm: { icon: 22, text: 'text-base', spacing: 'space-x-1.5' },
    md: { icon: 28, text: 'text-xl', spacing: 'space-x-2' },
    lg: { icon: 34, text: 'text-2xl', spacing: 'space-x-2.5' },
  }[size];

  return (
    <div className={`flex items-center ${sizeConfig.spacing} select-none group ${className}`}>
      {/* GuitarMate Emblem: Acoustic Guitar Pick with Soundwave & String Lines */}
      <div className="relative flex items-center justify-center shrink-0">
        <svg
          width={sizeConfig.icon}
          height={sizeConfig.icon}
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="transition-transform duration-300 group-hover:scale-105"
        >
          {/* Pick Outer Body with Rounded Teardrop shape */}
          <path
            d="M18 3.5C27 3.5 32 8.5 32 17.5C32 26 21.5 32.5 18 34.5C14.5 32.5 4 26 4 17.5C4 8.5 9 3.5 18 3.5Z"
            fill="url(#guitarmate-gradient)"
            className="drop-shadow-xs"
          />
          
          {/* Subtle Inner Highlight */}
          <path
            d="M18 5.5C25 5.5 29.5 9.5 29.5 17C29.5 24 20.8 29.5 18 31.2C15.2 29.5 6.5 24 6.5 17C6.5 9.5 11 5.5 18 5.5Z"
            stroke="white"
            strokeWidth="0.8"
            strokeOpacity="0.3"
            fill="none"
          />

          {/* 3 Synchronized Soundwave/Guitar String Bars */}
          <line x1="12" y1="13" x2="12" y2="21" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="18" y1="10" x2="18" y2="24" stroke="#fef08a" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="24" y1="14" x2="24" y2="20" stroke="white" strokeWidth="2.2" strokeLinecap="round" />

          {/* Gradient Definition */}
          <defs>
            <linearGradient id="guitarmate-gradient" x1="4" y1="3.5" x2="32" y2="34.5" gradientUnits="userSpaceOnUse">
              <stop stopColor="#0d5c48" />
              <stop offset="0.6" stopColor="#12785f" />
              <stop offset="1" stopColor="#1cb08b" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Brand Text: guitarmate */}
      <div className={`font-extrabold tracking-tight font-sans ${sizeConfig.text} leading-none flex items-center`}>
        <span className={isDark ? 'text-white' : 'text-slate-900 group-hover:text-emerald-950 transition-colors'}>
          guitar
        </span>
        <span className="text-emerald-600 font-black relative">
          mate
          {/* Mini accent dot */}
          <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        </span>
      </div>
    </div>
  );
};
