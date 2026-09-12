import React from 'react';

interface WaxSealLogoProps {
  size?: number | string;
  className?: string;
  pulse?: boolean;
}

export const WaxSealLogo: React.FC<WaxSealLogoProps> = ({
  size = 36,
  className = '',
  pulse = false,
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {pulse && (
        <span
          className="absolute inset-0 rounded-full border border-primary animate-ping opacity-75 pointer-events-none"
          style={{ animationDuration: '3s' }}
        />
      )}
      <svg
        viewBox="0 0 80 80"
        width="100%"
        height="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="select-none"
      >
        <circle cx="40" cy="40" r="38" fill="#1C1917" stroke="#D97706" strokeWidth="2.5" />
        <circle
          cx="40"
          cy="40"
          r="33"
          stroke="#D97706"
          strokeWidth="0.75"
          strokeDasharray="2 2"
          opacity="0.65"
        />
        {/* Stylized N monogram with quill/stylus motif */}
        <path
          d="M26 56V24L54 56V24"
          stroke="#D97706"
          strokeWidth="3.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <circle cx="40" cy="40" r="3.5" fill="#D97706" />
        <circle cx="40" cy="40" r="1.8" fill="#1C1917" />
      </svg>
    </div>
  );
};
