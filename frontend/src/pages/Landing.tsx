import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { Button } from '../components/Button';

export const Landing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-on-surface flex flex-col selection:bg-primary-container selection:text-on-surface">
      {/* 1. PUBLIC HEADER & BRAND NAVIGATION */}
      <header className="w-full bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant/30 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-space-base sm:px-space-lg h-16 flex items-center justify-between">
          {/* Left: Logo & Brand Badge */}
          <Link to="/" className="flex items-center gap-space-sm group">
            <WaxSealLogo size={36} />
            <div className="flex items-center gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="font-wapilor text-2xl sm:text-3xl tracking-wider text-on-surface uppercase leading-none group-hover:text-white transition-colors">
                  NEGOTIA
                </span>
                <span className="font-bevas text-2xl sm:text-3xl tracking-widest leading-none bg-gradient-to-r from-primary via-amber-300 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(217,119,6,0.35)]">
                  AI
                </span>
              </div>
              <span className="hidden md:inline-flex font-mono text-[9px] uppercase tracking-widest text-outline border border-outline-variant/50 bg-surface-container-high/60 px-2 py-0.5 rounded text-on-surface-variant font-medium">
                Enterprise Legal
              </span>
            </div>
          </Link>

          {/* Center Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-space-lg text-body-md font-body-md text-on-surface-variant">
            {[
              { href: '#workflow', label: 'Platform' },
              { href: '#features', label: 'Agent Architecture' },
              { href: '#precedents', label: 'Precedents & Risk' },
            ].map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className="relative py-1 text-on-surface-variant hover:text-primary transition-colors duration-200 group/navlink"
              >
                {label}
                <span className="absolute bottom-0 left-0 h-px w-0 bg-gradient-to-r from-primary to-amber-400 group-hover/navlink:w-full transition-all duration-300 ease-out" />
              </a>
            ))}
          </nav>

          {/* Right CTAs */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="hidden sm:inline-flex items-center gap-2 h-9 px-4 rounded-md bg-surface-container-high/60 hover:bg-surface-container-high text-on-surface hover:text-white border border-outline-variant/40 hover:border-primary/40 text-xs font-medium tracking-wide transition-all duration-200 backdrop-blur-sm shadow-sm hover:shadow active:scale-95 group cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-outline group-hover:text-primary transition-colors">
                lock
              </span>
              <span>Client Sign In</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="group relative inline-flex items-center justify-center gap-2 h-9 px-4 py-2 rounded-md bg-gradient-to-r from-amber-600 via-primary-container to-amber-500 hover:from-amber-500 hover:to-amber-400 text-on-primary-container font-semibold text-xs tracking-wide shadow-[0_0_20px_rgba(217,119,6,0.35)] hover:shadow-[0_0_28px_rgba(217,119,6,0.55)] border border-primary/40 transition-all duration-200 active:scale-95 overflow-hidden cursor-pointer"
            >
              {/* Subtle hover light shimmer */}
              <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out pointer-events-none" />
              <span>Launch Platform</span>
              <span className="material-symbols-outlined text-[16px] transition-transform duration-200 group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full">
        {/* 2. HERO SECTION */}
        <section className="relative w-full bg-surface-container-lowest pt-20 pb-28 md:pt-28 md:pb-40 overflow-hidden border-b border-outline-variant/30">
          {/* Hero Ambient Background Image with High Visibility & Warm Gold/Ink Grading */}
          <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
            <img
              src="/fonts/Negotia BG.jpeg"
              alt="Negotia AI Autonomous Legal Handshake"
              className="w-full h-full object-cover object-center scale-105 opacity-70 md:opacity-80 filter brightness-90 contrast-120 saturate-125 sepia-[0.15]"
              style={{
                maskImage: 'radial-gradient(ellipse 95% 85% at 50% 50%, black 45%, transparent 95%)',
                WebkitMaskImage: 'radial-gradient(ellipse 95% 85% at 50% 50%, black 45%, transparent 95%)',
              }}
            />
            {/* Ink Tone Vignette & Warm Amber Glow Overlays */}
            <div className="absolute inset-0 bg-gradient-to-b from-surface-container-lowest/80 via-transparent to-surface-container-lowest/90" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(217,119,6,0.15)_0%,rgba(22,19,17,0.35)_55%,#161311_95%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,183,125,0.08)_0%,transparent_65%)]" />
            {/* Fine Grid Texture */}
            <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#ffb77d_1px,transparent_1px)] [background-size:24px_24px]" />
          </div>

          <div className="max-w-7xl mx-auto px-space-base sm:px-space-lg relative z-10 flex flex-col items-center text-center">


            {/* Main Display Headline */}
            <h1 className="font-belgina text-3xl sm:text-5xl md:text-6xl lg:text-7xl text-on-surface max-w-4xl tracking-tight leading-[1.15] drop-shadow-[0_2px_14px_rgba(0,0,0,0.85)]">
              Negotiate contracts in{' '}
              <span className="relative inline-block underline decoration-primary-container decoration-4 underline-offset-8 text-primary
                hover:text-amber-300 hover:decoration-amber-400 transition-colors duration-300 cursor-default">
                minutes, not weeks
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mt-space-lg max-w-2xl font-body-lg text-base md:text-lg text-on-surface-variant leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]
              bg-surface-container-lowest/50 backdrop-blur-sm p-3 rounded
              border border-outline-variant/20 hover:border-outline-variant/50
              hover:bg-surface-container-lowest/70
              transition-all duration-300 cursor-default">
              Autonomous multi-agent legal intelligence that analyzes counterparty redlines,
              synthesizes conformed fallback language, and safeguards enterprise leverage against
              48,000+ public SEC EDGAR precedents — fully explainable and audit-proof.
            </p>

            {/* Dual Action Buttons */}
            <div className="mt-space-xl flex flex-col sm:flex-row items-center gap-space-md">
              <Button
                variant="primary"
                size="lg"
                icon="arrow_forward"
                iconPosition="right"
                onClick={() => navigate('/login')}
                className="w-full sm:w-auto shadow-2xl"
              >
                Access Command Dashboard
              </Button>
              <Button
                variant="secondary"
                size="lg"
                icon="play_circle"
                onClick={() => {
                  const el = document.getElementById('features');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto bg-white hover:bg-slate-100 text-[#1C1917] font-bold shadow-xl border border-white/80"
              >
                See How It Works
              </Button>
            </div>
          </div>
        </section>

        {/* 3. KEY METRICS STRIP - UPLIFTED OVERLAY CARD */}
        <section className="relative z-20 -mt-14 sm:-mt-18 max-w-6xl mx-auto px-space-base sm:px-space-lg w-full mb-space-2xl">
          <div className="bg-surface-container-low/95 backdrop-blur-md rounded-xl border border-outline-variant/40 shadow-[0_20px_50px_rgba(0,0,0,0.7)] p-space-lg sm:p-space-xl grid grid-cols-2 md:grid-cols-4 gap-space-lg text-center">

            <div className="group/metric flex flex-col items-center cursor-default p-3 rounded-lg hover:bg-primary-container/10 transition-all duration-300">
              <span className="font-headline-xl text-3xl sm:text-4xl text-primary font-semibold group-hover/metric:text-amber-300 group-hover/metric:drop-shadow-[0_0_12px_rgba(217,119,6,0.5)] transition-all duration-300">
                48,000+
              </span>
              <span className="font-label-sm text-outline uppercase tracking-wider mt-1 group-hover/metric:text-on-surface-variant transition-colors duration-300">
                SEC EDGAR Precedents Indexed
              </span>
            </div>

            <div className="group/metric flex flex-col items-center cursor-default p-3 rounded-lg hover:bg-secondary-container/10 transition-all duration-300">
              <span className="font-headline-xl text-3xl sm:text-4xl text-secondary font-semibold group-hover/metric:drop-shadow-[0_0_12px_rgba(132,204,22,0.4)] transition-all duration-300">
                78%
              </span>
              <span className="font-label-sm text-outline uppercase tracking-wider mt-1 group-hover/metric:text-on-surface-variant transition-colors duration-300">
                Cycle Duration Reduction
              </span>
            </div>

            <div className="group/metric flex flex-col items-center cursor-default p-3 rounded-lg hover:bg-surface-container-high/40 transition-all duration-300">
              <span className="font-headline-xl text-3xl sm:text-4xl text-on-surface font-semibold group-hover/metric:text-white group-hover/metric:drop-shadow-[0_0_10px_rgba(233,225,221,0.35)] transition-all duration-300">
                $1.4B+
              </span>
              <span className="font-label-sm text-outline uppercase tracking-wider mt-1 group-hover/metric:text-on-surface-variant transition-colors duration-300">
                Contract Volume Guarded
              </span>
            </div>

            <div className="group/metric flex flex-col items-center cursor-default p-3 rounded-lg hover:bg-primary-container/10 transition-all duration-300">
              <span className="font-headline-xl text-3xl sm:text-4xl text-primary font-semibold group-hover/metric:text-amber-300 group-hover/metric:drop-shadow-[0_0_12px_rgba(217,119,6,0.5)] transition-all duration-300">
                0%
              </span>
              <span className="font-label-sm text-outline uppercase tracking-wider mt-1 group-hover/metric:text-on-surface-variant transition-colors duration-300">
                Unvetted Liability Drift
              </span>
            </div>

          </div>
        </section>

        {/* 5. MULTI-AGENT ARCHITECTURE */}
        <section id="features" className="w-full py-space-3xl max-w-7xl mx-auto px-space-base sm:px-space-lg">
          <div className="text-center max-w-3xl mx-auto mb-space-2xl">
            <span className="font-mono text-label-sm uppercase tracking-widest text-primary font-semibold">
              Quad-Agent Autonomous Deliberation
            </span>
            <h2 className="font-headline-xl text-3xl sm:text-4xl text-on-surface mt-2">
              Engineered for General Counsel Discretion
            </h2>
            <p className="font-body-lg text-on-surface-variant mt-2">
              Four specialized AI agents deliberate across your playbook boundaries, game-theoretic
              concession curves, and SEC public exhibits before producing an attestation-ready dossier.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md">

            {/* Agent 1 */}
            <div className="group/card relative bg-surface-container-low p-space-md rounded border border-outline-variant/30 space-y-space-sm
              hover:border-primary/50 hover:bg-surface-container
              hover:shadow-[0_0_30px_rgba(217,119,6,0.12)] hover:-translate-y-1
              transition-all duration-300 overflow-hidden cursor-default flex flex-col justify-between">
              <span className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded bg-primary-container/20 flex items-center justify-center text-primary
                    group-hover/card:bg-primary-container/40 group-hover/card:scale-110 transition-all duration-300">
                    <span className="material-symbols-outlined text-xl group-hover/card:text-amber-300 transition-colors duration-300">document_scanner</span>
                  </div>
                  <span className="font-mono text-[9px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded font-bold">
                    Replaces: $350/hr Associate
                  </span>
                </div>
                <div>
                  <div className="font-mono text-[10px] text-primary uppercase font-bold tracking-widest">Agent 01 · Lex-Ingestor A</div>
                  <h3 className="font-headline-md text-lg text-on-surface font-semibold group-hover/card:text-white transition-colors duration-200">
                    Buyer Legal Analyst
                  </h3>
                </div>
                <p className="font-body-md text-xs text-on-surface-variant group-hover/card:text-on-surface transition-colors duration-200 leading-relaxed">
                  Deconstructs Party A baseline contract down to 42+ semantic nodes. Isolates strict playbook parameters and flags unhedged risk exposure.
                </p>
              </div>
              <div className="pt-space-xs font-mono text-[10px] text-outline border-t border-outline-variant/20
                group-hover/card:text-primary/70 group-hover/card:border-primary/20 transition-all duration-200">
                Party A Parser · AST Tree Decomposition
              </div>
            </div>

            {/* Agent 2 */}
            <div className="group/card relative bg-surface-container-low p-space-md rounded border border-outline-variant/30 space-y-space-sm
              hover:border-secondary/50 hover:bg-surface-container
              hover:shadow-[0_0_30px_rgba(132,204,22,0.08)] hover:-translate-y-1
              transition-all duration-300 overflow-hidden cursor-default flex flex-col justify-between">
              <span className="absolute inset-0 bg-gradient-to-br from-secondary/5 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded bg-secondary-container/30 flex items-center justify-center text-secondary
                    group-hover/card:bg-secondary-container/50 group-hover/card:scale-110 transition-all duration-300">
                    <span className="material-symbols-outlined text-xl transition-colors duration-300">edit_document</span>
                  </div>
                  <span className="font-mono text-[9px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded font-bold">
                    Replaces: 5-Day Markup Turn
                  </span>
                </div>
                <div>
                  <div className="font-mono text-[10px] text-secondary uppercase font-bold tracking-widest">Agent 02 · Lex-Ingestor B</div>
                  <h3 className="font-headline-md text-lg text-on-surface font-semibold group-hover/card:text-white transition-colors duration-200">
                    Seller Redline Auditor
                  </h3>
                </div>
                <p className="font-body-md text-xs text-on-surface-variant group-hover/card:text-on-surface transition-colors duration-200 leading-relaxed">
                  Dissects counterparty inbound redlines. Discovers disguised breach insertions, unhedged indemnities, and aggressive payment schedule deviations.
                </p>
              </div>
              <div className="pt-space-xs font-mono text-[10px] text-outline border-t border-outline-variant/20
                group-hover/card:text-secondary/70 group-hover/card:border-secondary/20 transition-all duration-200">
                Party B Forensics · Conflict Quantification
              </div>
            </div>

            {/* Agent 3 */}
            <div className="group/card relative bg-surface-container-low p-space-md rounded border border-outline-variant/30 space-y-space-sm
              hover:border-primary/50 hover:bg-surface-container
              hover:shadow-[0_0_30px_rgba(217,119,6,0.12)] hover:-translate-y-1
              transition-all duration-300 overflow-hidden cursor-default flex flex-col justify-between">
              <span className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded bg-surface-container-high flex items-center justify-center text-primary
                    group-hover/card:bg-primary-container/40 group-hover/card:scale-110 transition-all duration-300">
                    <span className="material-symbols-outlined text-xl group-hover/card:text-amber-300 transition-colors duration-300">balance</span>
                  </div>
                  <span className="font-mono text-[9px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded font-bold">
                    Replaces: $1,200/hr Arbitrator
                  </span>
                </div>
                <div>
                  <div className="font-mono text-[10px] text-primary uppercase font-bold tracking-widest">Agent 03 · Arbiter-3</div>
                  <h3 className="font-headline-md text-lg text-on-surface font-semibold group-hover/card:text-white transition-colors duration-200">
                    AI Judge & Deal Mediator
                  </h3>
                </div>
                <p className="font-body-md text-xs text-on-surface-variant group-hover/card:text-on-surface transition-colors duration-200 leading-relaxed">
                  Dual-lens verdict engine. Issues rulings balancing statutory legal precedent against commercial ARR relationship retention via Nash equilibrium.
                </p>
              </div>
              <div className="pt-space-xs font-mono text-[10px] text-outline border-t border-outline-variant/20
                group-hover/card:text-primary/70 group-hover/card:border-primary/20 transition-all duration-200">
                Dual Verdict Engine · Nash Equilibrium
              </div>
            </div>

            {/* Agent 4 */}
            <div className="group/card relative bg-surface-container-low p-space-md rounded border border-outline-variant/30 space-y-space-sm
              hover:border-secondary/50 hover:bg-surface-container
              hover:shadow-[0_0_30px_rgba(132,204,22,0.08)] hover:-translate-y-1
              transition-all duration-300 overflow-hidden cursor-default flex flex-col justify-between">
              <span className="absolute inset-0 bg-gradient-to-br from-secondary/5 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded bg-secondary-container/30 flex items-center justify-center text-secondary
                    group-hover/card:bg-secondary-container/50 group-hover/card:scale-110 transition-all duration-300">
                    <span className="material-symbols-outlined text-xl transition-colors duration-300">assignment_turned_in</span>
                  </div>
                  <span className="font-mono text-[9px] text-secondary bg-secondary-container/20 px-1.5 py-0.5 rounded font-bold">
                    Replaces: 3-Day Legal Ops
                  </span>
                </div>
                <div>
                  <div className="font-mono text-[10px] text-secondary uppercase font-bold tracking-widest">Agent 04 · Scrivener-4</div>
                  <h3 className="font-headline-md text-lg text-on-surface font-semibold group-hover/card:text-white transition-colors duration-200">
                    Executive Report Clerk
                  </h3>
                </div>
                <p className="font-body-md text-xs text-on-surface-variant group-hover/card:text-on-surface transition-colors duration-200 leading-relaxed">
                  Synthesizes agreed compromises into conformed contracts, calculates $28k+ counsel cost savings, seals SHA-256 Merkle proofs, and gates on human review.
                </p>
              </div>
              <div className="pt-space-xs font-mono text-[10px] text-outline border-t border-outline-variant/20
                group-hover/card:text-secondary/70 group-hover/card:border-secondary/20 transition-all duration-200">
                Executive Dossier · Human-in-the-Loop Gate
              </div>
            </div>

          </div>
        </section>

        {/* 6. PRECEDENTS & RISK COMPARISON */}
        <section id="precedents" className="w-full bg-surface-container-low py-space-3xl border-t border-outline-variant/30">
          <div className="max-w-7xl mx-auto px-space-base sm:px-space-lg">
            <div className="text-center max-w-3xl mx-auto mb-space-2xl">
              <span className="font-mono text-label-sm uppercase tracking-widest text-primary font-semibold">
                Rigorous Comparative Analysis
              </span>
              <h2 className="font-headline-xl text-3xl sm:text-4xl text-on-surface mt-2">
                Why Enterprise Legal Rejects Generic LLM Wrappers
              </h2>
            </div>

            <div className="overflow-x-auto border border-outline-variant/40 rounded bg-surface-container-lowest hover:border-outline-variant/60 transition-colors duration-300">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant/30 bg-surface-container text-label-sm text-outline uppercase font-mono">
                    <th className="py-4 px-6">Capability Matrix</th>
                    <th className="py-4 px-6">Traditional Outside Counsel</th>
                    <th className="py-4 px-6">Generic LLM Prompts</th>
                    <th className="py-4 px-6 text-primary font-bold">Negotia AI Autonomous Platform</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20 text-body-sm">
                  {[
                    { cap: 'Turnaround Latency', col: '5–14 Business Days ($$$$)', llm: 'Seconds (Hallucination Prone)', neg: '3–5 Minutes (Verified Precedent)' },
                    { cap: 'Precedent Grounding', col: 'Individual partner memory', llm: 'Generic public internet text', neg: '48,000+ SEC EDGAR 10-K Filings' },
                    { cap: 'Concession Game Theory', col: 'Manual subjective negotiation', llm: 'Zero trade-off reasoning', neg: 'Stochastic Nash Equilibrium' },
                    { cap: 'Audit & Provenance', col: 'Subjective billing memos', llm: 'No audit trail', neg: 'SHA-256 Cryptosealed Dossier' },
                  ].map(({ cap, col, llm, neg }) => (
                    <tr key={cap} className="group/row hover:bg-surface-container/60 transition-colors duration-200">
                      <td className="py-4 px-6 font-semibold text-on-surface group-hover/row:text-white transition-colors duration-200">{cap}</td>
                      <td className="py-4 px-6 text-outline group-hover/row:text-on-surface-variant transition-colors duration-200">{col}</td>
                      <td className="py-4 px-6 text-error">{llm}</td>
                      <td className="py-4 px-6 text-secondary font-semibold group-hover/row:text-amber-300 group-hover/row:drop-shadow-[0_0_8px_rgba(217,119,6,0.4)] transition-all duration-200">{neg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* 7. ENTERPRISE CTA & FOOTER WRAPPER */}
      <div className="relative w-full bg-surface-container-lowest border-t border-outline-variant/30 overflow-hidden group/footer">
          {/* Giant Background Typography Watermark — scales on footer section hover */}
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pointer-events-none select-none overflow-hidden z-0">
            <span
              className="font-belgina text-[14vw] sm:text-[17vw] leading-[0.78] tracking-wider whitespace-nowrap block bg-gradient-to-t from-[#e9e1dd]/30 via-[#e9e1dd]/[0.12] to-transparent bg-clip-text text-transparent
                group-hover/footer:from-[#e9e1dd]/42 group-hover/footer:scale-105
                transition-all duration-700 ease-out origin-bottom"
              style={{
                WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0) 100%)',
                maskImage: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 45%, rgba(0,0,0,0) 100%)',
              }}
            >
              Negotia AI
            </span>
          </div>

          {/* CTA Section */}
          <section className="relative z-10 w-full pt-space-3xl pb-space-2xl text-center">
            <div className="max-w-4xl mx-auto px-space-base sm:px-space-lg space-y-space-lg">
              <WaxSealLogo size={48} pulse={true} className="mx-auto" />
              <h2 className="font-belgina text-3xl sm:text-5xl md:text-6xl text-on-surface tracking-tight leading-[1.15]">
                Ready to Sovereignly Accelerate Legal Ops?
              </h2>
              <p className="font-body-lg text-on-surface-variant max-w-2xl mx-auto">
                Schedule an executive simulation walkthrough with our AI jurisprudence engineering
                team or test your enterprise playbook directly.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-space-md pt-space-sm">
                <Button
                  variant="primary"
                  size="lg"
                  icon="rocket_launch"
                  onClick={() => navigate('/login')}
                >
                  Launch Live Platform
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  icon="contact_mail"
                  onClick={() => navigate('/intake')}
                >
                  Ingest First Contract
                </Button>
              </div>
            </div>
          </section>

          {/* Footer Bar with subtle hairline divider */}
          <footer className="relative z-10 w-full border-t border-outline-variant/20 py-space-lg text-outline text-label-sm font-mono">
            <div className="max-w-7xl mx-auto px-space-base sm:px-space-lg flex flex-col md:flex-row items-center justify-between gap-space-md">
              <div className="flex items-center gap-2 group/footerlogo">
                <div className="flex items-baseline gap-1">
                  <span className="text-on-surface font-wapilor text-lg tracking-wider group-hover/footerlogo:text-white transition-colors duration-200">NEGOTIA</span>
                  <span className="font-bevas text-lg tracking-widest bg-gradient-to-r from-primary via-amber-300 to-amber-500 bg-clip-text text-transparent group-hover/footerlogo:drop-shadow-[0_0_10px_rgba(217,119,6,0.5)] transition-all duration-200">AI</span>
                </div>
                <span>•</span>
                <span className="group-hover/footerlogo:text-on-surface-variant transition-colors duration-200">Enterprise Autonomous Legal Intelligence</span>
              </div>
              <div className="hover:text-on-surface-variant transition-colors duration-200 cursor-default">Delaware Chancery Compliant · SOC-2 Type II Cryptographically Certified</div>
              <div className="hover:text-on-surface-variant transition-colors duration-200 cursor-default">© 2025 Negotia AI Systems Inc. All Rights Reserved.</div>
            </div>
          </footer>
        </div>
    </div>
  );
};
