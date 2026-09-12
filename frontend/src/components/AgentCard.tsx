import React from 'react';
import { WaxSealLogo } from './WaxSealLogo';

interface AgentCardProps {
  agentName?: string;
  role?: string;
  rationale: string;
  precedentCitation?: string;
  timestamp?: string;
  status?: string;
  className?: string;
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agentName = 'Agent Counsel Lex-Ultra',
  role = 'Autonomous Legal Intelligence',
  rationale,
  precedentCitation,
  timestamp = 'Active Deliberation',
  status = 'Validated',
  className = '',
}) => {
  return (
    <div
      className={`p-space-base bg-surface-container-low rounded border border-outline-variant/30 space-y-space-sm relative overflow-hidden ${className}`}
    >
      {/* Header with Wax Seal and Agent metadata */}
      <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
        <div className="flex items-center gap-space-sm min-w-0">
          <WaxSealLogo size={28} pulse={true} />
          <div className="flex flex-col min-w-0">
            <span className="font-label-lg text-label-lg text-on-surface font-semibold truncate">
              {agentName}
            </span>
            <span className="font-label-sm text-label-sm text-outline truncate">
              {role}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-label-sm text-label-sm text-secondary bg-secondary-container/20 px-2 py-0.5 rounded-sm border border-secondary/30 uppercase font-mono">
            {status}
          </span>
        </div>
      </div>

      {/* Rationale Body */}
      <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
        {rationale}
      </p>

      {/* Precedent Citation & Timestamp */}
      {(precedentCitation || timestamp) && (
        <div className="pt-space-xs border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-space-xs text-outline font-label-sm text-label-sm">
          {precedentCitation && (
            <span className="flex items-center gap-1 text-primary truncate max-w-full">
              <span className="material-symbols-outlined text-[13px]">verified</span>
              <span className="truncate">{precedentCitation}</span>
            </span>
          )}
          {timestamp && (
            <span className="font-mono text-outline/80 ml-auto shrink-0">
              {timestamp}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
