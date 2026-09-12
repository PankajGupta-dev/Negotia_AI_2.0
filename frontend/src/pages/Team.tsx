import React, { useState } from 'react';
import { Button } from '../components/Button';
import { LedgerTable, ColumnDef } from '../components/LedgerTable';
import { MOCK_TEAM, TeamMember } from '../data/mock';

export const Team: React.FC = () => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(MOCK_TEAM);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Senior Legal Counsel');
  const [newMemberLevel, setNewMemberLevel] = useState('Level 2 ($2M ARR Threshold)');

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberName || !newMemberEmail) return;

    const newMember: TeamMember = {
      id: `team-${Date.now()}`,
      name: newMemberName,
      email: newMemberEmail,
      role: newMemberRole,
      department: 'Commercial Legal',
      authorityLevel: newMemberLevel,
      mfaStatus: 'hardware_mfa',
      lastActive: 'Invited Just Now',
      status: 'invited',
    };

    setTeamMembers([newMember, ...teamMembers]);
    setIsInviteModalOpen(false);
    setNewMemberName('');
    setNewMemberEmail('');
  };

  const teamColumns: ColumnDef<TeamMember>[] = [
    {
      key: 'name',
      title: 'Counsel / Member',
      render: (m) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-surface-container-high border border-outline-variant/50 flex items-center justify-center font-serif text-primary font-bold text-xs shrink-0">
            {m.name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-headline-md text-sm font-semibold text-on-surface truncate">
              {m.name}
            </span>
            <span className="font-mono text-[11px] text-outline truncate">{m.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      title: 'Role & Department',
      render: (m) => (
        <div className="flex flex-col">
          <span className="text-on-surface font-medium text-xs">{m.role}</span>
          <span className="text-outline text-[11px]">{m.department}</span>
        </div>
      ),
    },
    {
      key: 'authorityLevel',
      title: 'Signing Authority',
      render: (m) => (
        <span className="font-mono text-xs font-semibold text-primary">
          {m.authorityLevel}
        </span>
      ),
    },
    {
      key: 'mfaStatus',
      title: 'Cryptographic MFA',
      render: () => (
        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-secondary bg-secondary-container/20 px-2 py-0.5 rounded border border-secondary/30 uppercase font-semibold">
          <span className="material-symbols-outlined text-[12px]">key</span>
          Hardware Key
        </span>
      ),
    },
    {
      key: 'lastActive',
      title: 'Docket Activity',
      render: (m) => <span className="font-mono text-xs text-outline">{m.lastActive}</span>,
    },
    {
      key: 'status',
      title: 'Status',
      render: (m) => (
        <span
          className={`font-mono text-[10px] px-2 py-0.5 rounded uppercase font-semibold border ${
            m.status === 'active'
              ? 'bg-secondary-container/20 text-secondary border-secondary/30'
              : 'bg-primary-container/20 text-primary border-primary/30'
          }`}
        >
          {m.status}
        </span>
      ),
    },
  ];

  return (
    <div className="w-full bg-background text-on-surface p-space-base md:p-space-lg lg:p-space-xl space-y-space-xl min-h-screen">
      {/* 1. DOCUMENT HEADER BAR */}
      <div className="bg-surface-container-low border border-outline-variant/30 rounded p-space-lg flex flex-col md:flex-row items-start md:items-end justify-between gap-space-md shadow-sm">
        <div className="flex flex-col gap-1 max-w-2xl">
          <div className="flex items-center gap-space-xs font-mono text-label-sm text-outline tracking-widest uppercase">
            <span>Administration & Access Control</span>
            <span>•</span>
            <span className="text-primary font-semibold">Docket #SEC-GOV-2025</span>
            <span>•</span>
            <span>Enterprise Workspace Governance</span>
          </div>
          <h1 className="font-headline-xl text-3xl md:text-4xl text-on-surface font-semibold tracking-tight mt-1">
            Team Roster & Access Governance
          </h1>
          <p className="font-body-md text-on-surface-variant text-sm">
            Establish granular bilateral negotiation thresholds, enforce privilege boundaries, and
            maintain cryptographically signed delegations for master contracts.
          </p>
        </div>

        {/* Right Action Cluster */}
        <div className="flex items-center gap-space-sm flex-wrap shrink-0">
          <Button
            variant="secondary"
            size="md"
            icon="history_edu"
            onClick={() => alert('Exporting audit ledger CSV...')}
          >
            Export Ledger (.CSV)
          </Button>
          <Button
            variant="primary"
            size="md"
            icon="person_add"
            onClick={() => setIsInviteModalOpen(true)}
          >
            + Invite Team Member
          </Button>
        </div>
      </div>

      {/* 2. SOVEREIGN LEDGER METRICS OVERVIEW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-space-md">
        <div className="bg-surface-container-low p-space-base rounded border border-outline-variant/30 flex flex-col justify-between">
          <span className="font-mono text-xs text-outline uppercase tracking-wider">
            Active Counsel Seats
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="font-headline-lg text-2xl font-semibold text-on-surface">
              14 <span className="text-xs font-mono text-outline">/ 20</span>
            </span>
            <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded border border-secondary/30 uppercase font-semibold">
              Vetted
            </span>
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded mt-2 overflow-hidden">
            <div className="bg-primary-container h-full" style={{ width: '70%' }} />
          </div>
        </div>

        <div className="bg-surface-container-low p-space-base rounded border border-outline-variant/30 flex flex-col justify-between">
          <span className="font-mono text-xs text-outline uppercase tracking-wider">
            Autonomous Limit Signers
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="font-headline-lg text-2xl font-semibold text-on-surface">4</span>
            <span className="font-mono text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/30 uppercase font-semibold">
              Level 4
            </span>
          </div>
          <span className="font-mono text-[10px] text-outline mt-2 truncate">
            Max ARR Threshold: Uncapped
          </span>
        </div>

        <div className="bg-surface-container-low p-space-base rounded border border-outline-variant/30 flex flex-col justify-between">
          <span className="font-mono text-xs text-outline uppercase tracking-wider">
            Cryptographic Keys Active
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="font-headline-lg text-2xl font-semibold text-on-surface">14</span>
            <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded border border-secondary/30 uppercase font-semibold">
              Hardware MFA
            </span>
          </div>
          <span className="font-mono text-[10px] text-outline mt-2 truncate">
            Zero Key Revocation Alarms
          </span>
        </div>

        <div className="bg-surface-container-low p-space-base rounded border border-outline-variant/30 flex flex-col justify-between">
          <span className="font-mono text-xs text-outline uppercase tracking-wider">
            Dual-Key HSM Quorum
          </span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="font-headline-lg text-2xl font-semibold text-secondary">2-of-3</span>
            <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded border border-secondary/30 uppercase font-semibold">
              Active
            </span>
          </div>
          <span className="font-mono text-[10px] text-outline mt-2 truncate">
            Threshold Enforcement Active
          </span>
        </div>
      </div>

      {/* 3. ROSTER LEDGER TABLE */}
      <div className="space-y-space-sm">
        <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
          <h2 className="font-headline-md text-xl text-on-surface font-semibold">
            Enterprise Counsel Registry
          </h2>
          <span className="font-mono text-xs text-outline">
            {teamMembers.length} Members Authorized
          </span>
        </div>

        <LedgerTable
          columns={teamColumns}
          data={teamMembers}
          keyExtractor={(m) => m.id}
        />
      </div>

      {/* 4. INVITE TEAM MEMBER MODAL */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-surface-container-low border border-outline-variant/40 rounded p-space-lg w-full max-w-lg shadow-2xl space-y-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <h3 className="font-headline-md text-xl text-on-surface font-semibold">
                Authorize New Counsel
              </h3>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-body-md">close</span>
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-space-md font-body-sm text-xs">
              <div>
                <label className="font-mono text-[10px] uppercase text-outline block mb-1">
                  Full Legal Name
                </label>
                <input
                  type="text"
                  required
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="e.g. Rachel Sterling, Esq."
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="font-mono text-[10px] uppercase text-outline block mb-1">
                  Enterprise Work Email
                </label>
                <input
                  type="email"
                  required
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="rachel.sterling@enterprise-legal.com"
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-space-md">
                <div>
                  <label className="font-mono text-[10px] uppercase text-outline block mb-1">
                    Role & Title
                  </label>
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option>General Counsel & Partner</option>
                    <option>Deputy General Counsel</option>
                    <option>Senior Legal Counsel</option>
                    <option>Contracts Specialist</option>
                    <option>External Outside Counsel</option>
                  </select>
                </div>

                <div>
                  <label className="font-mono text-[10px] uppercase text-outline block mb-1">
                    Signing Authority
                  </label>
                  <select
                    value={newMemberLevel}
                    onChange={(e) => setNewMemberLevel(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2 text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option>Level 4 (Uncapped ARR Signer)</option>
                    <option>Level 3 ($5M ARR Threshold)</option>
                    <option>Level 2 ($2M ARR Threshold)</option>
                    <option>Level 1 ($500k ARR Threshold)</option>
                    <option>Review Only (No Sign Authority)</option>
                  </select>
                </div>
              </div>

              <div className="p-space-sm bg-surface-container-lowest rounded border border-outline-variant/30 flex items-center gap-2">
                <input type="checkbox" id="mfaReq" defaultChecked className="accent-primary-container" />
                <label htmlFor="mfaReq" className="text-on-surface-variant text-[11px]">
                  Enforce Hardware MFA Key registration (FIDO2 / YubiKey required).
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit">
                  Send Sovereign Delegation Invite
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
