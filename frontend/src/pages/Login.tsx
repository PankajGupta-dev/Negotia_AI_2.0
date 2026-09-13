import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { useAuth, UserRole, GoogleProfile } from '../context/AuthContext';

// ──────────────────────────────────────────────────────────────────────────────
// Google Auth Simulation Modal
// ──────────────────────────────────────────────────────────────────────────────
interface GoogleAuthModalProps {
  onSuccess: (profile: GoogleProfile) => void;
  onClose: () => void;
  selectedRole: UserRole;
}

const GOOGLE_DEMO_ACCOUNTS = [
  {
    name: 'Elena Rostova',
    email: 'e.rostova@velocesystems.com',
    avatar: null,
    company: 'Veloce Systems Inc.',
  },
  {
    name: 'Marcus Vance',
    email: 'm.vance@apexdynamics.com',
    avatar: null,
    company: 'Apex Dynamics Corp.',
  },
  {
    name: 'Priya Sharma',
    email: 'priya.sharma@novartisdigital.com',
    avatar: null,
    company: 'Novartis Global Digital',
  },
];

const GoogleAuthModal: React.FC<GoogleAuthModalProps> = ({ onSuccess, onClose, selectedRole }) => {
  const [step, setStep] = useState<'picker' | 'email'>('picker');
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handlePickAccount = (account: typeof GOOGLE_DEMO_ACCOUNTS[0]) => {
    simulateOAuth({ name: account.name, email: account.email });
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customEmail || !customName) return;
    simulateOAuth({ name: customName, email: customEmail });
  };

  const simulateOAuth = (data: { name: string; email: string }) => {
    setIsAuthenticating(true);
    // Simulate 1.8s OAuth handshake
    setTimeout(() => {
      onSuccess({
        name: data.name,
        email: data.email,
        selectedRole,
      });
    }, 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-surface-container-low border border-outline-variant/40 rounded-xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Google Brand Strip */}
        <div className="bg-[#1a1a1a] border-b border-outline-variant/30 px-6 pt-8 pb-6 text-center space-y-4">
          {/* Google Logo */}
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span className="text-white font-medium text-lg tracking-wide">Sign in with Google</span>
          </div>
          <p className="text-outline text-xs font-mono">
            {isAuthenticating
              ? 'Verifying credentials with Google Identity Platform...'
              : 'Choose your Google account to access Negotia AI'}
          </p>

          {isAuthenticating && (
            <div className="flex items-center justify-center gap-3 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <span className="text-outline text-xs font-mono">Authenticating via OAuth 2.0...</span>
            </div>
          )}
        </div>

        {!isAuthenticating && (
          <div className="p-4 space-y-2">
            {/* Account Picker */}
            {step === 'picker' && (
              <>
                {GOOGLE_DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => handlePickAccount(acc)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 hover:border-primary/50 transition-all duration-150 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary-container/30 border border-primary/30 flex items-center justify-center font-serif text-primary font-bold text-sm shrink-0">
                      {acc.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="text-on-surface text-sm font-semibold truncate group-hover:text-white transition-colors">{acc.name}</span>
                      <span className="text-outline text-xs font-mono truncate">{acc.email}</span>
                    </div>
                    <span className="material-symbols-outlined text-outline text-sm ml-auto shrink-0">arrow_forward_ios</span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setStep('email')}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/20 hover:border-outline-variant/50 transition-all duration-150 text-on-surface-variant hover:text-on-surface"
                >
                  <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-outline text-lg">person_add</span>
                  </div>
                  <span className="text-sm font-medium">Use another account</span>
                </button>
              </>
            )}

            {/* Custom Email Input */}
            {step === 'email' && (
              <form onSubmit={handleCustomSubmit} className="space-y-3 px-2">
                <div>
                  <label className="font-mono text-[10px] uppercase text-outline block mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g. Sarah Chen, Esq."
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase text-outline block mb-1">Work Email</label>
                  <input
                    type="email"
                    required
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="sarah.chen@enterprise-legal.com"
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded px-3 py-2.5 text-on-surface text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setStep('picker')}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-outline-variant/40 text-on-surface-variant hover:text-on-surface text-sm font-medium transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 rounded-lg bg-[#1a73e8] hover:bg-[#1558b0] text-white text-sm font-semibold transition-colors"
                  >
                    Next
                  </button>
                </div>
              </form>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full text-center text-outline hover:text-on-surface text-xs font-mono pt-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Login Page
// ──────────────────────────────────────────────────────────────────────────────
export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { loginWithGoogle, loginAsPreset } = useAuth();
  const selectedRole: UserRole = 'buyer';
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleGoogleSuccess = (googleProfile: GoogleProfile) => {
    setShowGoogleModal(false);
    setIsLoggingIn(true);
    // Short animation pause then login
    setTimeout(() => {
      loginWithGoogle(googleProfile);
      navigate('/intake');
    }, 600);
  };

  const handleDemoLogin = (preset: 'buyer_demo' | 'seller_demo' | 'unified_demo') => {
    setIsLoggingIn(true);
    setTimeout(() => {
      loginAsPreset(preset);
      navigate('/intake');
    }, 700);
  };

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col items-center justify-center relative overflow-hidden px-4">
      {/* Google Auth Modal */}
      {showGoogleModal && (
        <GoogleAuthModal
          selectedRole={selectedRole}
          onSuccess={handleGoogleSuccess}
          onClose={() => setShowGoogleModal(false)}
        />
      )}

      {/* Background Ambient Effects */}
      <div className="fixed inset-0 pointer-events-none select-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_40%_20%,rgba(217,119,6,0.07)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(217,119,6,0.05)_0%,transparent_50%)]" />
        <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(#ffb77d_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      {/* Card Container */}
      <div className={`relative w-full max-w-md space-y-6 transition-all duration-500 ${isLoggingIn ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>

        {/* Logo & Brand */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <WaxSealLogo size={52} pulse />
          </div>
          <div className="flex items-baseline gap-2 justify-center">
            <span className="font-wapilor text-4xl tracking-wider text-on-surface uppercase leading-none">
              Negotia
            </span>
            <span className="font-bevas text-4xl tracking-widest leading-none bg-gradient-to-r from-primary via-amber-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(217,119,6,0.4)]">
              AI
            </span>
          </div>
          <p className="font-mono text-[11px] text-outline uppercase tracking-widest">
            Enterprise Legal Intelligence Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Card Header */}
          <div className="px-6 pt-6 pb-4 border-b border-outline-variant/20">
            <h1 className="font-headline-xl text-xl text-on-surface font-semibold">
              Client Sign In
            </h1>
            <p className="font-body-md text-xs text-on-surface-variant mt-1">
              Authenticate with your enterprise Google account to access your docket.
            </p>
          </div>

          <div className="p-6 space-y-5">
            {/* GOOGLE SIGN IN */}
            <button
              type="button"
              id="google-signin-btn"
              onClick={() => setShowGoogleModal(true)}
              className="w-full flex items-center justify-center gap-3 py-3 px-5 bg-white hover:bg-gray-50 text-[#3c4043] font-medium text-sm rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.99]"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Continue with Google
            </button>

            {/* DIVIDER */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-outline-variant/20" />
              <span className="font-mono text-[10px] text-outline uppercase tracking-widest">or use demo profile</span>
              <div className="flex-1 h-px bg-outline-variant/20" />
            </div>

            {/* UNIFIED DEMO PROFILE (Full Buyer + Seller Access) */}
            <button
              type="button"
              id="demo-unified-btn"
              onClick={() => handleDemoLogin('unified_demo')}
              className="w-full flex items-center justify-between p-3.5 bg-gradient-to-r from-[#D97706] via-[#B45309] to-[#92400E] hover:from-[#F59E0B] hover:via-[#D97706] hover:to-[#B45309] border border-[#FCD34D]/40 hover:border-[#FCD34D] rounded-xl transition-all duration-200 group shadow-md hover:shadow-amber-900/40"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/20 border border-white/40 flex items-center justify-center font-serif text-white font-bold text-xs shrink-0 shadow-inner">
                  ND
                </div>
                <div className="flex flex-col items-start text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white tracking-tight">
                      Negotiation Demo
                    </span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 bg-white/20 text-white border border-white/40 rounded font-bold uppercase backdrop-blur-xs">
                      Unified Counsel
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-amber-100/90 font-medium">
                    Full Buyer + Seller access · Bilateral Workspace
                  </span>
                </div>
              </div>
              <span className="material-symbols-outlined text-white text-base shrink-0 group-hover:translate-x-1 transition-transform">
                arrow_forward
              </span>
            </button>

            {/* SEPARATE BUYER & SELLER DEMO LOGINS */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                id="demo-buyer-btn"
                onClick={() => handleDemoLogin('buyer_demo')}
                className="flex flex-col items-start gap-0.5 px-3 py-2.5 bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/30 hover:border-primary/40 rounded-lg transition-all duration-150 group"
              >
                <div className="flex items-center gap-1.5 w-full">
                  <div className="w-5 h-5 rounded-full bg-primary-container/30 flex items-center justify-center font-serif text-primary font-bold text-[9px] shrink-0">ER</div>
                  <span className="font-mono text-[9px] text-primary uppercase font-bold">Buyer Demo</span>
                </div>
                <span className="font-medium text-[11px] text-on-surface group-hover:text-white transition-colors">Elena Rostova</span>
                <span className="font-mono text-[9px] text-outline">General Counsel</span>
              </button>
              <button
                type="button"
                id="demo-seller-btn"
                onClick={() => handleDemoLogin('seller_demo')}
                className="flex flex-col items-start gap-0.5 px-3 py-2.5 bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/30 hover:border-secondary/40 rounded-lg transition-all duration-150 group"
              >
                <div className="flex items-center gap-1.5 w-full">
                  <div className="w-5 h-5 rounded-full bg-secondary-container/30 flex items-center justify-center font-serif text-secondary font-bold text-[9px] shrink-0">MV</div>
                  <span className="font-mono text-[9px] text-secondary uppercase font-bold">Seller Demo</span>
                </div>
                <span className="font-medium text-[11px] text-on-surface group-hover:text-white transition-colors">Marcus Vance</span>
                <span className="font-mono text-[9px] text-outline">VP Commercial Legal</span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-outline-variant/20 bg-surface-container-lowest/60 flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-sm">lock</span>
            <p className="font-mono text-[10px] text-outline">
              Secured via Google OAuth 2.0 · SOC-2 Compliant · Delaware Chancery Certified
            </p>
          </div>
        </div>

        {/* Back to Landing */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-outline hover:text-on-surface text-xs font-mono transition-colors"
          >
            ← Back to Platform Overview
          </button>
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoggingIn && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm">
          <WaxSealLogo size={56} pulse />
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-primary animate-bounce"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
          <p className="font-mono text-xs text-outline uppercase tracking-widest">Accessing secure docket...</p>
        </div>
      )}
    </div>
  );
};
