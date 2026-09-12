import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { Button } from '../components/Button';
import { useAuth, UserRole } from '../context/AuthContext';
import { useIntake } from '../context/IntakeContext';

interface NavItem {
  name: string;
  path: string;
  icon: string;
  badge?: string;
  badgeTone?: 'amber' | 'forest' | 'rust';
}

export const SidebarLayout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, switchRole, logout, isAuthenticated } = useAuth();
  const { matterId, matterTitle, counterparty, isUploaded } = useIntake();

  const activeMatterId = matterId || '2025-INT-809';

  const NAV_ITEMS: NavItem[] = [
    { name: 'Operations Command', path: '/dashboard', icon: 'dashboard' },
    { name: 'Contract Intake', path: '/intake', icon: 'upload_file' },
    {
      name: 'Live Agent Pipeline',
      path: `/pipeline/${activeMatterId}`,
      icon: 'account_tree',
      badge: 'LIVE',
      badgeTone: 'amber',
    },
    {
      name: 'Negotiation Room',
      path: `/negotiations/${activeMatterId}`,
      icon: 'handshake',
    },
    { name: 'Negotiation Sandbox', path: '/sandbox', icon: 'science' },
    { name: 'Executive Report', path: `/reports/${activeMatterId}`, icon: 'description' },
    { name: 'Audit and Governance', path: '/governance', icon: 'verified_user' },
  ];

  // Close profile popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSwitchRole = (newRole: UserRole) => {
    switchRole(newRole);
    setProfileOpen(false);
  };

  const handleSignOut = () => {
    logout();
    setProfileOpen(false);
    navigate('/login');
  };

  // Highlight or title check
  const isWorkspace = location.pathname.startsWith('/negotiations');
  const isReport = location.pathname.startsWith('/reports');
  const isGovernance = location.pathname.startsWith('/governance') || location.pathname.startsWith('/team');

  // Current user display data
  const displayName = user?.name ?? 'Guest User';
  const displayInitials = user?.initials ?? 'GU';
  const displayTitle = user?.title ?? 'Legal Counsel';
  const displayEmail = user?.email ?? '';
  const displayCompany = user?.company ?? 'Enterprise';
  const activeRole = user?.role ?? role;

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
                (item.path.startsWith('/reports') && isReport) ||
                (item.path.startsWith('/governance') && isGovernance);

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

        {/* Sidebar Footer: Agent Counsel Box & Dynamic Profile Block */}
        <div className="p-space-base border-t border-outline-variant/30 space-y-space-md bg-surface-container-lowest">
          {/* Active Agent Counsel Badge */}
          <div className="p-space-sm bg-surface-container-low rounded border border-outline-variant/30 space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-primary-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[13px] text-on-primary-container">auto_awesome</span>
              </div>
              <span className="font-label-sm text-[10px] text-primary tracking-wider uppercase font-semibold">
                Agent Counsel: Active
              </span>
            </div>
            <p className="font-label-sm text-[10px] text-outline leading-tight">
              Trained on 48,000+ Master Services Agreements (SEC EDGAR)
            </p>
          </div>

          {/* Dynamic User Profile Block */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              id="sidebar-profile-btn"
              onClick={() => setProfileOpen((prev) => !prev)}
              className="w-full flex items-center justify-between pt-1 hover:bg-surface-container-high/40 rounded px-1 py-1 transition-colors group"
            >
              <div className="flex items-center gap-space-sm min-w-0">
                {/* Avatar */}
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={displayName}
                    className="w-8 h-8 rounded-full border border-outline-variant/60 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant/60 flex items-center justify-center font-serif text-primary font-bold text-sm shrink-0">
                    {displayInitials}
                  </div>
                )}
                {/* Info */}
                <div className="min-w-0 flex flex-col">
                  <span className="font-label-lg text-xs text-on-surface truncate font-semibold">{displayName}</span>
                  <span className="font-label-sm text-[10px] text-outline truncate">{displayTitle}</span>
                </div>
              </div>
              {/* Role badge + chevron */}
              <div className="flex items-center gap-1 shrink-0">
                <span
                  className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-mono font-semibold ${
                    activeRole === 'unified_demo'
                      ? 'text-[#D97706] bg-[#FEF3C7] border-[#FCD34D]'
                      : activeRole === 'buyer'
                      ? 'text-primary bg-primary-container/20 border-primary/30'
                      : 'text-secondary bg-secondary-container/20 border-secondary/30'
                  }`}
                >
                  {activeRole === 'unified_demo' ? 'Unified' : activeRole === 'buyer' ? 'Buyer' : 'Seller'}
                </span>
                <span className={`material-symbols-outlined text-outline text-[14px] transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}>
                  expand_less
                </span>
              </div>
            </button>

            {/* Profile Popover (slides up from below) */}
            {profileOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-surface-container border border-outline-variant/50 rounded-xl shadow-[0_-8px_30px_rgba(0,0,0,0.5)] overflow-hidden z-50">
                {/* Profile Header */}
                <div className="px-4 pt-4 pb-3 border-b border-outline-variant/20 space-y-2">
                  <div className="flex items-center gap-3">
                    {user?.avatar ? (
                      <img src={user.avatar} alt={displayName}
                        className="w-10 h-10 rounded-full border border-outline-variant/60 object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-surface-container-high border border-outline-variant/60 flex items-center justify-center font-serif text-primary font-bold text-sm shrink-0">
                        {displayInitials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-on-surface truncate">{displayName}</div>
                      <div className="text-[11px] text-outline font-mono truncate">{displayEmail || displayCompany}</div>
                    </div>
                  </div>
                  {isAuthenticated && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-secondary">
                      <span className="material-symbols-outlined text-[12px]">verified</span>
                      <span>Google Auth Verified · {user?.provider === 'google' ? 'OAuth 2.0' : 'Enterprise SSO'}</span>
                    </div>
                  )}
                  <div className="text-[10px] font-mono text-outline">
                    {user?.authorityLevel ?? 'Level 2 ($2M ARR Threshold)'}
                  </div>
                </div>

                {/* Role Switcher */}
                <div className="px-3 py-2.5 border-b border-outline-variant/20">
                  <p className="font-mono text-[9px] uppercase text-outline tracking-widest mb-2">Switch Negotiation Role</p>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      id="switch-buyer-btn"
                      onClick={() => handleSwitchRole('buyer')}
                      className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border transition-all duration-150 ${
                        activeRole === 'buyer'
                          ? 'border-primary/60 bg-primary-container/15 text-primary'
                          : 'border-outline-variant/30 bg-surface-container-lowest hover:border-primary/40 text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">business_center</span>
                      <span className="font-mono text-[8.5px] font-bold uppercase tracking-wider">Buyer</span>
                      <span className="text-[7.5px] text-outline">Party A</span>
                    </button>
                    <button
                      type="button"
                      id="switch-seller-btn"
                      onClick={() => handleSwitchRole('seller')}
                      className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border transition-all duration-150 ${
                        activeRole === 'seller'
                          ? 'border-secondary/60 bg-secondary-container/15 text-secondary'
                          : 'border-outline-variant/30 bg-surface-container-lowest hover:border-secondary/40 text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">handshake</span>
                      <span className="font-mono text-[8.5px] font-bold uppercase tracking-wider">Seller</span>
                      <span className="text-[7.5px] text-outline">Party B</span>
                    </button>
                    <button
                      type="button"
                      id="switch-unified-btn"
                      onClick={() => handleSwitchRole('unified_demo')}
                      className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg border transition-all duration-150 ${
                        activeRole === 'unified_demo'
                          ? 'border-[#D97706] bg-[#FEF3C7] text-[#92400E]'
                          : 'border-outline-variant/30 bg-surface-container-lowest hover:border-[#D97706]/40 text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">balance</span>
                      <span className="font-mono text-[8.5px] font-bold uppercase tracking-wider">Unified</span>
                      <span className="text-[7.5px] text-outline">Both</span>
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-3 py-2 space-y-0.5">
                  <button
                    type="button"
                    onClick={() => { navigate('/governance?tab=team'); setProfileOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors text-xs font-medium"
                  >
                    <span className="material-symbols-outlined text-[16px]">manage_accounts</span>
                    Manage Team
                  </button>
                  <button
                    type="button"
                    id="sign-out-btn"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded text-error/80 hover:text-error hover:bg-error-container/15 transition-colors text-xs font-medium"
                  >
                    <span className="material-symbols-outlined text-[16px]">logout</span>
                    Sign Out
                  </button>
                </div>
              </div>
            )}
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
                  Matter #{activeMatterId}
                </span>
                <span className="font-label-sm text-outline">|</span>
                <span className="font-body-md text-xs md:text-sm text-on-surface-variant truncate">
                  {matterTitle || 'Enterprise Cloud & Licensing Agreement'}
                </span>
              </div>
              <div className="flex items-center gap-2 pt-0.5 text-label-sm">
                <span className="text-outline uppercase tracking-wider text-[10px]">
                  Counterparty: {counterparty || 'Apex Dynamics Corp.'}
                </span>
                <span className="text-outline text-[10px]">•</span>
                <span className="text-primary uppercase tracking-wider font-semibold text-[10px]">
                  {isUploaded ? 'Ingestion Active · Concession Engine Ready' : 'Round 3 of 4 · Counterparty Redline Received'}
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
              onClick={() => navigate(`/negotiations/${activeMatterId}`)}
            >
              Compare Diff
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={() => navigate(`/reports/${activeMatterId}`)}
            >
              Export Clean Copy
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="draw"
              onClick={() => navigate(`/negotiations/${activeMatterId}`)}
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
