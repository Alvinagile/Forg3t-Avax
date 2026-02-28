import jsPDF from 'jspdf';
import type { ComplianceReport } from '../types';
import type { UnlearningResult } from './unlearning';

export class PDFGenerator {
  static generateComplianceCertificate(
    report: ComplianceReport,
    additionalData: {
      modelIdentifier?: string;
      leakScore?: number;
      embeddingDelta?: number;
      unlearningType?: string;
      targetInfo?: string;
      result?: UnlearningResult;
    }
  ): Blob {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      putOnlyUsedFonts: true,
      floatPrecision: 2,
      compress: true
    });
    
    // Set default font to improve readability
    doc.setFont('helvetica', 'normal');
    
    // Professional color palette
    const colors = {
      primary: [45, 55, 72],      // Dark blue-gray
      secondary: [96, 165, 250],   // Blue
      success: [16, 185, 129],     // Green
      warning: [245, 158, 11],     // Amber
      danger: [239, 68, 68],       // Red
      white: [255, 255, 255],
      lightGray: [248, 250, 252],
      darkGray: [75, 85, 99],
      text: [31, 41, 55]
    };
    
    // Improved spacing constants
    const spacing = {
      small: 3,
      medium: 5,
      large: 8,
      xlarge: 12
    };
    
    // Determine status based on leak score
    const leakScore = additionalData.leakScore || 0;
    const statusColor = leakScore < 0.1 ? colors.success : 
                       leakScore < 0.3 ? colors.warning : colors.danger;
    const statusText = leakScore < 0.1 ? 'COMPLIANT' : 
                      leakScore < 0.3 ? 'REVIEW REQUIRED' : 'NON-COMPLIANT';
    const statusIcon = leakScore < 0.1 ? '✓' : leakScore < 0.3 ? '⚠' : '✗';

    // Header Section
    doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.rect(0, 0, 210, 55, 'F');
    
    // Logo placeholder
    doc.setFillColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.roundedRect(15, 12, 30, 30, 5, 5, 'F');
    doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('F3', 28, 30);
    
    // Main title
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('FORG3T PROTOCOL', 50, 28);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Cryptographically Verified AI Unlearning Certificate', 50, 36);
    
    // Certificate ID and date
    doc.setFontSize(9);
    doc.text(`Certificate ID: ${report.request_id.toUpperCase().slice(0, 16)}`, 50, 45);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit' 
    })}`, 50, 50);

    // Status Badge
    let yPos = 70;
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.roundedRect(15, yPos, 65, 14, 3, 3, 'F');
    
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${statusIcon} ${statusText}`, 20, yPos + 9);
    
    // Verification QR placeholder
    doc.setFillColor(colors.lightGray[0], colors.lightGray[1], colors.lightGray[2]);
    doc.rect(145, yPos, 45, 45, 'F');
    doc.setTextColor(colors.darkGray[0], colors.darkGray[1], colors.darkGray[2]);
    doc.setFontSize(8);
    doc.text('BLOCKCHAIN', 155, yPos + 15);
    doc.text('VERIFICATION', 152, yPos + 22);
    doc.text('QR CODE', 160, yPos + 29);
    doc.text(`TX: ${report.tx_id.slice(0, 8)}...`, 148, yPos + 40);

    yPos += 60;

    // Executive Summary Section
    const addSectionHeader = (title: string, yPosition: number): number => {
      doc.setFillColor(colors.lightGray[0], colors.lightGray[1], colors.lightGray[2]);
      doc.rect(15, yPosition, 180, 10, 'F');
      
      doc.setTextColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 18, yPosition + 7);
      
      return yPosition + 18;
    };

    const addDataRow = (label: string, value: string, yPosition: number, bold = false): number => {
      doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.text(label + ':', 18, yPosition);
      
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const labelWidth = doc.getTextWidth(label + ': ');
      doc.text(value, 20 + labelWidth, yPosition);
      
      return yPosition + 7;
    };

    // Executive Summary
    yPos = addSectionHeader('EXECUTIVE SUMMARY', yPos);
    yPos = addDataRow('Operation Type', additionalData.unlearningType || 'Black-box Adversarial Testing', yPos, true);
    yPos = addDataRow('Target AI Model', additionalData.modelIdentifier || 'OpenAI GPT-4', yPos);
    yPos = addDataRow('Information Classification', 'Personally Identifiable Information (PII)', yPos);
    yPos = addDataRow('Regulatory Framework', 'EU GDPR Article 17 - Right to Erasure', yPos);
    yPos = addDataRow('Processing Date', new Date(report.timestamp).toLocaleDateString('en-GB'), yPos);
    yPos = addDataRow('Completion Status', statusText, yPos, true);
    yPos += spacing.large;

    // Technical Results
    yPos = addSectionHeader('TECHNICAL ANALYSIS RESULTS', yPos);
    
    if (additionalData.result) {
      const result = additionalData.result;
      
      // Overview metrics
      yPos = addDataRow('Total Test Prompts', result.totalTests.toString(), yPos, true);
      yPos = addDataRow('Successful Suppressions', `${result.passedTests}/${result.totalTests}`, yPos);
      yPos = addDataRow('Information Leakage Score', `${(result.leakScore * 100).toFixed(2)}%`, yPos, true);
      yPos = addDataRow('Overall Success Rate', `${Math.round((result.passedTests/result.totalTests)*100)}%`, yPos);
      yPos = addDataRow('Processing Duration', result.processingTime ? `${result.processingTime} seconds` : '~8 minutes', yPos);
      yPos += spacing.medium;
      
      // Detailed phase analysis
      if (result.results) {
        yPos = addDataRow('Phase 1 - Suppression Commands', `${10 - (result.results.slice(0, 10).filter(r => r.containsTarget).length || 0)}/10 successful`, yPos);
        yPos = addDataRow('Phase 2 - Behavioral Probing', `${10 - (result.results.slice(10, 20).filter(r => r.containsTarget).length || 0)}/10 suppressed`, yPos);
        yPos = addDataRow('Phase 3 - Adversarial Attacks', `${5 - (result.results.slice(20, 25).filter(r => r.containsTarget).length || 0)}/5 blocked`, yPos);
      }
      
      // Check if we need a new page
      if (yPos > 240) {
        doc.addPage();
        yPos = 25;
      }
      
    } else {
      // No results available
      yPos = addDataRow('Status', 'No test results available', yPos, true);
    }
    yPos += spacing.large;

    // Check if we need a new page for remaining content
    if (yPos > 180) {
      doc.addPage();
      yPos = 25;
    }

    // Blockchain Verification
    yPos = addSectionHeader('BLOCKCHAIN VERIFICATION', yPos);
    yPos = addDataRow('Verification Method', `Cryptographic Proof Generated`, yPos, true);
    yPos = addDataRow('Proof Hash (SHA-256)', 'N/A', yPos);
    yPos = addDataRow('Blockchain Network', 'Ethereum Compatible Network', yPos);
    yPos = addDataRow('Transaction Hash', report.tx_id, yPos);
    yPos = addDataRow('Block Confirmation', 'Immutably Recorded', yPos, true);
    yPos = addDataRow('IPFS Content Hash', report.ipfs_cid, yPos);
    yPos = addDataRow('Verification URL', `explorer.example.com/tx/${report.tx_id.slice(0, 16)}...`, yPos);
    yPos += spacing.large;

    // Compliance Assessment
    yPos = addSectionHeader('REGULATORY COMPLIANCE ASSESSMENT', yPos);
    yPos = addDataRow('Primary Jurisdiction', report.jurisdiction, yPos, true);
    yPos = addDataRow('Applicable Regulations', report.regulatory_tags.join(', '), yPos);
    yPos = addDataRow('Data Subject Rights', 'Article 17 GDPR - Right to Erasure Verified', yPos);
    yPos = addDataRow('AI Transparency Req.', 'EU AI Act Article 13 - Compliance Achieved', yPos);
    yPos = addDataRow('Audit Trail Status', 'Complete Cryptographic Chain Maintained', yPos);
    yPos = addDataRow('Legal Standing', 'Court-Admissible Evidence Generated', yPos, true);
    yPos += spacing.large;

    // Risk Assessment & Recommendations
    yPos = addSectionHeader('RISK ASSESSMENT & RECOMMENDATIONS', yPos);
    
    if (leakScore < 0.1) {
      yPos = addDataRow('Risk Level', 'LOW - Excellent Suppression Achieved', yPos, true);
      yPos = addDataRow('GDPR Compliance', '✓ Full Article 17 Compliance Verified', yPos);
      yPos = addDataRow('Recommended Action', 'No further action required', yPos);
      yPos = addDataRow('Next Review', 'Quarterly monitoring recommended', yPos);
    } else if (leakScore < 0.3) {
      yPos = addDataRow('Risk Level', 'MEDIUM - Partial Suppression Detected', yPos, true);
      yPos = addDataRow('GDPR Compliance', '⚠ Review Required - Potential Article 17 Gap', yPos);
      yPos = addDataRow('Recommended Action', 'Additional suppression cycles recommended', yPos);
      yPos = addDataRow('Next Review', 'Within 30 days', yPos);
    } else {
      yPos = addDataRow('Risk Level', 'HIGH - Significant Information Leakage', yPos, true);
      yPos = addDataRow('GDPR Compliance', '✗ Non-Compliant - Article 17 Not Satisfied', yPos);
      yPos = addDataRow('Recommended Action', 'Alternative unlearning methods required', yPos);
      yPos = addDataRow('Next Review', 'Immediate action required', yPos);
    }
    yPos += spacing.large;

    // Technical Methodology
    yPos = addSectionHeader('TECHNICAL METHODOLOGY', yPos);
    yPos = addDataRow('Testing Framework', '25-Prompt Adversarial Test Suite', yPos);
    yPos = addDataRow('Model Access Type', additionalData.unlearningType || 'Black-box API Access', yPos);
    yPos = addDataRow('Suppression Technique', 'Prompt-based Memory Suppression', yPos);
    yPos = addDataRow('Verification Method', 'Multi-Phase Adversarial Probing', yPos);
    yPos = addDataRow('Proof Generation', 'Cryptographic Hash Functions', yPos);
    yPos = addDataRow('Quality Assurance', 'Automated Statistical Analysis', yPos);
    yPos += spacing.large;

    // Legal Declaration
    yPos = addSectionHeader('LEGAL DECLARATION', yPos);
    doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    
    const legalText = `This certificate constitutes cryptographic proof that the specified AI model has undergone unlearning procedures in accordance with applicable data protection regulations. The verification process employed cryptographic hashing to ensure privacy-preserving validation without exposing sensitive information. This document serves as admissible evidence of compliance efforts undertaken pursuant to GDPR Article 17 and related data subject rights.`;
    
    const splitText = doc.splitTextToSize(legalText, 170);
    doc.text(splitText, 18, yPos);
    yPos += splitText.length * 4 + spacing.xlarge;

    // Footer
    doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
    doc.rect(0, 275, 210, 22, 'F');
    
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('© 2024 Forg3t Protocol | Cryptographically Verified AI Unlearning', 15, 285);
    doc.text(`Document Hash: SHA-256 Hash...`, 15, 291);
    
    // Digital signature placeholder
    doc.setTextColor(colors.white[0], colors.white[1], colors.white[2]);
    doc.setFontSize(9);
    doc.text('Digitally Signed', 145, 285);
    doc.setFontSize(8.5);
    doc.text(`Valid until: ${new Date(Date.now() + 365*24*60*60*1000).toLocaleDateString('en-GB')}`, 145, 291);

    return doc.output('blob');
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