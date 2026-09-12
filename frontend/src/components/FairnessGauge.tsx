import React from 'react';

interface FairnessGaugeProps {
  value: number; // 0 to 100
  size?: number;
  label?: string;
  sublabel?: string;
  className?: string;
}

export const FairnessGauge: React.FC<FairnessGaugeProps> = ({
  value,
  size = 140,
  label = 'Fairness Index',
  sublabel = 'Nash Equilibrium',
  className = '',
}) => {
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  // We can show a 270-degree arc or full circle
  const clampedValue = Math.min(100, Math.max(0, value));
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  const getColor = (val: number) => {
    if (val >= 80) return '#8bd79b'; // secondary green
    if (val >= 60) return '#d97707'; // amber primary-container
    return '#f55e55'; // error red
  };

  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Track background */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#2d2927"
            strokeWidth={strokeWidth}
          />
          {/* Value Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={getColor(clampedValue)}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>

        {/* Central Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-headline-xl text-3xl font-semibold text-on-surface">
            {Math.round(clampedValue)}%
          </span>
          <span className="font-label-sm text-[10px] text-outline uppercase font-mono tracking-widest mt-0.5">
            Balanced
          </span>
        </div>
      </div>

      {label && (
        <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold mt-2">
          {label}
        </span>
      )}
      {sublabel && (
        <span className="font-body-sm text-[11px] text-primary mt-0.5">
          {sublabel}
        </span>
      )}
    </div>
  );
};
