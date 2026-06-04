import jsPDF from 'jspdf';
import type { JobRecord, ReportRow } from '../types/domain';
import type { ComplianceReport } from '../types';

export class PDFGenerator {
  static generateEvidenceReport(summary: ReportRow, detail?: JobRecord): Blob {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      putOnlyUsedFonts: true,
      floatPrecision: 2,
      compress: true,
    });

    const colors = {
      ink: [17, 17, 17],
      muted: [75, 75, 75],
      border: [229, 231, 235],
      slate: [24, 32, 56],
      blue: [47, 128, 237],
      green: [5, 150, 105],
      bg: [248, 250, 252],
      white: [255, 255, 255],
    };

    const addSection = (title: string, y: number) => {
      doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
      doc.rect(14, y, 182, 10, 'F');
      doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(title, 18, y + 6.8);
      return y + 16;
    };

    const addRow = (label: string, value: string, y: number) => {
      doc.setTextColor(colors.muted[0], colors.muted[1], colors.muted[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`${label}:`, 18, y);
      doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2]);
      doc.setFont('helvetica', 'normal');
      const split = doc.splitTextToSize(value || 'N/A', 130);
      doc.text(split, 55, y);
      return y + Math.max(split.length * 4, 7);
    };

    doc.setFillColor(colors.slate[0], colors.slate[1], colors.slate[2]);
    doc.rect(0, 0, 210, 42, 'F');
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text('Forg3t Protocol', 16, 18);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Evidence report for unlearning, verification, and Avalanche anchoring', 16, 26);
    doc.setFontSize(8.5);
    doc.text(`Generated ${new Date(summary.exportGeneratedAt).toLocaleString()}`, 16, 33);
    doc.text(`Prepared by ${summary.exportGeneratedBy}`, 16, 37.5);

    doc.setFillColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.roundedRect(148, 10, 44, 22, 4, 4, 'F');
    doc.setTextColor(colors.blue[0], colors.blue[1], colors.blue[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(summary.anchorStatus === 'confirmed' ? 'ANCHOR CONFIRMED' : 'ANCHOR STATUS', 152, 19);
    doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(summary.anchorStatus.replaceAll('_', ' ').toUpperCase(), 152, 26);

    let y = 52;
    y = addSection('Summary', y);
    y = addRow('Project', summary.projectName, y);
    y = addRow('Job ID', summary.jobId, y);
    y = addRow('Evidence ID', summary.evidenceId ?? 'N/A', y);
    y = addRow('Validation Status', summary.validationStatus, y);
    y = addRow('Anchor Status', summary.anchorStatus, y);
    y = addRow('Timestamp', new Date(summary.timestamp).toLocaleString(), y);

    y += 4;
    y = addSection('Scope', y);
    y = addRow('Target Scope Summary', summary.targetScopeSummary ?? 'No target scope summary recorded', y);
    y = addRow('Execution Lane', detail?.execution_lane ?? 'N/A', y);
    y = addRow('Target Type', detail?.target_type ?? 'N/A', y);
    y = addRow('Validation Score', detail?.validation_score !== null && detail?.validation_score !== undefined ? String(detail.validation_score) : 'N/A', y);
    y = addRow('Processing Time', detail?.processing_time_seconds ? `${detail.processing_time_seconds} seconds` : 'N/A', y);

    if (y > 215) {
      doc.addPage();
      y = 20;
    }

    y += 4;
    y = addSection('Evidence Commitments', y);
    y = addRow('Evidence Hash', summary.evidenceHash ?? 'N/A', y);
    y = addRow('Transaction Hash', summary.transactionHash ?? 'N/A', y);
    y = addRow('Generated At', summary.exportGeneratedAt, y);
    y = addRow(
      'Commitment Scope',
      'Only non-sensitive commitments are referenced here. Raw customer data, prompts, targets, and model outputs are excluded from on-chain storage.',
      y,
    );

    if (detail?.error_message) {
      y += 4;
      y = addSection('Operational Notes', y);
      y = addRow('Error Detail', detail.error_message, y);
    }

    const manifestPreview = detail?.evidence_records
      ? (Array.isArray(detail.evidence_records) ? detail.evidence_records[0]?.manifest : detail.evidence_records.manifest)
      : null;
    if (manifestPreview) {
      if (y > 180) {
        doc.addPage();
        y = 20;
      }

      y += 4;
      y = addSection('Bundle Preview', y);
      const preview = JSON.stringify(manifestPreview, null, 2);
      const split = doc.splitTextToSize(preview, 170);
      doc.setTextColor(colors.ink[0], colors.ink[1], colors.ink[2]);
      doc.setFont('courier', 'normal');
      doc.setFontSize(7.5);
      doc.text(split.slice(0, 42), 18, y);
    }

    doc.setFillColor(colors.slate[0], colors.slate[1], colors.slate[2]);
    doc.rect(0, 278, 210, 19, 'F');
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('Forg3t Protocol evidence report', 16, 286);
    doc.text('This report documents workflow status and cryptographic commitments. It is not a legal guarantee.', 16, 291.5);

    return doc.output('blob');
  }

  static generateComplianceCertificate(
    report: ComplianceReport,
    additionalData: {
      modelIdentifier?: string;
      leakScore?: number;
      embeddingDelta?: number;
      unlearningType?: string;
      targetInfo?: string;
      result?: {
        totalTests?: number;
        passedTests?: number;
        failedTests?: number;
        leakScore?: number;
        processingTime?: number;
      };
    },
  ): Blob {
    return this.generateEvidenceReport(
      {
        projectName: 'Forg3t Workspace',
        jobId: report.request_id,
        evidenceId: report.request_id,
        targetScopeSummary: additionalData.targetInfo ?? 'Sanitized target scope summary',
        validationStatus: additionalData.result ? 'completed' : 'pending',
        anchorStatus: report.tx_id ? 'pending' : 'not_submitted',
        evidenceHash: null,
        transactionHash: report.tx_id || null,
        timestamp: report.timestamp,
        exportGeneratedBy: 'forg3t',
        exportGeneratedAt: report.timestamp,
      },
      {
        id: report.request_id,
        project_id: 'workspace',
        user_id: report.user_id,
        created_by: report.user_id,
        integration_id: null,
        pipeline_id: null,
        pipeline_run_id: null,
        request_reason: additionalData.targetInfo ?? 'Evidence export',
        status: 'completed',
        processing_time_seconds: additionalData.result?.processingTime ?? null,
        blockchain_tx_hash: report.tx_id || null,
        audit_trail: null,
        created_at: report.timestamp,
        updated_at: report.timestamp,
        target_type: additionalData.unlearningType ?? 'assistant',
        execution_lane: 'manual',
        validation_score: additionalData.leakScore ?? null,
        completed_at: report.timestamp,
        error_message: null,
        target_scope_summary: additionalData.targetInfo ?? null,
        evidence_status: 'ready',
        anchor_status: report.tx_id ? 'pending' : 'not_submitted',
        report_status: 'ready',
        verification_status: 'not_verified',
        metadata: {},
      },
    );
  }

  static downloadPDF(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
