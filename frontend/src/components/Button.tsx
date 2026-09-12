import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'parchment' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  children,
  className = '',
  disabled,
  ...props
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'bg-[#D97706] hover:bg-[#B45309] text-white font-bold border border-[#B45309] shadow-sm';
      case 'secondary':
        return 'bg-[#EDE7DC] hover:bg-[#E2DACD] text-[#1C1917] font-semibold border-2 border-[#78716C] shadow-xs';
      case 'parchment':
        return 'bg-[#EDE7DC] hover:bg-[#E2DACD] text-[#1C1917] border-2 border-[#8C8275] font-semibold shadow-xs';
      case 'outline':
        return 'bg-[#FAF7F2] hover:bg-[#EDE7DC] text-[#1C1917] font-bold border-2 border-[#78716C] shadow-xs';
      case 'danger':
        return 'bg-[#FEE2E2] hover:bg-[#FCA5A5] text-[#991B1B] font-bold border-2 border-[#991B1B] shadow-xs';
      case 'ghost':
        return 'bg-transparent hover:bg-[#EDE7DC] text-[#991B1B] font-bold border border-transparent';
      default:
        return '';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'h-8 px-2.5 text-label-sm gap-1.5 rounded-sm';
      case 'lg':
        return 'h-11 px-space-xl text-body-md gap-2 rounded';
      case 'md':
      default:
        return 'h-9 px-space-base text-label-lg gap-1.5 rounded';
    }
  };

  return (
    <button
      className={`inline-flex items-center justify-center font-sans transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${getVariantClasses()} ${getSizeClasses()} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && iconPosition === 'left' && (
        <span className="material-symbols-outlined text-body-md leading-none">{icon}</span>
      )}
      <span>{children}</span>
      {icon && iconPosition === 'right' && (
        <span className="material-symbols-outlined text-body-md leading-none">{icon}</span>
      )}
    </button>
  );
};
