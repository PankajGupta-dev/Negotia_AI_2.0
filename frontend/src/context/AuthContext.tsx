import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type UserRole = 'buyer' | 'seller' | 'unified_demo';
export type AuthProvider = 'google' | 'enterprise';

export interface UserProfile {
  uid: string;
  name: string;
  firstName: string;
  email: string;
  avatar?: string;        // URL from Google photo
  initials: string;
  role: UserRole;
  title: string;
  company: string;
  provider: AuthProvider;
  verified: boolean;
  authorityLevel: string;
  joinedAt: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  role: UserRole;
  isUnifiedDemo: boolean;
  loginWithGoogle: (googleProfile: GoogleProfile) => void;
  loginAsPreset: (preset: 'buyer_demo' | 'seller_demo' | 'unified_demo') => void;
  switchRole: (role: UserRole) => void;
  logout: () => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
}

export interface GoogleProfile {
  name: string;
  email: string;
  avatar?: string;
  selectedRole: UserRole;
}

// ──────────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'negotia_ai_user';

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('');
}

function buildProfile(googleProfile: GoogleProfile): UserProfile {
  const firstName = googleProfile.name.split(' ')[0];
  const role = googleProfile.selectedRole;
  return {
    uid: `google-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: googleProfile.name,
    firstName,
    email: googleProfile.email,
    avatar: googleProfile.avatar,
    initials: getInitials(googleProfile.name),
    role,
    title:
      role === 'unified_demo'
        ? 'Unified Counsel'
        : role === 'buyer'
        ? 'General Counsel & Procurement Lead'
        : 'Commercial Sales Counsel',
    company: googleProfile.email.split('@')[1]?.split('.')[0]?.replace(/-/g, ' ') || 'Enterprise',
    provider: 'google',
    verified: true,
    authorityLevel:
      role === 'unified_demo'
        ? 'Bilateral Executive Signer (Full Access)'
        : role === 'buyer'
        ? 'Level 3 ($5M ARR Threshold)'
        : 'Level 2 ($2M ARR Threshold)',
    joinedAt: new Date().toISOString(),
  };
}

const DEMO_PROFILES: Record<string, UserProfile> = {
  unified_demo: {
    uid: 'demo-unified-001',
    name: 'Negotiation Demo',
    firstName: 'Negotiation',
    email: 'unified.demo@negotia.ai',
    initials: 'ND',
    role: 'unified_demo',
    title: 'Unified Counsel',
    company: 'Bilateral Chamber',
    provider: 'enterprise',
    verified: true,
    authorityLevel: 'Unrestricted Demonstration Access (Buyer + Seller)',
    joinedAt: '2025-01-01T00:00:00Z',
  },
  buyer_demo: {
    uid: 'demo-buyer-001',
    name: 'Elena Rostova',
    firstName: 'Elena',
    email: 'e.rostova@velocesystems.com',
    initials: 'ER',
    role: 'buyer',
    title: 'General Counsel',
    company: 'Veloce Systems Inc.',
    provider: 'enterprise',
    verified: true,
    authorityLevel: 'Level 4 (Uncapped ARR Signer)',
    joinedAt: '2024-01-15T09:00:00Z',
  },
  seller_demo: {
    uid: 'demo-seller-001',
    name: 'Marcus Vance',
    firstName: 'Marcus',
    email: 'm.vance@apexdynamics.com',
    initials: 'MV',
    role: 'seller',
    title: 'VP Commercial Legal',
    company: 'Apex Dynamics Corp.',
    provider: 'enterprise',
    verified: true,
    authorityLevel: 'Level 3 ($5M ARR Threshold)',
    joinedAt: '2024-03-08T09:00:00Z',
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Context
// ──────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: UserProfile = JSON.parse(stored);
        setUser(parsed);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persist = useCallback((profile: UserProfile | null) => {
    if (profile) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setUser(profile);
  }, []);

  const loginWithGoogle = useCallback((googleProfile: GoogleProfile) => {
    const profile = buildProfile(googleProfile);
    persist(profile);
  }, [persist]);

  const loginAsPreset = useCallback((preset: 'buyer_demo' | 'seller_demo' | 'unified_demo') => {
    const profile = DEMO_PROFILES[preset];
    persist(profile);
  }, [persist]);

  const switchRole = useCallback((role: UserRole) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated: UserProfile = {
        ...prev,
        role,
        title:
          role === 'unified_demo'
            ? 'Unified Counsel'
            : role === 'buyer'
            ? 'General Counsel & Procurement Lead'
            : 'Commercial Sales Counsel',
        authorityLevel:
          role === 'unified_demo'
            ? 'Bilateral Executive Signer (Full Access)'
            : role === 'buyer'
            ? 'Level 3 ($5M ARR Threshold)'
            : 'Level 2 ($2M ARR Threshold)',
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const logout = useCallback(() => {
    persist(null);
  }, [persist]);

  const updateProfile = useCallback((updates: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const activeRole: UserRole = user?.role ?? 'buyer';
  const isUnifiedDemo = activeRole === 'unified_demo';

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        role: activeRole,
        isUnifiedDemo,
        loginWithGoogle,
        loginAsPreset,
        switchRole,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
