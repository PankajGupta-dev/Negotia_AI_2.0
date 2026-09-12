import React from 'react';

interface HairlineCardProps {
  children: React.ReactNode;
  theme?: 'dark' | 'parchment';
  className?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export const HairlineCard: React.FC<HairlineCardProps> = ({
  children,
  theme = 'dark',
  className = '',
  header,
  footer,
}) => {
  const isParchment = theme === 'parchment';

  return (
    <div
      className={`rounded overflow-hidden transition-colors ${
        isParchment
          ? 'bg-[#FAF7F2] text-[#1C1917] border border-[#D6CEBE]'
          : 'bg-surface-container-low text-on-surface border border-outline-variant/30'
      } ${className}`}
    >
      {header && (
        <div
          className={`px-space-base py-space-sm border-b ${
            isParchment ? 'border-[#D6CEBE] bg-[#EDE7DC]/50' : 'border-outline-variant/20 bg-surface-container-lowest/50'
          }`}
        >
          {header}
        </div>
      )}
      <div className="p-space-base">{children}</div>
      {footer && (
        <div
          className={`px-space-base py-space-sm border-t ${
            isParchment ? 'border-[#D6CEBE] bg-[#EDE7DC]/30' : 'border-outline-variant/20 bg-surface-container-lowest/30'
          }`}
        >
          {footer}
        </div>
      )}
    </div>
  );
};
