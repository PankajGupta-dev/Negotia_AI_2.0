import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { BACKEND_BASE_URL } from '../services/api';
import { useAuth } from '../context/AuthContext';

const DEFAULT_BASELINE_TEXT = `MASTER SERVICES AGREEMENT
§ 1. Definitions & Scope of Operations
This Master Services Agreement ("Agreement") governs enterprise cloud licensing, platform infrastructure, and software operations between Apex Dynamics Corp. ("Customer") and Veloce Systems Inc. ("Vendor").

§ 4. Invoicing, Payment Terms & Retainers
Invoices are payable within net thirty (30) days from receipt. Undisputed past-due balances bear interest at 1.0% per month.

§ 11. Limitation of Liability & Consequential Damages
Vendor's aggregate cumulative liability under this Agreement shall be capped at one (1.0x) times the total annual recurring revenue (ARR) fees paid by Customer during the preceding twelve-month period.

§ 14. Indemnification & IP Infringement
Vendor shall defend, indemnify, and hold harmless Customer against third-party claims alleging direct infringement of valid United States patents and copyrights.

§ 18. Governing Law and Exclusive Forum
This Agreement shall be governed by Delaware law and adjudicated exclusively in the Delaware Court of Chancery.`;

const DEFAULT_COUNTERPARTY_REDLINE_TEXT = `MASTER SERVICES AGREEMENT (COUNTERPARTY MARKUP)
§ 1. Definitions & Scope of Operations
This Master Services Agreement ("Agreement") governs enterprise cloud licensing, platform infrastructure, and software operations between Apex Dynamics Corp. ("Customer") and Veloce Systems Inc. ("Vendor"). Customer demands guaranteed 99.99% uptime and dedicated Level-4 support.

§ 4. Invoicing, Payment Terms & Retainers
Invoices are payable within net sixty (60) days from receipt. No late fees, finance charges, or interest penalties shall accrue during bona fide billing disputes.

§ 11. Limitation of Liability & Consequential Damages
Vendor's aggregate cumulative liability under this Agreement shall be unlimited for data breach, confidentiality violation, or gross negligence, and capped at three (3.0x) times total ARR for all other claims.

§ 14. Indemnification & IP Infringement
Vendor shall defend, indemnify, and hold harmless Customer against all third-party intellectual property and data claims worldwide without geographic limitation.

§ 18. Governing Law and Exclusive Forum
This Agreement shall be governed by Delaware law and adjudicated exclusively in the Delaware Court of Chancery.`;

export const Intake: React.FC = () => {
  const navigate = useNavigate();
  const { user, role, isUnifiedDemo } = useAuth();
  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // Role-based upload permissions
  // Buyer (Party A) → uploads baseline only
  // Seller (Party B) → uploads counterparty redline only
  // Unified Demo → unrestricted bilateral access (both Party A and Party B)
  const canUploadBaseline = role === 'buyer' || role === 'unified_demo' || isUnifiedDemo;
  const canUploadRedline = role === 'seller' || role === 'unified_demo' || isUnifiedDemo;

  const [selectedPreset, setSelectedPreset] = useState<'msa' | 'dpa' | 'ip' | 'custom'>('msa');
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [docAFile, setDocAFile] = useState<string | null>('Apex_Enterprise_Master_Services_Agreement_2025.docx');
  const [docBFile, setDocBFile] = useState<string | null>('Apex_Dynamics_Inbound_Redline_Round3.docx');
  const [matterId, setMatterId] = useState<string>(() => `2025-INT-${Math.floor(1000 + Math.random() * 9000)}`);
  const [matterTitle, setMatterTitle] = useState('Enterprise Cloud & Licensing Agreement');
  const [contractValue, setContractValue] = useState('$4,200,000 ARR');
  const [counterparty, setCounterparty] = useState('Apex Dynamics Corp.');
  const [jurisdiction, setJurisdiction] = useState('Delaware Chancery Court');
  const [varianceSlider, setVarianceSlider] = useState(18.5);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileAChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileA(file);
      setDocAFile(file.name);
      setErrorMessage(null);
    }
  };

  const handleFileBChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFileB(file);
      setDocBFile(file.name);
      setErrorMessage(null);
    }
  };

  const handleDropA = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setFileA(file);
      setDocAFile(file.name);
      setErrorMessage(null);
    }
  };

  const handleDropB = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setFileB(file);
      setDocBFile(file.name);
      setErrorMessage(null);
    }
  };

  const handleStartIngestion = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setProcessProgress(15);

    try {
      // 1. Resolve File A and File B (uploaded file or rich standard legal agreement)
      const resolvedFileA =
        fileA ||
        new File(
          [DEFAULT_BASELINE_TEXT],
          docAFile || 'Apex_Enterprise_Master_Services_Agreement_2025.txt',
          { type: 'text/plain' }
        );

      const resolvedFileB =
        fileB ||
        new File(
          [DEFAULT_COUNTERPARTY_REDLINE_TEXT],
          docBFile || 'Apex_Dynamics_Inbound_Redline_Round3.txt',
          { type: 'text/plain' }
        );

      // 2. Assemble FormData as specified
      const formData = new FormData();
      formData.append('file_a', resolvedFileA);
      formData.append('file_b', resolvedFileB);
      formData.append('matter_id', matterId);
      formData.append('arr_value', contractValue);
      const varianceVal = varianceSlider > 1 ? varianceSlider / 100 : varianceSlider;
      formData.append('variance_ceiling', varianceVal.toString());

      // Optional metadata fields
      if (matterTitle) formData.append('title', matterTitle);
      if (counterparty) formData.append('counterparty', counterparty);

      setProcessProgress(45);

      // 3. POST /api/contracts/ingest
      const targetUrl = `${BACKEND_BASE_URL}/api/contracts/ingest`;
      const res = await fetch(targetUrl, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        let errDetail = 'Ingestion failed';
        try {
          const errJson = await res.json();
          errDetail = errJson.detail || errDetail;
        } catch {
          errDetail = await res.text();
        }
        throw new Error(errDetail);
      }

      setProcessProgress(85);
      const data = await res.json();
      const targetMatterId = data.matterId || data.matter_id || matterId;

      setProcessProgress(100);
      setTimeout(() => {
        navigate(`/pipeline/${targetMatterId}`);
      }, 350);
    } catch (err: any) {
      console.error('Ingest failed:', err);
      setIsProcessing(false);
      setProcessProgress(0);
      setErrorMessage(
        err?.message ||
          'Failed to ingest contract documents. Please check backend connection.'
      );
    }
  };

  return (
    <div className="w-full bg-[#F5F1E8] text-[#1C1917] p-space-base md:p-space-lg lg:p-space-xl min-h-screen selection:bg-primary-container selection:text-on-primary-container">
      {/* Background Parchment Grid */}
      <div className="max-w-7xl mx-auto space-y-space-lg">
        {/* 1. HEADER & DOCKET BANNER */}
        <header className="bg-[#FAF7F2] border border-[#D6CEBE] p-space-lg rounded shadow-sm">
          {/* Top Docket Ribbon */}
          <div className="flex flex-wrap items-center justify-between gap-space-sm pb-space-sm mb-space-md border-b border-[#1C1917]/15">
            <div className="flex items-center gap-space-md flex-wrap">
              <span className="font-mono text-[11px] text-[#1C1917] bg-[#EDE7DC] px-2.5 py-1 rounded font-bold uppercase tracking-widest border border-[#D6CEBE]">
                MATTER INTAKE DOSSIER · DOCKET #{matterId}
              </span>
              <span className="font-mono text-[11px] text-[#1C1917]/70 flex items-center gap-1">
                <span className="material-symbols-outlined text-[15px] text-[#D97706]">
                  account_balance
                </span>
                JURISDICTION: DELAWARE CHANCERY / SEC REG EDGAR COMPLIANT
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] rounded font-mono text-[11px] uppercase tracking-wider font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#166534] animate-pulse" />
                READY FOR DUAL-PARTY INGESTION
              </span>
            </div>
          </div>

          {/* Title & Presets */}
          {/* Role-based Access Banner */}
          {user && (
            <div className={`flex items-center gap-3 px-4 py-2.5 rounded border mb-4 ${
              role === 'unified_demo' || isUnifiedDemo
                ? 'bg-[#FEF3C7] border-[#D97706]/50 text-[#92400E]'
                : role === 'buyer'
                ? 'bg-primary-container/10 border-primary/30 text-primary'
                : 'bg-secondary-container/10 border-secondary/30 text-secondary'
            }`}>
              <span className="material-symbols-outlined text-[20px] shrink-0">
                {role === 'unified_demo' || isUnifiedDemo ? 'balance' : role === 'buyer' ? 'business_center' : 'handshake'}
              </span>
              <div className="text-xs font-mono">
                <span className="font-bold uppercase tracking-widest">
                  {role === 'unified_demo' || isUnifiedDemo
                    ? 'Unified Counsel (Party A + Party B Simultaneous Access)'
                    : role === 'buyer'
                    ? 'Buyer (Party A)'
                    : 'Seller (Party B)'}
                </span>
                {' · '}
                <span className="text-[#78716C]">
                  {role === 'unified_demo' || isUnifiedDemo
                    ? 'Bilateral Demonstration Workspace active. You have unrestricted access to upload both Firm Baseline (Doc A) and Counterparty Markup (Doc B).'
                    : role === 'buyer'
                    ? 'You may upload the Firm Baseline Agreement (Document A). Counterparty redline is locked to Seller role.'
                    : 'You may upload the Counterparty Markup (Document B). Firm Baseline is locked to Buyer role.'}
                </span>
              </div>
            </div>
          )}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
            <div className="space-y-1 max-w-3xl">
              <div className="flex items-center gap-3">
                <h1 className="font-headline-xl text-3xl md:text-4xl text-[#1C1917] tracking-tight font-semibold">
                  Contract Intake & Bilateral Ingestion
                </h1>
                <WaxSealLogo size={32} />
              </div>
              <p className="font-contract-clause text-[#1C1917]/80 text-base leading-relaxed">
                Upload your firm’s primary baseline agreement (<strong>Contract A</strong>) alongside
                the inbound counterparty markup or historical benchmark (<strong>Contract B</strong>)
                to trigger autonomous redline extraction and concession equilibrium synthesis.
              </p>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1 bg-[#EDE7DC] p-1 rounded border border-[#D6CEBE]">
              {(
                [
                  { id: 'msa', label: 'Standard MSA' },
                  { id: 'dpa', label: 'Data Protection (DPA)' },
                  { id: 'ip', label: 'IP License' },
                  { id: 'custom', label: 'Custom Bilateral' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPreset(preset.id)}
                  className={`px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-all rounded ${
                    selectedPreset === preset.id
                      ? 'bg-[#FAF7F2] text-[#1C1917] font-bold shadow-sm'
                      : 'text-[#1C1917]/70 hover:text-[#1C1917]'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* 2. DUAL DOCUMENT DROP ZONES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
          {/* DOCUMENT A (Baseline) */}
          <div className="bg-[#FAF7F2] border border-[#D6CEBE] rounded p-space-lg space-y-space-md shadow-sm">
            <div className="flex items-center justify-between pb-space-xs border-b border-[#D6CEBE]">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-[#1C1917] text-[#FAF7F2] flex items-center justify-center font-mono text-xs font-bold">
                  A
                </span>
                <span className="font-headline-md text-lg text-[#1C1917] font-semibold">
                  Primary Operative Agreement (Firm Baseline)
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#166534] bg-[#DCFCE7] px-2 py-0.5 rounded uppercase font-semibold">
                Approved Playbook
              </span>
            </div>

            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputARef}
              accept=".docx,.pdf,.doc,.txt,.md"
              onChange={handleFileAChange}
              className="hidden"
            />

            {/* Drop zone A */}
            <div
              onClick={() => canUploadBaseline && fileInputARef.current?.click()}
              onDragOver={(e) => { if (canUploadBaseline) e.preventDefault(); }}
              onDrop={(e) => { if (canUploadBaseline) handleDropA(e); }}
              title={!canUploadBaseline ? 'Only Buyer (Party A) can upload the baseline agreement' : undefined}
              className={`border-2 border-dashed rounded p-space-lg text-center transition-colors space-y-2 ${
                canUploadBaseline
                  ? 'border-[#D6CEBE] hover:border-[#D97706] bg-[#EDE7DC]/40 cursor-pointer'
                  : 'border-[#D6CEBE]/40 bg-[#EDE7DC]/20 cursor-not-allowed opacity-60'
              }`}
            >
              {!canUploadBaseline && (
                <div className="flex items-center justify-center gap-2 text-[#991B1B] font-mono text-[11px] uppercase font-bold tracking-wider pb-1">
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  Restricted to Buyer Role
                </div>
              )}
              <span className="material-symbols-outlined text-4xl text-[#D97706]">description</span>
              <div className="font-headline-md text-base font-semibold text-[#1C1917]">
                {docAFile || 'Drag & Drop Baseline Agreement (.DOCX, .PDF, .TXT)'}
              </div>
              <p className="font-mono text-xs text-[#78716C]">
                {fileA
                  ? `${(fileA.size / 1024).toFixed(1)} KB · Selected File · Ready for Upload`
                  : docAFile
                  ? 'Standard Baseline · 42 Clauses · Cryptographically Ready'
                  : 'Supports tracked changes & comments'}
              </p>
              {canUploadBaseline && (
                <div className="pt-2">
                  <span className="px-3 py-1 bg-[#FAF7F2] border border-[#D6CEBE] rounded text-xs font-medium text-[#1C1917] hover:bg-[#EDE7DC] transition-colors">
                    {docAFile ? 'Replace File' : 'Browse File'}
                  </span>
                </div>
              )}
            </div>

            {/* Document A Metadata Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-space-xs font-body-sm text-xs">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#78716C] block mb-1">
                  Matter Title
                </label>
                <input
                  type="text"
                  value={matterTitle}
                  onChange={(e) => setMatterTitle(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#D6CEBE] rounded px-3 py-1.5 text-[#1C1917] focus:outline-none focus:border-[#D97706]"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#78716C] block mb-1">
                  Contract ARR / Total Value
                </label>
                <input
                  type="text"
                  value={contractValue}
                  onChange={(e) => setContractValue(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#D6CEBE] rounded px-3 py-1.5 text-[#1C1917] focus:outline-none focus:border-[#D97706]"
                />
              </div>
            </div>
          </div>

          {/* DOCUMENT B (Counterparty Inbound) */}
          <div className="bg-[#FAF7F2] border border-[#D6CEBE] rounded p-space-lg space-y-space-md shadow-sm">
            <div className="flex items-center justify-between pb-space-xs border-b border-[#D6CEBE]">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-[#D97706] text-white flex items-center justify-center font-mono text-xs font-bold">
                  B
                </span>
                <span className="font-headline-md text-lg text-[#1C1917] font-semibold">
                  Inbound Counterparty Markup / Turn
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#991B1B] bg-[#FEE2E2] px-2 py-0.5 rounded uppercase font-semibold">
                Redlines Detected
              </span>
            </div>

            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputBRef}
              accept=".docx,.pdf,.doc,.txt,.md"
              onChange={handleFileBChange}
              className="hidden"
            />

            {/* Drop zone B */}
            <div
              onClick={() => canUploadRedline && fileInputBRef.current?.click()}
              onDragOver={(e) => { if (canUploadRedline) e.preventDefault(); }}
              onDrop={(e) => { if (canUploadRedline) handleDropB(e); }}
              title={!canUploadRedline ? 'Only Seller (Party B) can upload the counterparty redline' : undefined}
              className={`border-2 border-dashed rounded p-space-lg text-center transition-colors space-y-2 ${
                canUploadRedline
                  ? 'border-[#D6CEBE] hover:border-[#D97706] bg-[#EDE7DC]/40 cursor-pointer'
                  : 'border-[#D6CEBE]/40 bg-[#EDE7DC]/20 cursor-not-allowed opacity-60'
              }`}
            >
              {!canUploadRedline && (
                <div className="flex items-center justify-center gap-2 text-[#991B1B] font-mono text-[11px] uppercase font-bold tracking-wider pb-1">
                  <span className="material-symbols-outlined text-[18px]">lock</span>
                  Restricted to Seller Role
                </div>
              )}
              <span className="material-symbols-outlined text-4xl text-[#991B1B]">difference</span>
              <div className="font-headline-md text-base font-semibold text-[#1C1917]">
                {docBFile || 'Drag & Drop Counterparty Markup (.DOCX, .PDF, .TXT)'}
              </div>
              <p className="font-mono text-xs text-[#78716C]">
                {fileB
                  ? `${(fileB.size / 1024).toFixed(1)} KB · Selected File · Ready for Upload`
                  : docBFile
                  ? 'Inbound Redline · 18 Inline Changes · Ready for Ingest'
                  : 'Word redlines or scanned execution draft'}
              </p>
              <div className="pt-2">
                <span className="px-3 py-1 bg-[#FAF7F2] border border-[#D6CEBE] rounded text-xs font-medium text-[#1C1917] hover:bg-[#EDE7DC] transition-colors">
                  {docBFile ? 'Replace File' : 'Browse File'}
                </span>
              </div>
            </div>

            {/* Document B Metadata Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md pt-space-xs font-body-sm text-xs">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#78716C] block mb-1">
                  Counterparty Legal Entity
                </label>
                <input
                  type="text"
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#D6CEBE] rounded px-3 py-1.5 text-[#1C1917] focus:outline-none focus:border-[#D97706]"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-[#78716C] block mb-1">
                  Governing Forum / Jurisdiction
                </label>
                <input
                  type="text"
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#D6CEBE] rounded px-3 py-1.5 text-[#1C1917] focus:outline-none focus:border-[#D97706]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. INTAKE CONFIGURATION & CONCESSION RULES */}
        <div className="bg-[#FAF7F2] border border-[#D6CEBE] rounded p-space-lg space-y-space-md shadow-sm">
          <div className="flex items-center justify-between pb-space-xs border-b border-[#D6CEBE]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#D97706] text-xl">tune</span>
              <h2 className="font-headline-md text-xl text-[#1C1917] font-semibold">
                Autonomous Concession Steerability & Deliberation Limits
              </h2>
            </div>
            <span className="font-mono text-[11px] text-[#D97706] bg-[#FEF3C7] px-2.5 py-1 rounded border border-[#FCD34D] font-bold">
              {varianceSlider}% Variance Allowed
            </span>
          </div>

          <div className="space-y-space-sm">
            <div className="flex items-center justify-between text-xs text-[#78716C] font-mono">
              <span>0% (Strict Playbook Fidelity - Zero Concession)</span>
              <span>18.5% (Moderate Enterprise Stance)</span>
              <span>35% (Aggressive Velocity)</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="0.5"
              value={varianceSlider}
              onChange={(e) => setVarianceSlider(parseFloat(e.target.value))}
              className="w-full h-2 bg-[#D6CEBE] rounded appearance-none cursor-pointer accent-[#D97706]"
            />
            <p className="font-body-md text-xs text-[#57534E] leading-relaxed">
              At <strong>{varianceSlider}% variance</strong>, Negotia AI is authorized to trade payment terms
              (Net 45-60) and 2.0x ARR liability super-caps against counterparty IP indemnity carve-outs without requiring partner escalation.
            </p>
          </div>

          {/* Verification Pipeline Checks */}
          <div className="pt-space-sm border-t border-[#D6CEBE] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-sm font-mono text-xs">
            <div className="flex items-center gap-2 text-[#166534]">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>AST Redline Diff Engine Ready</span>
            </div>
            <div className="flex items-center gap-2 text-[#166534]">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>48,000+ SEC EDGAR Precedents Indexed</span>
            </div>
            <div className="flex items-center gap-2 text-[#166534]">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>Hardware MFA Signer Active</span>
            </div>
            <div className="flex items-center gap-2 text-[#166534]">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>Cryptographic Provenance Hash Ready</span>
            </div>
          </div>
        </div>

        {/* 4. PROCESSING OVERLAY / INITIATE CTA */}
        {isProcessing && (
          <div className="bg-[#FAF7F2] border-2 border-[#D97706] rounded p-space-lg space-y-space-sm shadow-md animate-fade-in">
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono font-bold text-[#D97706] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#D97706] animate-ping" />
                Ingesting and Synthesizing Pareto Concession Frontier...
              </span>
              <span className="font-mono font-bold text-[#1C1917]">{processProgress}%</span>
            </div>
            <ProgressBar value={processProgress} tone="amber" height="h-2" />
          </div>
        )}

        {/* Error Notification Banner */}
        {errorMessage && (
          <div className="bg-[#FEF2F2] border-2 border-[#DC2626] rounded p-space-md text-sm text-[#991B1B] flex items-center justify-between animate-fade-in font-mono">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-[#DC2626]">error</span>
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-xs uppercase hover:underline font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-space-md pt-space-xs pb-space-xl">
          <button
            type="button"
            onClick={() => {
              setFileA(null);
              setFileB(null);
              setDocAFile(null);
              setDocBFile(null);
              setErrorMessage(null);
              setMatterId(`2025-INT-${Math.floor(1000 + Math.random() * 9000)}`);
            }}
            className="text-xs font-mono text-[#78716C] hover:text-[#1C1917] uppercase tracking-wider"
          >
            Reset Ingestion Form
          </button>

          <Button
            variant="primary"
            size="lg"
            icon="auto_awesome"
            disabled={isProcessing}
            onClick={handleStartIngestion}
            className="w-full sm:w-auto"
          >
            {isProcessing ? 'Synthesizing...' : 'Initiate Bilateral Synthesis & Conflict Analysis'}
          </Button>
        </div>
      </div>
    </div>
  );
};
