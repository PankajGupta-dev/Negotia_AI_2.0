import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  tone?: 'amber' | 'forest' | 'rust' | 'neutral';
  icon?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  sublabel,
  change,
  trend = 'neutral',
  tone = 'amber',
  icon,
  className = '',
}) => {
  const getTrendClasses = () => {
    switch (trend) {
      case 'up':
        return 'text-secondary bg-secondary-container/20 border-secondary/30';
      case 'down':
        return 'text-error bg-error-container/20 border-error/30';
      default:
        return 'text-outline bg-surface-container-high border-outline-variant/30';
    }
  };

  const getToneAccent = () => {
    switch (tone) {
      case 'amber':
        return 'text-primary';
      case 'forest':
        return 'text-secondary';
      case 'rust':
        return 'text-error';
      default:
        return 'text-on-surface';
    }
  };

  return (
    <div
      className={`bg-surface-container-low border border-outline-variant/30 rounded p-space-base flex flex-col justify-between transition-all hover:border-outline-variant/60 ${className}`}
    >
      <div className="flex items-center justify-between gap-space-sm pb-space-xs">
        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider truncate">
          {label}
        </span>
        {icon && (
          <span className="material-symbols-outlined text-body-md text-outline">
            {icon}
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-space-sm pt-space-xs">
        <span className={`font-headline-xl text-headline-xl font-semibold tracking-tight ${getToneAccent()}`}>
          {value}
        </span>
        {change && (
          <span
            className={`font-label-sm text-label-sm px-1.5 py-0.5 rounded-sm border uppercase font-mono tracking-wider ${getTrendClasses()}`}
          >
            {change}
          </span>
        )}
      </div>

      {sublabel && (
        <p className="font-body-sm text-body-sm text-outline mt-2 truncate">
          {sublabel}
        </p>
      )}
    </div>
  );
};
