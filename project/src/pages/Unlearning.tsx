import { useState, useRef, useEffect } from 'react';
import { Shield, Upload, Download, Play, X, CheckCircle, AlertCircle, FileText, Key, Database, Bot, Zap, Globe } from 'lucide-react';
import { AssistantsSuppressionEngine, AssistantSuppressionResult } from '../lib/assistantsUnlearning';
import { PDFGenerator } from '../lib/pdfGenerator';
import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../contexts/WalletContext';
import { supabase } from '../lib/supabase';
import type { ComplianceReport } from '../types';
import { DebugLogger } from '../lib/debug';
import { submitEvidence as anchorEvidence, verifyEvidence, computeArtifactHash, deriveJobId, snowtraceUrl, type EvidenceAnchor, type VerificationResult } from '../lib/avalancheAnchor';

interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error';
  message: string;
}

interface WhiteboxResults {
  success: boolean;
  originalAccuracy: number;
  newAccuracy: number;
  targetDataRemoved: number;
  processingTime: number;
  retrainRequired: boolean;
}

export function Unlearning() {
  const { user } = useAuth();
  const { isConnected } = useWallet();
  const [activeTab, setActiveTab] = useState<'blackbox' | 'whitebox'>('blackbox');

  // Black-box states
  const [apiKey, setApiKey] = useState('');
  const [blackboxLoading, setBlackboxLoading] = useState(false);
  const [blackboxProgress, setBlackboxProgress] = useState({ percent: 0, message: '' });

  // Assistant API states (integrated into black-box)
  const [assistantId, setAssistantId] = useState('');
  const [targetText, setTargetText] = useState('');
  const [reason, setReason] = useState('');
  const [assistantResults, setAssistantResults] = useState<AssistantSuppressionResult | null>(null);

  // White-box states
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [whiteboxResults, setWhiteboxResults] = useState<WhiteboxResults | null>(null);
  const [whiteboxLoading, setWhiteboxLoading] = useState(false);

  // Activity Log states
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Avalanche C-Chain anchoring
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [anchorResult, setAnchorResult] = useState<EvidenceAnchor | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [anchorError, setAnchorError] = useState('');
  const anchorBlobRef = useRef<Blob | null>(null);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Custom logger wrapper that adds to both console and UI
  const addLog = (level: 'log' | 'warn' | 'error', ...args: any[]) => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
    const message = args.map(arg =>
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');

    setLogs(prev => [...prev, { timestamp, level, message }]);

    // Also call original DebugLogger
    if (level === 'log') DebugLogger.log(message);
    else if (level === 'warn') DebugLogger.warn(message);
    else if (level === 'error') DebugLogger.error(message);
  };

  const handleBlackboxUnlearning = async () => {
    if (!apiKey.trim()) {
      alert('Please enter your OpenAI API key with full access permissions');
      return;
    }

    if (!assistantId.trim()) {
      alert('Please enter your Assistant ID');
      return;
    }

    if (!targetText.trim()) {
      alert('Please enter the target text to suppress');
      return;
    }

    setBlackboxLoading(true);
    setAssistantResults(null);
    setBlackboxProgress({ percent: 0, message: 'Starting...' });

    try {
      // Assistant API suppression
      const engine = new AssistantsSuppressionEngine(apiKey);

      const config = {
        apiKey: apiKey,
        assistantId: assistantId,
        targetPhrase: targetText,
        suppressionRules: []
      };

      const results = await engine.injectSuppression(
        config,
        (percent, message) => {
          setBlackboxProgress({ percent, message });
        }
      );

      setAssistantResults(results);
      setBlackboxProgress({ percent: 100, message: 'Suppression protocol completed! Download your cryptographic certificate below.' });

      // Save to database for dashboard
      if (results.success && user) {
        await saveAssistantSuppressionRequest(results);
        DebugLogger.log('Assistant suppression request saved to database');
      }
    } catch (error) {
      DebugLogger.error('Unlearning process failed', error);

      // Show user-friendly error message for API key issues
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('403') || errorMessage.includes('insufficient permissions')) {
        errorMessage = 'API Key Permission Error: Please create a new OpenAI API key with full access permissions at https://platform.openai.com/api-keys';
      }

      setAssistantResults({
        success: false,
        assistantId: assistantId,
        suppressionInjected: false,
        validationResults: {
          phase1Results: [],
          phase2Results: []
        },
        leakScore: 1.0,
        totalTests: 60,
        passedTests: 0,
        failedTests: 60,
        processingTime: 0,
        error: errorMessage
      });
    } finally {
      setBlackboxLoading(false);
    }
  };

  const cancelBlackboxUnlearning = () => {
    const engine = new AssistantsSuppressionEngine(apiKey);
    engine.cancelOperation();
    setBlackboxLoading(false);
    setBlackboxProgress({ percent: 0, message: 'Cancelled by user' });
  };


  const downloadPDF = async (currentAssistantResults: AssistantSuppressionResult) => {
    if (!currentAssistantResults || !user) return;

    try {
      DebugLogger.log('=== UNLEARNING PROCESS COMPLETED - GENERATING PDF ===');

      // Create proper compliance report format
      const report: ComplianceReport = {
        user_id: user.id,
        request_id: crypto.randomUUID(),
        operation_type: 'AI Unlearning - Assistant Suppression',
        timestamp: new Date().toISOString(),
        tx_id: '',
        ipfs_cid: '',
        jurisdiction: 'EU' as const,
        regulatory_tags: ['GDPR Article 17', 'Right to be Forgotten', 'AI Transparency']
      };

      const additionalData = {
        modelIdentifier: `OpenAI Assistant (${currentAssistantResults.assistantId})`,
        leakScore: currentAssistantResults.leakScore || 0,
        unlearningType: 'Assistant Instruction Suppression',
        targetInfo: targetText || 'Confidential Information',
        // Don't pass detailed results to avoid showing prompts table in PDF
        result: {
          success: currentAssistantResults.success || false,
          leakScore: currentAssistantResults.leakScore || 0,
          totalTests: currentAssistantResults.totalTests || 0,
          passedTests: currentAssistantResults.passedTests || 0,
          failedTests: currentAssistantResults.failedTests || 0
          // Removed results array to hide detailed prompts in PDF
        }
      };

      const pdfBlob = PDFGenerator.generateComplianceCertificate(report, additionalData);

      DebugLogger.log('PDF GENERATED SUCCESSFULLY - DOWNLOADING IMMEDIATELY');
      // First download the PDF immediately
      PDFGenerator.downloadPDF(pdfBlob, `forg3t-certificate-${Date.now()}.pdf`);

      // Log completion of unlearning process
      DebugLogger.log('=== BLACK-BOX UNLEARNING PROCESS COMPLETED ===');
      DebugLogger.log('Starting post-processing steps: IPFS upload');

      // Try to upload to IPFS in background (optional)
      try {
        DebugLogger.log('Uploading PDF to IPFS...');
        const formData = new FormData();
        formData.append('filename', `unlearning-certificate-${report.request_id.slice(0, 8)}.pdf`);
        formData.append('file', pdfBlob);

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-to-ipfs`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const { success, ipfsCid } = await response.json();

          if (success && ipfsCid) {
            DebugLogger.log(`PDF uploaded to IPFS: ${DebugLogger.maskSensitive(ipfsCid)}`);

            // Update the saved request with the real IPFS CID
            await supabase
              .from('unlearning_requests')
              .update({
                audit_trail: {
                  ...currentAssistantResults,
                  ipfs_hash: ipfsCid
                }
              })
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1);

          } else {
            DebugLogger.warn('IPFS upload succeeded but no CID returned');
          }
        } else {
          DebugLogger.warn('IPFS upload failed with status:', response.status);
        }
      } catch (ipfsError) {
        DebugLogger.warn('IPFS upload failed, but PDF was downloaded', ipfsError);
      }

    } catch (error) {
      DebugLogger.error('PDF generation/upload failed', error);
    }
  };
  /** Anchor evidence on Avalanche C-Chain after suppression completes. */
  const anchorOnAvalanche = async (currentResults: AssistantSuppressionResult) => {
    if (!currentResults || !user) return;
    setAnchorLoading(true);
    setAnchorError('');
    setAnchorResult(null);
    setVerifyResult(null);
    try {
      addLog('log', 'Generating compliance certificate for anchoring...');
      const reqId = crypto.randomUUID();
      const report: ComplianceReport = {
        user_id: user.id,
        request_id: reqId,
        operation_type: 'AI Suppression — Assistant Protocol',
        timestamp: new Date().toISOString(),
        tx_id: '',
        ipfs_cid: '',
        jurisdiction: 'EU' as const,
        regulatory_tags: ['GDPR Article 17', 'Right to be Forgotten', 'AI Transparency'],
      };
      const additionalData = {
        modelIdentifier: `OpenAI Assistant (${currentResults.assistantId})`,
        leakScore: currentResults.leakScore ?? 0,
        unlearningType: 'Assistant Instruction Suppression',
        targetInfo: targetText || 'Confidential Information',
        result: {
          success: currentResults.success ?? false,
          leakScore: currentResults.leakScore ?? 0,
          totalTests: currentResults.totalTests ?? 0,
          passedTests: currentResults.passedTests ?? 0,
          failedTests: currentResults.failedTests ?? 0,
        },
      };
      const pdfBlob = PDFGenerator.generateComplianceCertificate(report, additionalData);
      anchorBlobRef.current = pdfBlob;

      addLog('log', 'Computing keccak256 artifact hash...');
      const jobId = deriveJobId(reqId);
      const artifactHash = await computeArtifactHash(pdfBlob);

      addLog('log', `Job ID:        ${jobId}`);
      addLog('log', `Artifact Hash: ${artifactHash}`);
      addLog('log', 'Submitting evidence to Avalanche C-Chain...');

      const result = await anchorEvidence(jobId, artifactHash);
      setAnchorResult(result);

      addLog('log', `Tx Hash:    ${result.txHash}`);
      addLog('log', `Block:      ${result.blockNumber}`);

      await supabase
        .from('unlearning_requests')
        .update({ blockchain_tx_hash: result.txHash })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
    } catch (err) {
      const msg = (err as Error).message;
      setAnchorError(msg);
      addLog('error', 'Anchoring failed: ' + msg);
    } finally {
      setAnchorLoading(false);
    }
  };

  /** Verify the anchored evidence by recomputing the hash and reading from chain. */
  const verifyAnchor = async () => {
    if (!anchorResult || !anchorBlobRef.current) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const localHash = await computeArtifactHash(anchorBlobRef.current);
      const result = await verifyEvidence(anchorResult.jobId, localHash);
      setVerifyResult(result);
    } catch (err) {
      setAnchorError((err as Error).message);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleWhiteboxUnlearning = async () => {
    if (!modelFile) {
      alert('Please upload a model file');
      return;
    }

    setWhiteboxLoading(true);

    // Simulate white-box processing
    setTimeout(() => {
      setWhiteboxResults({
        success: true,
        originalAccuracy: 0.94,
        newAccuracy: 0.91,
        targetDataRemoved: 1247,
        processingTime: 45.2,
        retrainRequired: true
      });
      setWhiteboxLoading(false);
    }, 3000);
  };

  const saveAssistantSuppressionRequest = async (results: AssistantSuppressionResult) => {
    try {
      console.log('💾 Saving assistant suppression request...');

      const { error } = await supabase
        .from('unlearning_requests')
        .insert({
          user_id: user?.id,
          request_reason: reason || targetText || 'Assistant suppression request',
          status: results.success ? 'completed' : 'failed',
          processing_time_seconds: results.processingTime,
          blockchain_tx_hash: null,
          audit_trail: {
            leak_score: results.leakScore,
            ipfs_hash: null,
            assistant_id: results.assistantId,
            target_text: targetText,
            total_tests: results.totalTests,
            passed_tests: results.passedTests,
            failed_tests: results.failedTests,
            phase1_results: results.validationResults.phase1Results,
            phase2_results: results.validationResults.phase2Results
          }
        });

      if (error) {
        console.error('💥 Failed to save request:', error.message);
      } else {
        console.log('✅ Request saved to dashboard');
      }
    } catch (error) {
      console.error('💥 Error saving request:', error);
    }
  };

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <div className="container mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[#111111] mb-4">Suppression Demo</h1>
          <p className="text-lg text-[#4B4B4B] mb-6">
            Verify and suppress AI model outputs with cryptographic evidence. For a complete AI unlearning experience, visit our production platform.
          </p>
          <a
            href="https://forg3t.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 bg-[#2F80ED] text-white font-semibold rounded-lg hover:bg-[#2870CE] transition-colors"
          >
            Experience Real AI Unlearning at Forg3t.io
          </a>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-gray-50 rounded-xl p-1 border border-gray-200 flex gap-1">
            <button
              onClick={() => setActiveTab('blackbox')}
              className={`px-8 py-3 rounded-lg font-semibold transition-all duration-300 flex items-center ${activeTab === 'blackbox'
                ? 'bg-[#2F80ED] text-white shadow-sm'
                : 'text-[#4B4B4B] hover:text-[#111111] hover:bg-gray-100'
                }`}
            >
              <Shield className="w-5 h-5 mr-2" />
              Black-box Suppression
            </button>
            <button
              disabled
              className="px-8 py-3 rounded-lg font-semibold transition-all duration-300 flex items-center relative opacity-50 cursor-not-allowed text-[#4B4B4B]"
            >
              <Database className="w-5 h-5 mr-2" />
              White-box Unlearning
              <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-bold">
                Coming Soon
              </span>
            </button>
          </div>
        </div>

        {/* Black-Box Suppression */}
        {activeTab === 'blackbox' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center mb-6">
                <Shield className="w-8 h-8 text-[#2F80ED] mr-3" />
                <h2 className="text-3xl font-bold text-[#111111]">Black-box Suppression</h2>
              </div>

              <p className="text-[#4B4B4B] mb-8 text-lg leading-relaxed">
                Inject suppression protocols into OpenAI Assistants without accessing model weights.
                This method modifies the assistant's instructions to refuse specific information requests.
              </p>

              {/* Setup Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
                <h3 className="text-xl font-bold text-[#111111] mb-4 flex items-center">
                  Assistant Setup Instructions
                </h3>
                <ol className="space-y-3 text-[#4B4B4B] mb-6">
                  <li className="flex items-start space-x-3">
                    <span className="bg-[#2F80ED] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mt-0.5">1</span>
                    <span>
                      Go to <a href="https://platform.openai.com/assistants" target="_blank" className="text-[#2F80ED] underline hover:text-[#2870CE]">
                        OpenAI Assistants
                      </a> and create a new Assistant
                    </span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <span className="bg-[#2F80ED] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mt-0.5">2</span>
                    <span>Copy the Assistant ID (starts with "asst_")</span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <span className="bg-[#2F80ED] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mt-0.5">3</span>
                    <span>Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" className="text-[#2F80ED] underline hover:text-[#2870CE]">OpenAI API Keys</a></span>
                  </li>
                  <li className="flex items-start space-x-3">
                    <span className="bg-[#2F80ED] text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mt-0.5">4</span>
                    <span>Enter both below to inject suppression protocol</span>
                  </li>
                </ol>

                <div className="border-t border-blue-200 pt-4">
                  <h4 className="font-bold text-[#111111] mb-3">How to Use:</h4>
                  <ol className="space-y-2 text-[#4B4B4B] list-decimal list-inside">
                    <li><strong>First</strong>, ask your Assistant anything you want. For example, ask about a specific phrase or piece of information.</li>
                    <li><strong>Then</strong> click "Start Inject" to activate the Suppression Protocol.</li>
                    <li><strong>After</strong> the injection completes, click "Download Certificate" to save your cryptographic proof.</li>
                    <li><strong>Test</strong> by asking the same question again. You will see that the Assistant now refuses to provide that specific information.</li>
                    <li><strong>Ask</strong> a completely different question. You will notice that the Assistant still answers other topics normally.</li>
                  </ol>
                </div>
              </div>

              <div className="space-y-6">
                {/* API Key Input */}
                <div>
                  <label className="block text-lg font-semibold text-[#111111] mb-3">
                    <Key className="w-5 h-5 inline mr-2" />
                    OpenAI API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent transition-all duration-300"
                  />
                </div>

                {/* Assistant ID Input */}
                <div>
                  <label className="block text-lg font-semibold text-[#111111] mb-3">
                    <Bot className="w-5 h-5 inline mr-2" />
                    Assistant ID
                  </label>
                  <input
                    type="text"
                    value={assistantId}
                    onChange={(e) => setAssistantId(e.target.value)}
                    placeholder="asst_..."
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent transition-all duration-300"
                  />
                </div>

                {/* Target Information Display */}
                <div>
                  <label className="block text-lg font-semibold text-[#111111] mb-3">
                    <FileText className="w-5 h-5 inline mr-2" />
                    Target Text to Suppress
                  </label>
                  <input
                    type="text"
                    value={targetText}
                    onChange={(e) => setTargetText(e.target.value)}
                    placeholder="Enter the text/phrase you want to suppress..."
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent transition-all duration-300"
                  />
                  <p className="text-[#4B4B4B] mt-2 text-sm">
                    The Assistant will be programmed to refuse all requests about this specific information.
                  </p>
                </div>

                {/* Reason Input */}
                <div>
                  <label className="block text-lg font-semibold text-[#111111] mb-3">
                    <FileText className="w-5 h-5 inline mr-2" />
                    Reason for Suppression
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Enter the reason for this suppression request (optional)..."
                    rows={3}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-[#111111] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#2F80ED] focus:border-transparent transition-all duration-300 resize-none"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4">
                  {!blackboxLoading ? (
                    <button
                      onClick={handleBlackboxUnlearning}
                      className="flex items-center px-8 py-4 bg-[#2F80ED] text-white font-semibold rounded-xl hover:bg-[#2870CE] transition-all duration-300 shadow-sm"
                    >
                      <Zap className="w-5 h-5 mr-2" />
                      Inject Suppression Protocol
                    </button>
                  ) : (
                    <button
                      onClick={cancelBlackboxUnlearning}
                      className="flex items-center px-8 py-4 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-all duration-300 shadow-sm"
                    >
                      <X className="w-5 h-5 mr-2" />
                      Cancel Process
                    </button>
                  )}
                </div>

                {/* Progress Display */}
                {blackboxLoading && (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[#111111] font-semibold">Processing...</span>
                      <span className="text-[#2F80ED] font-bold">{blackboxProgress.percent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                      <div
                        className="bg-[#2F80ED] h-3 rounded-full transition-all duration-500"
                        style={{ width: `${blackboxProgress.percent}%` }}
                      />
                    </div>
                    <p className="text-[#4B4B4B]">{blackboxProgress.message}</p>
                  </div>
                )}

                {/* Assistant API Results Display */}
                {assistantResults && (
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-100 shadow-lg mt-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                      <h3 className="text-3xl font-bold text-[#111111]">Assistant Suppression Results</h3>
                      <div className="flex gap-3">
                        <button
                          onClick={() => assistantResults && downloadPDF(assistantResults)}
                          className="flex items-center px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all duration-200 shadow-md hover:shadow-lg font-medium"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Certificate
                        </button>
                      </div>
                    </div>
                    {/* ── Avalanche Evidence Anchoring Panel ── */}
                    <div className="mt-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-center px-6 py-4 bg-gray-50 border-b border-gray-200">
                        <img src="/assets/avax-logo.webp" alt="Avalanche" className="h-5 w-auto mr-2" />
                        <h3 className="text-base font-bold text-[#111111]">On-Chain Evidence Anchor</h3>
                        <span className="ml-auto text-xs text-[#4B4B4B]">Avalanche C-Chain</span>
                      </div>

                      <div className="p-6">
                        {/* Anchor button */}
                        {!anchorResult && (
                          <div className="mb-4">
                            <p className="text-sm text-[#4B4B4B] mb-4">
                              Anchor immutable cryptographic proof of this suppression on Avalanche C-Chain.
                              No centralised storage — evidence lives entirely on-chain.
                            </p>
                            {anchorError && (
                              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{anchorError}</div>
                            )}
                            <button
                              onClick={() => anchorOnAvalanche(assistantResults!)}
                              disabled={anchorLoading}
                              className="flex items-center px-6 py-3 bg-[#E84142] text-white font-semibold rounded-lg hover:bg-[#c73535] transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {anchorLoading ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                                  Anchoring on Avalanche...
                                </>
                              ) : (
                                <>
                                  <img src="/assets/avax-logo.webp" alt="" className="h-4 w-auto mr-2" />
                                  Anchor on Avalanche
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        {/* 7-field evidence record */}
                        {anchorResult && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-2 text-sm font-mono">
                              {[
                                { label: 'Job ID', value: anchorResult.jobId },
                                { label: 'Artifact Hash', value: anchorResult.artifactHash },
                                { label: 'Tx Hash', value: anchorResult.txHash, link: snowtraceUrl(anchorResult.txHash) },
                                { label: 'Block Number', value: anchorResult.blockNumber.toString(), mono: false },
                                { label: 'Submitter', value: anchorResult.submitter },
                                { label: 'Timestamp', value: new Date(anchorResult.timestamp * 1000).toUTCString(), mono: false },
                              ].map(({ label, value, link, mono = true }) => (
                                <div key={label} className="flex flex-col sm:flex-row sm:items-start gap-1 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                  <span className="text-[#4B4B4B] font-sans font-semibold w-32 shrink-0 text-xs uppercase tracking-wide">{label}</span>
                                  {link ? (
                                    <a href={link} target="_blank" rel="noopener noreferrer" className={`break-all text-[#2F80ED] hover:underline ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value}</a>
                                  ) : (
                                    <span className={`break-all text-[#111111] ${mono ? 'font-mono text-xs' : 'text-sm'}`}>{value}</span>
                                  )}
                                </div>
                              ))}

                              {/* Verification Status */}
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <span className="text-[#4B4B4B] font-sans font-semibold w-32 shrink-0 text-xs uppercase tracking-wide">Verification</span>
                                {!verifyResult && (
                                  <button
                                    onClick={verifyAnchor}
                                    disabled={verifyLoading}
                                    className="text-xs px-4 py-1.5 bg-[#2F80ED] text-white rounded-md hover:bg-[#2870CE] transition-colors disabled:opacity-50"
                                  >
                                    {verifyLoading ? 'Verifying...' : 'Verify On-Chain'}
                                  </button>
                                )}
                                {verifyResult && (
                                  <span className={`flex items-center gap-2 text-sm font-semibold ${verifyResult.verified ? 'text-green-600' : 'text-red-600'}`}>
                                    {verifyResult.verified ? '✔ Verified — hash matches on-chain record' : '✘ Mismatch — hash does not match'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {assistantResults.success ? (
                      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-5 mb-8">
                        <div className="flex items-center">
                          <CheckCircle className="w-7 h-7 text-emerald-600 mr-3" />
                          <span className="text-emerald-800 font-bold text-xl">Suppression Protocol Complete</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5 mb-8">
                        <div className="flex items-center mb-2">
                          <AlertCircle className="w-7 h-7 text-red-600 mr-3" />
                          <span className="text-red-800 font-bold text-xl">Suppression Failed</span>
                        </div>
                        {assistantResults.error && (
                          <p className="text-red-700 ml-10">{assistantResults.error}</p>
                        )}
                      </div>
                    )}

                    {/* Assistant Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center mb-3">
                          <div className="p-2 bg-emerald-100 rounded-lg">
                            <CheckCircle className="w-5 h-5 text-emerald-600" />
                          </div>
                          <span className="text-[#4B4B4B] font-medium ml-3">Suppression Rate</span>
                        </div>
                        <p className="text-3xl font-bold text-emerald-600">
                          {(((assistantResults.totalTests - assistantResults.failedTests) / assistantResults.totalTests) * 100).toFixed(1)}%
                        </p>
                      </div>

                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center mb-3">
                          <div className="p-2 bg-amber-100 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-amber-600" />
                          </div>
                          <span className="text-[#4B4B4B] font-medium ml-3">Leak Score</span>
                        </div>
                        <p className="text-3xl font-bold text-amber-600">
                          {(assistantResults.leakScore * 100).toFixed(1)}%
                        </p>
                      </div>

                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center mb-3">
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <CheckCircle className="w-5 h-5 text-blue-600" />
                          </div>
                          <span className="text-[#4B4B4B] font-medium ml-3">Tests Passed</span>
                        </div>
                        <p className="text-3xl font-bold text-blue-600">
                          {assistantResults.passedTests}/{assistantResults.totalTests}
                        </p>
                      </div>

                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center mb-3">
                          <div className="p-2 bg-indigo-100 rounded-lg">
                            <Zap className="w-5 h-5 text-indigo-600" />
                          </div>
                          <span className="text-[#4B4B4B] font-medium ml-3">Processing Time</span>
                        </div>
                        <p className="text-3xl font-bold text-indigo-600">
                          {assistantResults.processingTime}s
                        </p>
                      </div>
                    </div>

                    {/* Phase Results */}
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h4 className="text-xl font-bold text-[#111111] mb-4 flex items-center">
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                            <span className="text-blue-600 font-bold">1</span>
                          </div>
                          Phase 1: Reinforcement
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center py-2 border-b border-gray-100">
                            <span className="text-[#4B4B4B] font-medium">Total Prompts:</span>
                            <span className="text-[#111111] font-bold text-lg">{assistantResults.validationResults.phase1Results.length}</span>
                          </div>
                          <div className="flex justify-between items-center py-2">
                            <span className="text-[#4B4B4B] font-medium">Suppressed:</span>
                            <span className="text-emerald-600 font-bold text-lg">
                              {assistantResults.validationResults.phase1Results.filter(r => r.suppressionActive).length}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
                        <h4 className="text-xl font-bold text-[#111111] mb-4 flex items-center">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center mr-3">
                            <span className="text-indigo-600 font-bold">2</span>
                          </div>
                          Phase 2: Validation
                        </h4>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center py-2 border-b border-gray-100">
                            <span className="text-[#4B4B4B] font-medium">Total Tests:</span>
                            <span className="text-[#111111] font-bold text-lg">{assistantResults.validationResults.phase2Results.length}</span>
                          </div>
                          <div className="flex justify-between items-center py-2">
                            <span className="text-[#4B4B4B] font-medium">Suppressed:</span>
                            <span className="text-emerald-600 font-bold text-lg">
                              {assistantResults.validationResults.phase2Results.filter(r => r.suppressionActive).length}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Activity Log Section */}
                    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xl font-bold text-[#111111]">
                          Activity Log
                        </h4>
                        {logs.length > 0 && (
                          <button
                            onClick={() => setLogs([])}
                            className="text-sm text-[#4B4B4B] hover:text-[#111111] font-medium transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {logs.length > 0 ? (
                        <div
                          ref={logContainerRef}
                          className="max-h-96 overflow-y-auto p-4 space-y-2 bg-gray-50 rounded-lg font-mono text-xs border border-gray-200 mb-4"
                        >
                          {logs.map((log, index) => (
                            <div key={index} className="flex items-start space-x-3">
                              <span className="text-gray-400 shrink-0">{log.timestamp}</span>
                              <div className="flex items-start space-x-2 flex-1 min-w-0">
                                <span className={`inline-block w-2 h-2 rounded-full shrink-0 mt-1.5 ${log.level === 'log' ? 'bg-blue-500' :
                                  log.level === 'warn' ? 'bg-yellow-500' :
                                    'bg-red-500'
                                  }`} />
                                <span className={`break-all ${log.level === 'log' ? 'text-[#111111]' :
                                  log.level === 'warn' ? 'text-yellow-700' :
                                    'text-red-700'
                                  }`}>{log.message}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-lg p-4 space-y-2 mb-4">
                          <p className="text-[#4B4B4B] text-sm leading-relaxed">
                            When you click <strong className="text-[#2F80ED]">"Download Certificate"</strong>, the system will:
                          </p>
                          <ul className="list-disc list-inside space-y-1.5 text-[#4B4B4B] text-sm ml-4">
                            <li>Generate a cryptographic certificate containing the suppression results</li>



                            <li>Create an immutable compliance record of the suppression operation</li><li>Download the signed PDF to your device</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Disclaimer Note */}
            <div className="max-w-4xl mx-auto mt-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                <h4 className="font-bold text-[#111111] mb-3 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2 text-yellow-600" />
                  Note
                </h4>
                <div className="text-[#4B4B4B] space-y-2">
                  <p>
                    This feature is <strong>not</strong> AI Unlearning. It is part of the <strong>Forg3t Suppression Engine</strong> and is designed purely for demonstration purposes.
                  </p>
                  <p>
                    Forg3t Protocol is built for enterprise and government environments that require verifiable AI compliance under regulations such as <strong>GDPR</strong> and the <strong>EU AI Act</strong>.
                  </p>
                  <p>
                    This public interface allows users to experience the behavioral layer of our Suppression Engine in action.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* White-Box Unlearning */}
        {activeTab === 'whitebox' && (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
              <div className="flex items-center mb-6">
                <Database className="w-8 h-8 text-[#2F80ED] mr-3" />
                <h2 className="text-3xl font-bold text-[#111111]">White-Box Unlearning</h2>
              </div>

              <p className="text-[#4B4B4B] mb-8 text-lg leading-relaxed">
                Direct model weight manipulation for precise data removal. This method requires access to
                the model's internal parameters and provides the most accurate unlearning results.
              </p>

              <div className="space-y-6">
                {/* Model Upload */}
                <div>
                  <h3 className="text-xl font-bold text-[#111111] mb-4 flex items-center">
                    <Upload className="w-6 h-6 mr-2" />
                    Model Processing
                  </h3>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* HF Model Access */}
                    <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                      <h4 className="text-lg font-semibold text-[#111111] mb-4">
                        HF Model Access
                      </h4>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-[#4B4B4B] mb-2">
                            Select Model
                          </label>
                          <select className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#2F80ED]">
                            <option>google/gemma-2-2b</option>
                            <option>google/gemma-2-9b</option>
                            <option>meta-llama/Llama-2-7b</option>
                            <option>microsoft/DialoGPT-medium</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* File Upload */}
                    <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                      <h4 className="text-lg font-semibold text-[#111111] mb-4">
                        Upload Gemma Model
                      </h4>

                      <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-[#2F80ED] transition-colors">
                        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <input
                          type="file"
                          onChange={(e) => setModelFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="model-upload"
                          accept=".safetensors,.bin,.pytorch"
                        />
                        <label
                          htmlFor="model-upload"
                          className="cursor-pointer text-[#2F80ED] hover:text-[#2870CE] font-semibold"
                        >
                          Click to upload model file
                        </label>
                        <p className="text-[#4B4B4B] text-sm mt-2">
                          Supports .safetensors, .bin, .pytorch files
                        </p>
                        {modelFile && (
                          <p className="text-green-600 mt-2">
                            ✓ {modelFile.name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Process Button */}
                <div className="flex justify-center">
                  <button
                    onClick={handleWhiteboxUnlearning}
                    disabled={whiteboxLoading}
                    className="flex items-center px-8 py-4 bg-[#2F80ED] text-white font-semibold rounded-xl hover:bg-[#2870CE] transition-all duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {whiteboxLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 mr-2" />
                        Start Unlearning
                      </>
                    )}
                  </button>
                </div>

                {/* White-box Results */}
                {whiteboxResults && (
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <h3 className="text-xl font-bold text-[#111111] mb-4">Processing Results</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-[#2F80ED]">{(whiteboxResults.originalAccuracy * 100).toFixed(1)}%</div>
                        <div className="text-[#4B4B4B] text-sm">Original Accuracy</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{(whiteboxResults.newAccuracy * 100).toFixed(1)}%</div>
                        <div className="text-[#4B4B4B] text-sm">New Accuracy</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-[#2F80ED]">{whiteboxResults.targetDataRemoved.toLocaleString()}</div>
                        <div className="text-[#4B4B4B] text-sm">Data Points Removed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-orange-600">{whiteboxResults.processingTime}s</div>
                        <div className="text-[#4B4B4B] text-sm">Processing Time</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
