import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { Button } from '../components/Button';

interface NavItem {
  name: string;
  path: string;
  icon: string;
  badge?: string;
  badgeTone?: 'amber' | 'forest' | 'rust';
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Operations Command', path: '/dashboard', icon: 'dashboard' },
  { name: 'Contract Intake', path: '/intake', icon: 'upload_file' },
  {
    name: 'Live Agent Pipeline',
    path: '/pipeline/2025-INT-809',
    icon: 'account_tree',
    badge: 'LIVE',
    badgeTone: 'amber',
  },
  {
    name: 'Negotiation Room',
    path: '/negotiations/2025-INT-809',
    icon: 'handshake',
    badge: '4 pending',
    badgeTone: 'rust',
  },
  { name: 'Negotiation Sandbox', path: '/sandbox', icon: 'science' },
  { name: 'Executive Report', path: '/reports/2025-INT-809', icon: 'description' },
  { name: 'Deal Analytics', path: '/analytics', icon: 'analytics' },
  { name: 'Team Governance', path: '/team', icon: 'group' },
  { name: 'AI Configuration', path: '/settings', icon: 'tune' },
  { name: 'Audit & Provenance', path: '/governance', icon: 'verified' },
];

export const SidebarLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Highlight or title check
  const isWorkspace = location.pathname.startsWith('/negotiations');
  const isReport = location.pathname.startsWith('/reports');

  return (
    <div className="min-h-screen bg-background text-on-surface flex">
      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Persistent Left Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-72 lg:w-80 bg-surface-container-lowest border-r border-outline-variant/30 z-50 flex flex-col justify-between select-none transition-transform duration-200 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Logo & Brand Header */}
          <div className="h-16 px-space-base border-b border-outline-variant/30 flex items-center justify-between">
            <NavLink
              to="/dashboard"
              className="flex items-center gap-space-sm group"
              onClick={() => setMobileOpen(false)}
            >
              <WaxSealLogo size={32} />
              <div className="flex flex-col justify-center">
                <div className="flex items-baseline gap-1">
                  <span className="font-wapilor text-2xl tracking-wider text-on-surface uppercase leading-none">
                    Negotia
                  </span>
                  <span className="font-bevas text-2xl tracking-widest leading-none bg-gradient-to-r from-primary via-amber-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(217,119,6,0.35)]">
                    AI
                  </span>
                </div>
                <span className="font-label-sm text-[9px] text-outline tracking-widest uppercase">
                  Enterprise Legal
                </span>
              </div>
            </NavLink>
            <button
              type="button"
              className="lg:hidden text-outline hover:text-on-surface p-1"
              onClick={() => setMobileOpen(false)}
            >
              <span className="material-symbols-outlined text-body-md">close</span>
            </button>
          </div>

          {/* Matter Portfolio Sub-header */}
          <div className="px-space-base py-2.5 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/30">
            <span className="font-label-sm text-[10px] text-outline uppercase tracking-wider font-mono">
              Enterprise Docket
            </span>
            <span className="material-symbols-outlined text-outline text-[16px]">gavel</span>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-space-xs py-space-sm space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path.startsWith('/negotiations') && isWorkspace) ||
                (item.path.startsWith('/reports') && isReport);

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center justify-between px-space-md py-2.5 transition-all text-body-md ${
                    isActive
                      ? 'border-l-[3px] border-primary-container bg-surface-container-low text-on-surface font-semibold shadow-inner'
                      : 'border-l-[3px] border-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-space-sm min-w-0">
                    <span
                      className={`material-symbols-outlined text-body-md shrink-0 ${
                        isActive ? 'text-primary' : 'text-outline'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </div>

                  {item.badge ? (
                    <span
                      className={`font-label-sm text-[10px] px-1.5 py-0.5 rounded border uppercase font-mono tracking-widest shrink-0 ${
                        item.badgeTone === 'rust'
                          ? 'bg-error-container text-on-error-container border-error/30'
                          : 'bg-primary-container/20 text-primary border-primary/30'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : (
                    <span className="material-symbols-outlined text-body-sm text-outline/50">
                      chevron_right
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer: Agent Counsel Box & Profile Switcher */}
        <div className="p-space-base border-t border-outline-variant/30 space-y-space-md bg-surface-container-lowest">
          {/* Active Agent Counsel Badge */}
          <div className="p-space-sm bg-surface-container-low rounded border border-outline-variant/30 space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-primary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[13px] text-on-primary-container">
                  auto_awesome
                </span>
              </div>
              <span className="font-label-sm text-[10px] text-primary tracking-wider uppercase font-semibold">
                Agent Counsel: Active
              </span>
            </div>
            <p className="font-label-sm text-[10px] text-outline leading-tight">
              Trained on 48,000+ Master Services Agreements (SEC EDGAR)
            </p>
          </div>

          {/* General Counsel Profile Block */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-space-sm min-w-0">
              <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/60 flex items-center justify-center font-serif text-primary font-bold text-sm shrink-0">
                ER
              </div>
              <div className="min-w-0 flex flex-col">
                <span className="font-label-lg text-xs text-on-surface truncate font-semibold">
                  Elena Rostova
                </span>
                <span className="font-label-sm text-[10px] text-outline truncate">
                  General Counsel
                </span>
              </div>
            </div>
            <span className="font-label-sm text-[9px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded border border-secondary/30 uppercase tracking-wider font-mono font-semibold shrink-0">
              Enterprise
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-80 flex flex-col min-h-screen min-w-0">
        {/* Sticky Top Context Header */}
        <header className="sticky top-0 z-30 w-full min-h-[4rem] bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant/30 flex flex-wrap items-center justify-between px-space-base md:px-space-lg py-2 gap-space-sm shadow-sm">
          {/* Left: Mobile Toggle & Matter Context */}
          <div className="flex items-center gap-space-md min-w-0">
            <button
              type="button"
              className="lg:hidden p-2 text-outline hover:text-on-surface"
              onClick={() => setMobileOpen(true)}
              aria-label="Open Navigation Menu"
            >
              <span className="material-symbols-outlined text-body-lg">menu</span>
            </button>

            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-space-xs flex-wrap">
                <span className="font-headline-md text-base md:text-lg text-on-surface font-semibold truncate">
                  Matter #2025-INT-809
                </span>
                <span className="font-label-sm text-outline">|</span>
                <span className="font-body-md text-xs md:text-sm text-on-surface-variant truncate">
                  Cloud Services & Enterprise License Agreement
                </span>
              </div>
              <div className="flex items-center gap-2 pt-0.5 text-label-sm">
                <span className="text-outline uppercase tracking-wider text-[10px]">
                  Counterparty: Apex Dynamics Corp.
                </span>
                <span className="text-outline text-[10px]">•</span>
                <span className="text-primary uppercase tracking-wider font-semibold text-[10px]">
                  Round 3 of 4 · Counterparty Redline Received
                </span>
              </div>
            </div>
          </div>

          {/* Right: Global Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              icon="difference"
              onClick={() => navigate('/negotiations/2025-INT-809')}
            >
              Compare Diff
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() => navigate('/reports/2025-INT-809')}
            >
              Export Clean Copy
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="draw"
              onClick={() => navigate('/negotiations/2025-INT-809')}
            >
              Draft Compromise
            </Button>
          </div>
        </header>

        {/* Page Content Outlet */}
        <main className="flex-1 w-full bg-background min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
