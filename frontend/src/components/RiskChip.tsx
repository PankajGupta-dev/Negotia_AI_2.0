import React from 'react';

export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical' | 'neutral';

interface RiskChipProps {
  level: RiskLevel;
  label?: string;
  score?: number;
  showDot?: boolean;
  className?: string;
}

export const RiskChip: React.FC<RiskChipProps> = ({
  level,
  label,
  score,
  showDot = true,
  className = '',
}) => {
  const getStyles = () => {
    switch (level) {
      case 'low':
        return {
          bg: 'bg-secondary-container/20 text-secondary border-secondary/40',
          dot: 'bg-secondary',
          defaultText: 'Low Risk',
        };
      case 'moderate':
        return {
          bg: 'bg-primary-container/20 text-primary border-primary/40',
          dot: 'bg-primary-container',
          defaultText: 'Moderate Risk',
        };
      case 'high':
        return {
          bg: 'bg-error-container/30 text-error border-error/40',
          dot: 'bg-error',
          defaultText: 'High Risk',
        };
      case 'critical':
        return {
          bg: 'bg-error-container text-on-error-container border-error',
          dot: 'bg-error animate-pulse',
          defaultText: 'Critical Breach',
        };
      default:
        return {
          bg: 'bg-surface-container-high text-on-surface-variant border-outline-variant/40',
          dot: 'bg-outline',
          defaultText: 'Standard',
        };
    }
  };

  const style = getStyles();
  const text = label || style.defaultText;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-label-sm uppercase tracking-wider font-semibold whitespace-nowrap ${style.bg} ${className}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />}
      <span>{text}</span>
      {score !== undefined && (
        <span className="opacity-80 font-normal">({score.toFixed(1)})</span>
      )}
    </span>
  );
};
