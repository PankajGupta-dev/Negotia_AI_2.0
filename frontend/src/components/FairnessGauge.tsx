import React from 'react';

interface FairnessGaugeProps {
  value: number; // 0 to 100
  size?: number;
  label?: string;
  sublabel?: string;
  className?: string;
  theme?: 'light' | 'dark';
}

export const FairnessGauge: React.FC<FairnessGaugeProps> = ({
  value,
  size = 140,
  label = 'Fairness Index',
  sublabel = 'Nash Equilibrium',
  className = '',
  theme = 'dark',
}) => {
  const strokeWidth = 10;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.min(100, Math.max(0, value));
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  const isDark = theme === 'dark';

  const getColor = (val: number) => {
    if (isDark) {
      if (val >= 80) return '#4ADE80'; // bright green
      if (val >= 60) return '#F59E0B'; // bright amber
      return '#F87171'; // bright red
    } else {
      if (val >= 80) return '#166534'; // crisp forest green
      if (val >= 60) return '#D97706'; // warm amber
      return '#991B1B'; // crisp rust red
    }
  };

  const trackStroke = isDark ? '#383432' : '#D6CEBE';
  const percentageColor = isDark ? '#FFFFFF' : '#1C1917';
  const centerLabelColor = isDark ? '#8BD79B' : '#78716C';
  const mainLabelColor = isDark ? '#F3F4F6' : '#1C1917';
  const sublabelColor = isDark ? '#9CA3AF' : '#78716C';

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
            stroke={trackStroke}
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
          <span className="font-headline-xl text-3xl sm:text-4xl font-extrabold" style={{ color: percentageColor }}>
            {Math.round(clampedValue)}%
          </span>
          <span className="font-label-sm text-[10px] uppercase font-mono font-bold tracking-widest mt-0.5" style={{ color: centerLabelColor }}>
            Balanced
          </span>
        </div>
      </div>

      {label && (
        <span className="font-label-sm text-label-sm uppercase tracking-wider font-bold mt-2" style={{ color: mainLabelColor }}>
          {label}
        </span>
      )}
      {sublabel && (
        <span className="font-body-sm text-[11px] font-medium mt-0.5 max-w-[200px] leading-tight" style={{ color: sublabelColor }}>
          {sublabel}
        </span>
      )}
    </div>
  );
};
