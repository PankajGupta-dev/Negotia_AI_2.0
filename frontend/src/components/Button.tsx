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
        return 'bg-primary-container hover:bg-primary text-on-primary-container font-semibold border border-primary/40 shadow-sm';
      case 'secondary':
        return 'bg-surface-container-low hover:bg-surface-container text-on-surface border border-outline-variant/50';
      case 'parchment':
        return 'bg-[#EDE7DC] hover:bg-[#E2DACD] text-[#1C1917] border border-[#D6CEBE] font-medium';
      case 'outline':
        return 'bg-transparent hover:bg-surface-container text-on-surface border border-outline-variant/40';
      case 'danger':
        return 'bg-error-container hover:bg-error/80 text-on-error-container border border-error/40';
      case 'ghost':
        return 'bg-transparent hover:bg-surface-container/50 text-primary hover:underline border-transparent';
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
