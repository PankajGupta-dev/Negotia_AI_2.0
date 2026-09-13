import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { WaxSealLogo } from '../components/WaxSealLogo';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { BACKEND_BASE_URL } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useIntake } from '../context/IntakeContext';

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
  const { role, isUnifiedDemo } = useAuth();
  const {
    fileA,
    fileB,
    docAFile,
    docBFile,
    matterId,
    contractValue,
    varianceSlider,
    setFileA,
    setFileB,
    setDocAFile,
    setDocBFile,
    setIsUploaded,
    resetIntake,
  } = useIntake();

  const fileInputARef = useRef<HTMLInputElement>(null);
  const fileInputBRef = useRef<HTMLInputElement>(null);

  // Role-based upload permissions
  const canUploadBaseline = role === 'buyer' || role === 'unified_demo' || isUnifiedDemo;
  const canUploadRedline = role === 'seller' || role === 'unified_demo' || isUnifiedDemo;

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
      setIsUploaded(true);
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
    <div className="w-full min-h-screen bg-[#F5F1E8] text-[#1C1917] p-4 md:p-6 lg:p-8 flex items-center justify-center">
      <div className="w-full max-w-4xl space-y-6">
        {/* 1. ELEGANT COMPACT HEADER */}
        <header className="bg-[#FAF7F2] border border-[#D6CEBE] p-5 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <WaxSealLogo size={32} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono uppercase text-[10px] tracking-wider text-[#78716C]">
                <span className="w-2 h-2 rounded-full bg-[#D97706] animate-pulse" />
                <span>Bilateral Document Intake</span>
                <span>•</span>
                <span>{matterId}</span>
              </div>
              <h1 className="font-headline-xl text-xl md:text-2xl text-[#1C1917] tracking-tight font-bold truncate">
                {docAFile
                  ? docAFile.replace(/\.[^/.]+$/, '')
                  : 'Contract Intake & Conflict Analysis'}
              </h1>
            </div>
          </div>
          <span className="font-mono text-[10px] bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] px-2.5 py-1 rounded font-bold uppercase shrink-0 self-start sm:self-auto">
            Dual Ingestion Mode
          </span>
        </header>

        {/* 2. COMPACT DUAL DOCUMENT DROP ZONES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* DOCUMENT A (Baseline) */}
          <div className="bg-[#FAF7F2] border border-[#D6CEBE] rounded-xl p-5 space-y-3 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2 border-b border-[#D6CEBE]">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#1C1917] text-[#FAF7F2] flex items-center justify-center font-mono text-[10px] font-bold">
                  A
                </span>
                <span className="font-semibold text-sm text-[#1C1917]">
                  Primary Baseline (Party A)
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#166534] bg-[#DCFCE7] px-2 py-0.5 rounded font-semibold uppercase">
                Baseline Draft
              </span>
            </div>

            <input
              type="file"
              ref={fileInputARef}
              accept=".docx,.pdf,.doc,.txt,.md"
              onChange={handleFileAChange}
              className="hidden"
            />

            <div
              onClick={() => canUploadBaseline && fileInputARef.current?.click()}
              onDragOver={(e) => { if (canUploadBaseline) e.preventDefault(); }}
              onDrop={(e) => { if (canUploadBaseline) handleDropA(e); }}
              title={!canUploadBaseline ? 'Only Buyer (Party A) can upload the baseline agreement' : undefined}
              className={`border-2 border-dashed rounded-lg p-5 text-center transition-all space-y-2.5 ${
                canUploadBaseline
                  ? 'border-[#D6CEBE] hover:border-[#D97706] bg-[#EDE7DC]/30 hover:bg-[#EDE7DC]/60 cursor-pointer'
                  : 'border-[#D6CEBE]/40 bg-[#EDE7DC]/20 cursor-not-allowed opacity-60'
              }`}
            >
              {!canUploadBaseline && (
                <div className="flex items-center justify-center gap-1.5 text-[#991B1B] font-mono text-[10px] uppercase font-bold tracking-wider">
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  Restricted to Buyer Role
                </div>
              )}
              <span className="material-symbols-outlined text-3xl text-[#D97706]">description</span>
              <div>
                <div className="font-semibold text-sm text-[#1C1917] truncate">
                  {docAFile || 'Upload Party A Baseline'}
                </div>
                <p className="font-mono text-[11px] text-[#78716C] mt-1">
                  {fileA
                    ? `${(fileA.size / 1024).toFixed(1)} KB · Ready`
                    : docAFile
                    ? `Uploaded: ${docAFile}`
                    : 'Click or drag (.PDF, .DOCX, .TXT)'}
                </p>
              </div>
              {canUploadBaseline && (
                <div className="pt-1">
                  <span className="inline-block px-3 py-1 bg-[#FAF7F2] border border-[#D6CEBE] rounded text-xs font-medium text-[#1C1917] hover:bg-[#EDE7DC] transition-colors shadow-2xs">
                    {docAFile ? 'Replace File' : 'Select File'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* DOCUMENT B (Counterparty Markup) */}
          <div className="bg-[#FAF7F2] border border-[#D6CEBE] rounded-xl p-5 space-y-3 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2 border-b border-[#D6CEBE]">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-[#D97706] text-white flex items-center justify-center font-mono text-[10px] font-bold">
                  B
                </span>
                <span className="font-semibold text-sm text-[#1C1917]">
                  Counterparty Markup (Party B)
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded font-semibold uppercase">
                Redline Turn
              </span>
            </div>

            <input
              type="file"
              ref={fileInputBRef}
              accept=".docx,.pdf,.doc,.txt,.md"
              onChange={handleFileBChange}
              className="hidden"
            />

            <div
              onClick={() => canUploadRedline && fileInputBRef.current?.click()}
              onDragOver={(e) => { if (canUploadRedline) e.preventDefault(); }}
              onDrop={(e) => { if (canUploadRedline) handleDropB(e); }}
              title={!canUploadRedline ? 'Only Seller (Party B) can upload the counterparty redline' : undefined}
              className={`border-2 border-dashed rounded-lg p-5 text-center transition-all space-y-2.5 ${
                canUploadRedline
                  ? 'border-[#D6CEBE] hover:border-[#D97706] bg-[#EDE7DC]/30 hover:bg-[#EDE7DC]/60 cursor-pointer'
                  : 'border-[#D6CEBE]/40 bg-[#EDE7DC]/20 cursor-not-allowed opacity-60'
              }`}
            >
              {!canUploadRedline && (
                <div className="flex items-center justify-center gap-1.5 text-[#991B1B] font-mono text-[10px] uppercase font-bold tracking-wider">
                  <span className="material-symbols-outlined text-[16px]">lock</span>
                  Restricted to Seller Role
                </div>
              )}
              <span className="material-symbols-outlined text-3xl text-[#991B1B]">difference</span>
              <div>
                <div className="font-semibold text-sm text-[#1C1917] truncate">
                  {docBFile || 'Upload Party B Markup'}
                </div>
                <p className="font-mono text-[11px] text-[#78716C] mt-1">
                  {fileB
                    ? `${(fileB.size / 1024).toFixed(1)} KB · Ready`
                    : docBFile
                    ? `Uploaded: ${docBFile}`
                    : 'Click or drag (.PDF, .DOCX, .TXT)'}
                </p>
              </div>
              {canUploadRedline && (
                <div className="pt-1">
                  <span className="inline-block px-3 py-1 bg-[#FAF7F2] border border-[#D6CEBE] rounded text-xs font-medium text-[#1C1917] hover:bg-[#EDE7DC] transition-colors shadow-2xs">
                    {docBFile ? 'Replace File' : 'Select File'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. PROCESSING PROGRESS OVERLAY */}
        {isProcessing && (
          <div className="bg-[#FAF7F2] border-2 border-[#D97706] rounded-xl p-5 space-y-2 shadow-md animate-fade-in">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-bold text-[#D97706] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#D97706] animate-ping" />
                Ingesting and Synthesizing Pareto Concession Frontier...
              </span>
              <span className="font-bold text-[#1C1917]">{processProgress}%</span>
            </div>
            <ProgressBar value={processProgress} tone="amber" height="h-2" />
          </div>
        )}

        {/* ERROR BANNER */}
        {errorMessage && (
          <div className="bg-[#FEF2F2] border-2 border-[#DC2626] rounded-xl p-4 text-xs text-[#991B1B] flex items-center justify-between animate-fade-in font-mono">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-[#DC2626]">error</span>
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="uppercase hover:underline font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 4. PROMINENT CENTERED INITIATE CTA BLOCK */}
        <div className="bg-[#FAF7F2] border border-[#D6CEBE] rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
          <div className="flex flex-col items-center space-y-1">
            <span className="font-mono text-[11px] text-[#78716C] uppercase tracking-widest font-semibold">
              Ready for Multi-Agent Resolution
            </span>
            <p className="text-xs text-[#57534E] max-w-md">
              Generates bilateral redline AST diffs, calculates concession tradeoffs, and opens the live negotiation telemetry pipeline.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 w-full sm:w-auto">
            <Button
              variant="primary"
              size="lg"
              disabled={isProcessing}
              onClick={handleStartIngestion}
              className="w-full sm:w-auto px-8 py-3.5 text-sm font-bold shadow-md hover:shadow-lg transition-all"
            >
              {isProcessing ? 'Synthesizing Pipeline...' : 'Initiate Bilateral Synthesis & Conflict Analysis'}
            </Button>

            <button
              type="button"
              onClick={() => {
                resetIntake();
                setErrorMessage(null);
              }}
              className="text-[11px] font-mono text-[#78716C] hover:text-[#1C1917] uppercase tracking-wider transition-colors"
            >
              Reset Ingestion Form
            </button>
          </div>
        </div>

        {/* 5. FOOTER TELEMETRY VERIFICATION BAR */}
        <div className="bg-[#FAF7F2]/80 border border-[#D6CEBE]/60 rounded-xl p-3.5 grid grid-cols-2 md:grid-cols-4 gap-3 text-center font-mono text-[11px] text-[#166534]">
          <div className="flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-[15px]">check_circle</span>
            <span>AST Redline Engine</span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-[15px]">check_circle</span>
            <span>48k+ Precedents</span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-[15px]">check_circle</span>
            <span>Hardware MFA Active</span>
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined text-[15px]">check_circle</span>
            <span>Cryptographic Provenance</span>
          </div>
        </div>
      </div>
    </div>
  );
};
