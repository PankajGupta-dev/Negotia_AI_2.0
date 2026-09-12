import React from 'react';

interface ProgressBarProps {
  value: number; // 0-100
  label?: string;
  sublabel?: string;
  tone?: 'amber' | 'forest' | 'rust';
  height?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  label,
  sublabel,
  tone = 'amber',
  height = 'h-1.5',
  className = '',
}) => {
  const clamped = Math.min(100, Math.max(0, value));

  const getToneClasses = () => {
    switch (tone) {
      case 'forest':
        return 'bg-secondary';
      case 'rust':
        return 'bg-error';
      case 'amber':
      default:
        return 'bg-primary-container';
    }
  };

  return (
    <div className={`w-full space-y-1 ${className}`}>
      {(label || sublabel) && (
        <div className="flex items-center justify-between text-label-sm font-label-sm">
          {label && <span className="text-on-surface truncate">{label}</span>}
          {sublabel ? (
            <span className="text-outline font-mono">{sublabel}</span>
          ) : (
            <span className="text-outline font-mono">{Math.round(clamped)}%</span>
          )}
        </div>
      )}
      <div className={`w-full bg-surface-container-highest rounded-full overflow-hidden ${height}`}>
        <div
          className={`h-full ${getToneClasses()} transition-all duration-500 ease-out`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
};
