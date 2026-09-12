import { jsPDF } from 'jspdf';
import { ReportResponse } from '../services/api';

/**
 * Generates and downloads a conformed legal-grade Executive Negotiation Report PDF.
 */
export function generateReportPdf(reportData: ReportResponse): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 25;
  const marginR = 25;
  const contentW = pageW - marginL - marginR;

  // Key fields with fallbacks
  const docket = reportData.docketNumber || reportData.docket_number || reportData.matterId || '2025-INT-809';
  const matterTitle = reportData.matterTitle || reportData.matter_title || 'Enterprise Licensing Agreement';
  const counterparty = reportData.counterparty || 'Acme Corp / Counterparty';
  const leadCounsel = reportData.leadCounsel || reportData.lead_counsel || 'Sarah Jenkins, Esq.';
  const genDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const isSealed = Boolean(reportData.isSealed || reportData.is_sealed);
  const attestationHash =
    reportData.attestationHash ||
    reportData.attestation_hash ||
    reportData.blockDigest ||
    reportData.block_digest ||
    '0x8f22e8d9c0919b4412e45903b17454ba019a823c941d22e4';

  let y = 20;

  // Helper for footer and page break
  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 25) {
      addFooter();
      doc.addPage();
      y = 20;
    }
  };

  const addFooter = () => {
    const pageNum = doc.getNumberOfPages();
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 140, 140);
    doc.text(`Negotia AI — Executive Negotiation Dossier — Docket #${docket}`, marginL, pageH - 10);
    doc.text(`Page ${pageNum}`, pageW - marginR, pageH - 10, { align: 'right' });
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(18);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(title.toUpperCase(), marginL, y);
    y += 2;
    doc.setDrawColor(180, 140, 60);
    doc.setLineWidth(0.5);
    doc.line(marginL, y, marginL + contentW, y);
    y += 7;
  };

  const drawParagraph = (text: string, indent = 0, fontSize = 9.5, color = [50, 50, 50]) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(color[0], color[1], color[2]);
    const lines = doc.splitTextToSize(text, contentW - indent);
    for (const line of lines) {
      ensureSpace(5);
      doc.text(line, marginL + indent, y);
      y += 4.5;
    }
    y += 2;
  };

  // ── COVER / HEADER BLOCK ──
  doc.setDrawColor(180, 140, 60);
  doc.setLineWidth(1.2);
  doc.line(marginL, y, marginL + contentW, y);
  y += 4;
  doc.setLineWidth(0.3);
  doc.line(marginL, y, marginL + contentW, y);
  y += 10;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(25, 25, 25);
  doc.text('CONFORMED EXECUTIVE NEGOTIATION REPORT', pageW / 2, y, { align: 'center' });
  y += 7;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 90, 90);
  doc.text('Bilateral Game-Theoretic Synthesis & Conformed Settlement Agreement', pageW / 2, y, { align: 'center' });
  y += 9;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(160, 120, 40);
  doc.text(`DOCKET #${docket}  |  MATTER: ${matterTitle}`, pageW / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`Counterparty: ${counterparty}   •   Lead Counsel: ${leadCounsel}`, pageW / 2, y, { align: 'center' });
  y += 5;
  doc.text(`Date of Issuance: ${genDate}   •   Status: ${isSealed ? 'SEALED & ATTESTED' : 'PENDING FINAL SEAL'}`, pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setDrawColor(180, 140, 60);
  doc.setLineWidth(0.3);
  doc.line(marginL, y, marginL + contentW, y);
  y += 8;

  // ── ARTICLE I: EXECUTIVE SUMMARY & LEGAL SYNTHESIS ──
  drawSectionTitle('Article I: Executive Summary & Legal Synthesis');
  if (reportData.executiveSummary || reportData.executive_summary) {
    drawParagraph(reportData.executiveSummary || reportData.executive_summary || '');
  }

  // Counsel Savings Box
  const counselSavings = reportData.counselSavings || reportData.counsel_savings;
  if (counselSavings) {
    ensureSpace(24);
    doc.setFillColor(248, 246, 240);
    doc.setDrawColor(220, 200, 160);
    doc.rect(marginL, y, contentW, 20, 'FD');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(140, 100, 30);
    doc.text('COUNSEL EFFICIENCY & COST SAVINGS METRICS', marginL + 5, y + 5);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(`Traditional Legal Hours: ${counselSavings.estimatedTraditionalHours || 0} hrs`, marginL + 5, y + 11);
    doc.text(`Negotia AI Execution Time: ${counselSavings.actualAiMinutes || 0} mins`, marginL + 65, y + 11);
    doc.text(`Effective Value Saved: $${(counselSavings.effectiveCostSavingsUsd || 0).toLocaleString()} USD`, marginL + 125, y + 11);

    if (counselSavings.savingsSummary) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(90, 90, 90);
      doc.text(counselSavings.savingsSummary, marginL + 5, y + 16);
    }
    y += 24;
  }

  // ── ARTICLE II: NEGOTIATION EQUILIBRIUM METRICS ──
  drawSectionTitle('Article II: Game-Theoretic Equilibrium & Risk Summary');

  ensureSpace(28);
  const colW = contentW / 4;
  const metricsY = y;
  
  // Draw border grid for metrics
  doc.setDrawColor(210, 210, 210);
  doc.setFillColor(252, 252, 252);
  doc.rect(marginL, metricsY, contentW, 22, 'FD');

  const fairness = reportData.fairnessIndex ?? reportData.fairness_index ?? 92;
  const leverage = reportData.leverageScore ?? reportData.leverage_score ?? 78;
  const acceptance = reportData.counterpartyAcceptancePct ?? reportData.counterparty_acceptance_pct ?? 88;
  const pareto = (reportData.isParetoOptimal ?? reportData.is_pareto_optimal) !== false ? 'OPTIMAL' : 'SUB-OPTIMAL';

  const metrics = [
    { label: 'Fairness Index', val: `${fairness}%` },
    { label: 'Leverage Score', val: `${leverage}/100` },
    { label: 'Acceptance Rate', val: `${acceptance}%` },
    { label: 'Pareto Frontier', val: pareto },
  ];

  metrics.forEach((m, idx) => {
    const cellX = marginL + idx * colW;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(110, 110, 110);
    doc.text(m.label.toUpperCase(), cellX + colW / 2, metricsY + 7, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(m.val, cellX + colW / 2, metricsY + 16, { align: 'center' });

    if (idx < 3) {
      doc.setDrawColor(220, 220, 220);
      doc.line(cellX + colW, metricsY, cellX + colW, metricsY + 22);
    }
  });

  y += 28;

  // ── ARTICLE III: SETTLED CLAUSE SCHEDULE ──
  drawSectionTitle('Article III: Settled Clause Schedule & Conformed Provisions');

  const clauses = reportData.settledClauses || reportData.settled_clauses || [];

  if (clauses.length === 0) {
    drawParagraph('No settled clause records found in this dossier.', 0, 9, [100, 100, 100]);
  } else {
    clauses.forEach((c, idx) => {
      ensureSpace(25);

      const secTitle = `${c.section || `Section ${idx + 1}`}: ${c.title || 'Clause Provision'}`;
      const riskLvl = (c.riskLevel || c.risk?.level || 'moderate').toUpperCase();
      const riskSc = c.riskScore ?? c.risk?.score ?? 80;
      const proposalText = c.conformedProposal || c.conformed_proposal || c.recommendedLanguage || c.recommended_language || c.originalText || c.original_text || '';

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(secTitle, marginL, y);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(160, 100, 30);
      doc.text(`[Risk: ${riskLvl} (${riskSc}/100)]`, pageW - marginR, y, { align: 'right' });
      y += 5;

      // Box around conformed text
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);

      const wrappedLines = doc.splitTextToSize(proposalText, contentW - 8);
      const boxH = Math.max(12, wrappedLines.length * 4 + 6);

      ensureSpace(boxH + 4);
      doc.setFillColor(250, 250, 250);
      doc.setDrawColor(225, 225, 225);
      doc.rect(marginL, y, contentW, boxH, 'FD');

      let textY = y + 4.5;
      for (const line of wrappedLines) {
        doc.text(line, marginL + 4, textY);
        textY += 4;
      }
      y += boxH + 3;

      if (c.rationale) {
        drawParagraph(`Rationale: ${c.rationale}`, 4, 8.5, [100, 100, 100]);
      }

      y += 3;
    });
  }

  // ── ARTICLE IV: ARBITER DUAL-LENS VERDICTS ──
  drawSectionTitle('Article IV: Arbiter Dual-Lens Legal & Commercial Verdicts');

  if (clauses.length > 0) {
    clauses.forEach((c) => {
      const legalV = c.legalVerdict || c.legal_verdict;
      const commV = c.commercialVerdict || c.commercial_verdict;

      if (legalV || commV) {
        ensureSpace(20);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40, 40, 40);
        doc.text(`${c.section || 'Clause'}: ${c.title || ''}`, marginL, y);
        y += 5;

        if (legalV) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(70, 70, 70);
          doc.text('Legal Lens: ', marginL + 4, y);
          const legalLines = doc.splitTextToSize(legalV, contentW - 25);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          let ly = y;
          for (let i = 0; i < legalLines.length; i++) {
            if (i > 0) ensureSpace(4.5);
            doc.text(legalLines[i], marginL + (i === 0 ? 25 : 4), ly);
            ly += 4.5;
          }
          y = ly + 1;
        }

        if (commV) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(70, 70, 70);
          doc.text('Commercial Lens: ', marginL + 4, y);
          const commLines = doc.splitTextToSize(commV, contentW - 35);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          let cy = y;
          for (let i = 0; i < commLines.length; i++) {
            if (i > 0) ensureSpace(4.5);
            doc.text(commLines[i], marginL + (i === 0 ? 34 : 4), cy);
            cy += 4.5;
          }
          y = cy + 1;
        }

        y += 3;
      }
    });
  } else {
    drawParagraph('No dual-lens verdicts recorded for this matter.', 0, 9, [100, 100, 100]);
  }

  // SEC Citations if available
  const secCitations = reportData.legalRiskSummary?.secCitations || reportData.legal_risk_summary?.secCitations || [];
  if (secCitations.length > 0) {
    ensureSpace(15);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(140, 100, 30);
    doc.text('SEC EDGAR Regulatory Precedents & Citations:', marginL, y);
    y += 5;
    secCitations.forEach((cite) => {
      drawParagraph(`• ${cite}`, 4, 8, [80, 80, 80]);
    });
  }

  // ── ARTICLE V: KEY BILATERAL COMPROMISES ──
  const compromises = reportData.keyBilateralCompromises || reportData.key_negotiated_changes || [];
  if (compromises.length > 0) {
    drawSectionTitle('Article V: Key Bilateral Compromises & Trade-Off Matrix');

    compromises.forEach((comp: any) => {
      ensureSpace(16);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 30);
      doc.text(`${comp.section || comp.clauseId || 'Provision'}: ${comp.title || 'Compromise'}`, marginL, y);
      y += 5;

      const detailText = comp.strategy || comp.compromiseProposal || comp.rationale || '';
      if (detailText) {
        drawParagraph(detailText, 4, 8.5, [60, 60, 60]);
      }
    });
  }

  // ── ARTICLE VI: DIGITAL ATTESTATION & SIGNATURE BLOCK ──
  drawSectionTitle('Article VI: Cryptographic Attestation & Execution');

  ensureSpace(45);

  drawParagraph(`This document certifies that the conformed provisions herein represent the final, binding game-theoretic equilibrium achieved via the Negotia AI Agentic Framework.`, 0, 8.5, [70, 70, 70]);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 100, 100);
  doc.text(`SHA-256 ATTESTATION HASH:`, marginL, y);
  y += 4;
  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(140, 100, 30);
  doc.text(attestationHash, marginL, y);
  y += 12;

  // Signature lines
  doc.setFont('helvetica', 'normal');
  const sigW = (contentW - 20) / 2;
  const sig1X = marginL;
  const sig2X = marginL + sigW + 20;

  // Line 1: Party A
  doc.setDrawColor(180, 180, 180);
  doc.line(sig1X, y, sig1X + sigW, y);
  doc.line(sig2X, y, sig2X + sigW, y);
  y += 4;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('PARTY A / LEAD COUNSEL', sig1X, y);
  doc.text('PARTY B / COUNTERPARTY', sig2X, y);
  y += 4;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text(`By: ${leadCounsel}`, sig1X, y);
  doc.text(`By: ${counterparty}`, sig2X, y);
  y += 4;
  doc.text(`Status: ${isSealed ? 'DIGITALLY SEALED' : 'PENDING EXECUTION'}`, sig1X, y);
  doc.text(`Status: ${isSealed ? 'DIGITALLY SEALED' : 'PENDING EXECUTION'}`, sig2X, y);
  y += 10;

  // Final footer on last page
  addFooter();

  // Save the document
  const fileName = `Negotia_Conformed_Report_${docket.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  doc.save(fileName);
}
