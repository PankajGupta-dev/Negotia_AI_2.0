import React, { useState } from 'react';
import { Button } from '../components/Button';
import { DEFAULT_AI_SETTINGS, AISettingsConfig } from '../data/mock';

export const Settings: React.FC = () => {
  const [config, setConfig] = useState<AISettingsConfig>(DEFAULT_AI_SETTINGS);
  const [savedNotice, setSavedNotice] = useState(false);

  const getAdvisoryText = (val: number) => {
    if (val <= 10) {
      return {
        stance: 'Conservative Stance',
        text: 'At strict conservative variance, Negotia AI strictly requires manual sign-off for any deviations from model standard terms.',
      };
    } else if (val <= 25) {
      return {
        stance: 'Moderate Enterprise Stance',
        text: 'At moderate variance, Negotia AI autonomously negotiates Net 45-60 payment terms, 1.5x ARR liability caps, and standard mutual indemnity carve-outs without requiring partner sign-off.',
      };
    } else if (val <= 40) {
      return {
        stance: 'Aggressive Deal Velocity',
        text: 'At high variance, the agent is authorized to concede on non-exclusive territory rights and uncapped indirect damages within high-value enterprise accounts.',
      };
    } else {
      return {
        stance: 'High Exposure Ceiling',
        text: 'CRITICAL: Super-caps and unlimited warranties may be conceded. Dual General Counsel HSM keys required to deploy drafts.',
      };
    }
  };

  const advisory = getAdvisoryText(config.varianceCeiling);

  const handleSave = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="w-full bg-background text-on-surface p-space-base md:p-space-lg lg:p-space-xl space-y-space-xl min-h-screen">
      {/* 1. TOP BREADCRUMB & HEADER */}
      <div className="space-y-space-md border-b border-outline-variant/30 pb-space-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
          <div className="flex items-center gap-2 font-mono text-xs text-outline uppercase tracking-wider">
            <span>Negotia AI</span>
            <span>/</span>
            <span>Enterprise Workspace</span>
            <span>/</span>
            <span className="text-primary font-semibold">AI Configuration</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] bg-surface-container-high text-on-surface px-2 py-0.5 rounded border border-outline-variant/30">
              DOCKET #SET-2025-CFG
            </span>
            <span className="font-mono text-[10px] text-secondary bg-secondary-container/20 px-2 py-0.5 rounded border border-secondary/30 uppercase font-bold">
              SEC Verified
            </span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
          <div className="space-y-1">
            <h1 className="font-headline-xl text-3xl md:text-4xl text-on-surface tracking-tight font-semibold">
              AI Model & Autonomous Negotiation Configuration
            </h1>
            <p className="font-body-md text-on-surface-variant text-sm max-w-3xl">
              Configure multi-agent deliberative parameters, autonomous concession risk limits, and
              bilateral negotiation model weights across enterprise playbooks.
            </p>
          </div>

          <div className="flex items-center gap-space-sm shrink-0">
            <Button
              variant="outline"
              size="md"
              onClick={() => setConfig(DEFAULT_AI_SETTINGS)}
            >
              Reset to Defaults
            </Button>
            <Button
              variant="primary"
              size="md"
              icon="lock"
              onClick={handleSave}
            >
              Save Staged Changes
            </Button>
          </div>
        </div>

        {savedNotice && (
          <div className="p-space-sm bg-secondary-container/20 border border-secondary/40 text-secondary font-mono text-xs rounded flex items-center gap-2 animate-fade-in">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span>Configuration changes cryptographically sealed and pushed to active playbooks.</span>
          </div>
        )}
      </div>

      {/* 2. SECTION 1: MODEL SELECTION */}
      <section className="bg-surface-container-low p-space-lg rounded border border-outline-variant/30 space-y-space-md shadow-sm">
        <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-xl">psychology</span>
            <h2 className="font-headline-md text-xl text-on-surface font-semibold">
              Deliberative AI Model Selection
            </h2>
          </div>
          <span className="font-mono text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded uppercase font-semibold">
            CORE-ENGINE-01
          </span>
        </div>

        <div className="space-y-space-sm">
          <label className="font-mono text-xs uppercase tracking-wider text-outline block">
            Foundation Legal Reasoning Engine
          </label>
          <select
            value={config.foundationModel}
            onChange={(e) => setConfig({ ...config, foundationModel: e.target.value })}
            className="w-full h-11 px-space-base bg-surface-container-lowest text-on-surface rounded font-body-md text-sm border border-outline-variant/40 focus:outline-none focus:border-primary"
          >
            <option>Negotia Lex-Ultra v4.2 (Fine-tuned on 48,000+ SEC EDGAR Precedents)</option>
            <option>Negotia Lex-Standard v3.9 (Balanced Latency · Commercial Agreements)</option>
            <option>Anthropic Claude 3.5 Sonnet (Direct High-Context Redlining Fallback)</option>
            <option>Negotia Private On-Premise LegalLLM (Cold Sovereign Isolation)</option>
          </select>

          {/* Model Telemetry Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-container-high text-on-surface rounded">
              <span className="material-symbols-outlined text-secondary text-sm">bolt</span>
              Latency: 240ms
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-secondary-container/20 text-secondary rounded font-semibold border border-secondary/30">
              <span className="material-symbols-outlined text-sm">verified</span>
              Hallucination Zero Verified
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-container-high text-on-surface rounded">
              <span className="material-symbols-outlined text-primary text-sm">database</span>
              Context: 128k Tokens
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-surface-container-high text-outline rounded">
              Dual-Signature Checkpoint #4401
            </span>
          </div>
        </div>

        {/* Temperature Steerability */}
        <div className="pt-space-sm space-y-space-xs border-t border-outline-variant/20">
          <label className="font-mono text-xs uppercase tracking-wider text-outline block">
            Temperature / Deterministic Concession Steerability
          </label>
          <select
            value={config.temperatureMode}
            onChange={(e) => setConfig({ ...config, temperatureMode: e.target.value })}
            className="w-full h-10 px-space-base bg-surface-container-lowest text-on-surface rounded font-body-md text-sm border border-outline-variant/40 focus:outline-none focus:border-primary"
          >
            <option>Strict Deterministic (0.05 Temp - Zero Drift, Absolute Clause Fidelity)</option>
            <option>Cautious Synthesizer (0.15 Temp - Standard Enterprise Compromises)</option>
            <option>Creative Compromise (0.35 Temp - Exploratory Pareto Trade-offs)</option>
          </select>
          <p className="font-body-sm text-xs text-outline italic">
            Strict deterministic mode forces mathematical adherence to pre-approved corporate legal
            fallbacks, eliminating unvetted clause drafting.
          </p>
        </div>
      </section>

      {/* 3. SECTION 2: CONCESSION RISK THRESHOLDS */}
      <section className="bg-surface-container-low p-space-lg rounded border border-outline-variant/30 space-y-space-md shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-space-xs border-b border-outline-variant/20">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-xl">tune</span>
            <h2 className="font-headline-md text-xl text-on-surface font-semibold">
              Autonomous Concession & Risk Thresholds
            </h2>
          </div>
          <div className="font-mono text-xs bg-primary-container text-on-primary-container font-semibold px-2.5 py-1 rounded">
            {config.varianceCeiling}% Variance Ceiling ({advisory.stance})
          </div>
        </div>

        <p className="font-body-md text-xs text-on-surface-variant leading-relaxed">
          Defines the allowable delta between inbound counterparty terms and standard firm playbook
          before human partner escalation is triggered.
        </p>

        <div className="space-y-space-sm pt-space-xs">
          <input
            type="range"
            min="0"
            max="50"
            step="0.5"
            value={config.varianceCeiling}
            onChange={(e) =>
              setConfig({ ...config, varianceCeiling: parseFloat(e.target.value) })
            }
            className="w-full h-2 bg-surface-container-highest rounded appearance-none cursor-pointer accent-primary-container"
          />
          <div className="w-full flex justify-between pt-1 font-mono text-[10px] text-outline">
            <span>0% Conservative</span>
            <span>15% Playbook Parity</span>
            <span>30% Velocity</span>
            <span className="text-error">50% High Exposure</span>
          </div>

          <div className="bg-primary-container/10 p-space-base rounded border border-primary-container/20 flex items-start gap-space-sm mt-space-md">
            <span className="material-symbols-outlined text-primary text-xl shrink-0">info</span>
            <div className="space-y-1">
              <span className="font-mono text-xs text-primary font-semibold uppercase tracking-wider block">
                Operational Playbook Mandate at {config.varianceCeiling}%:
              </span>
              <p className="font-body-md text-xs text-on-surface leading-relaxed">
                {advisory.text}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SECTION 3: AUTONOMOUS DIRECTIVES & NOTIFICATIONS */}
      <section className="bg-surface-container-low p-space-lg rounded border border-outline-variant/30 space-y-space-md shadow-sm">
        <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-primary text-xl">toggle_on</span>
            <h2 className="font-headline-md text-xl text-on-surface font-semibold">
              Autonomous Execution & Notification Directives
            </h2>
          </div>
          <span className="font-mono text-xs text-outline">5 ACTIVE PROTOCOLS</span>
        </div>

        <div className="space-y-space-sm">
          {[
            {
              key: 'autoCounterRedlines',
              title: 'Autonomous Counter-Redline Generation',
              desc: 'Instantly synthesize redline revisions based on EDGAR market precedents upon inbound receipt.',
              restricted: false,
            },
            {
              key: 'partnerSuperCapEscalation',
              title: 'Partner Escalation on Super-Cap Breaches',
              desc: 'Notify Lead Partner immediately via encrypted webhook if counterparty demands uncapped damages.',
              restricted: false,
            },
            {
              key: 'conformedConsensusPush',
              title: 'Conformed Consensus Real-time Push',
              desc: 'Dispatch webhooks and executive briefs to stakeholders upon reaching bilateral Pareto consensus.',
              restricted: false,
            },
            {
              key: 'autonomousDispatch',
              title: 'Autonomous Dispatch to Counterparty Outside Counsel',
              desc: 'Automatically send conformed drafts directly without human pre-review (Requires General Counsel dual-key authorization).',
              restricted: true,
            },
            {
              key: 'adversarialStrategyDetection',
              title: 'Adversarial Strategy Detection',
              desc: 'Alert counsel with high-priority tags when counterparty employs asymmetric indemnity or subtle IP carve-outs.',
              restricted: false,
            },
          ].map((item) => {
            const isChecked = config[item.key as keyof AISettingsConfig] as boolean;
            return (
              <div
                key={item.key}
                className="p-space-base bg-surface-container-lowest rounded border border-outline-variant/20 flex items-start justify-between gap-space-md"
              >
                <div className="space-y-0.5 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="font-label-lg text-sm text-on-surface font-semibold">
                      {item.title}
                    </span>
                    {item.restricted && (
                      <span className="font-mono text-[9px] bg-error-container/30 text-error px-1.5 py-0.5 rounded uppercase font-semibold">
                        Dual-Key Restricted
                      </span>
                    )}
                  </div>
                  <p className="font-body-sm text-xs text-outline leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isChecked}
                  onClick={() =>
                    setConfig({
                      ...config,
                      [item.key]: !isChecked,
                    })
                  }
                  className={`w-12 h-6 rounded relative transition-colors shrink-0 focus:outline-none ${
                    isChecked ? 'bg-primary-container' : 'bg-surface-container-high'
                  }`}
                >
                  <span
                    className={`w-5 h-5 bg-surface-container-lowest rounded-sm absolute top-0.5 transition-transform ${
                      isChecked ? 'right-0.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. DISPLAY APPEARANCE & CONTRAST */}
      <section className="bg-surface-container-low p-space-lg rounded border border-outline-variant/30 space-y-space-md shadow-sm">
        <div className="flex items-center gap-space-xs pb-space-xs border-b border-outline-variant/20">
          <span className="material-symbols-outlined text-primary text-xl">palette</span>
          <h2 className="font-headline-md text-xl text-on-surface font-semibold">
            Display Appearance & Contrast Mode
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-base">
          <div
            onClick={() => setConfig({ ...config, displayMode: 'parchment' })}
            className={`cursor-pointer p-space-base rounded border-2 transition-all space-y-2 ${
              config.displayMode === 'parchment'
                ? 'border-primary bg-surface-container-high shadow'
                : 'border-outline-variant/30 bg-surface-container-lowest'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-headline-md text-sm font-bold text-on-surface">
                Tactile Parchment (Default Legal Folio)
              </span>
              {config.displayMode === 'parchment' && (
                <span className="material-symbols-outlined text-primary text-sm">
                  check_circle
                </span>
              )}
            </div>
            <div className="p-3 bg-[#EDE7DC] rounded space-y-2 border border-[#D6CEBE]">
              <div className="h-3 w-1/3 bg-[#1C1917] rounded-none" />
              <div className="h-2 w-full bg-[#D6CEBE] rounded-none" />
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#1C1917]">
                <span className="w-3 h-3 bg-[#D97706] inline-block" />
                <span className="w-3 h-3 bg-[#1C1917] inline-block" />
                <span>#F5F1E8 Parchment</span>
              </div>
            </div>
          </div>

          <div
            onClick={() => setConfig({ ...config, displayMode: 'dark_ink' })}
            className={`cursor-pointer p-space-base rounded border-2 transition-all space-y-2 ${
              config.displayMode === 'dark_ink'
                ? 'border-primary bg-surface-container-high shadow'
                : 'border-outline-variant/30 bg-surface-container-lowest'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-headline-md text-sm font-bold text-on-surface">
                Dark Ink Terminal (Night Review)
              </span>
              {config.displayMode === 'dark_ink' && (
                <span className="material-symbols-outlined text-primary text-sm">
                  check_circle
                </span>
              )}
            </div>
            <div className="p-3 bg-[#161311] rounded space-y-2 border border-[#383432]">
              <div className="h-3 w-1/3 bg-[#E9E1DD] rounded-none" />
              <div className="h-2 w-full bg-[#2D2927] rounded-none" />
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#E9E1DD]">
                <span className="w-3 h-3 bg-[#D97706] inline-block" />
                <span className="w-3 h-3 bg-[#2D2927] inline-block" />
                <span>#161311 Mineral Ink</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. PLAYBOOK INTEGRITY FOOTER */}
      <footer className="bg-surface-container-lowest p-space-base rounded border border-outline-variant/30 flex flex-col md:flex-row items-center justify-between gap-space-sm text-xs font-mono text-outline">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-primary font-bold">ACTIVE PLAYBOOK INTEGRITY:</span>
          <span className="text-on-surface">SHA-256 0x8f22e8d9...c091</span>
          <span>•</span>
          <span>EDGAR INDEX SYNCED 14:15 UTC</span>
          <span>•</span>
          <span className="text-secondary font-semibold">SOC-2 TYPE II SIGNED</span>
        </div>
        <div className="flex items-center gap-1.5 text-secondary font-semibold">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span>Counsel Guard Active</span>
        </div>
      </footer>
    </div>
  );
};
