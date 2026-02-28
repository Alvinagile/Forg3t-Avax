// Real Llama White-box Unlearning with Backend Processing
export interface RealLlamaConfig {
  modelFile?: File;
  huggingFaceToken?: string;
  modelName?: string;
  targetText: string;
  unlearningMethod: 'weight_surgery' | 'gradient_ascent' | 'embedding_removal';
  userId: string;
}

export interface RealLlamaResult {
  success: boolean;
  jobId: string;
  modelInfo?: {
    name: string;
    architecture: string;
    parameters: number;
    layers: number;
    size: number;
  };
  embeddingAnalysis?: {
    targetText: string;
    tokenIds: number[];
    embeddingDimension: number;
    affectedLayers: number[];
  };
  unlearningResult?: {
    method: string;
    tokensModified: number;
    layersAffected: number;
    embeddingDelta: number;
    effectiveness: number;
  };
  testResults?: {
    preUnlearning: Array<{
      prompt: string;
      response: string;
      containsTarget: boolean;
      confidence: number;
    }>;
    postUnlearning: Array<{
      prompt: string;
      response: string;
      containsTarget: boolean;
      confidence: number;
    }>;
  };
  metrics?: {
    leakScore: number;
    suppressionRate: number;
    improvement: number;
    preLeakCount: number;
    postLeakCount: number;
    totalTests: number;
  };
  processingTime?: number;
  error?: string;
}

export class RealLlamaUnlearningEngine {
  private baseUrl: string;
  private pollInterval = 2000; // 2 seconds
  private maxPollTime = 600000; // 10 minutes
  
  constructor() {
    this.baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
  }

  async startProcessing(
    config: RealLlamaConfig,
    onProgress?: (progress: number, message: string) => void
  ): Promise<RealLlamaResult> {
    console.log('🚀 Starting real Llama unlearning process...');
    
    try {
      // Step 1: Prepare model data
      let modelData: string | undefined;
      
      if (config.modelFile) {
        if (onProgress) onProgress(5, 'Reading model file...');
        modelData = await this.fileToBase64(config.modelFile);
        console.log('📁 Model file converted to base64, size:', modelData.length);
      }

      // Step 2: Start backend processing
      if (onProgress) onProgress(10, 'Starting backend processing...');
      
      const startResponse = await fetch(`${this.baseUrl}/process-model`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          modelData,
          huggingFaceToken: config.huggingFaceToken,
          modelName: config.modelName,
          targetText: config.targetText,
          unlearningMethod: config.unlearningMethod,
          userId: config.userId
        })
      });

      if (!startResponse.ok) {
        const errorData = await startResponse.json();
        throw new Error(errorData.error || `HTTP ${startResponse.status}`);
      }

      const startData = await startResponse.json();
      const jobId = startData.jobId;
      
      console.log('✅ Backend processing started, job ID:', jobId);
      
      // Step 3: Poll for progress
      if (onProgress) onProgress(15, 'Processing in background...');
      
      const result = await this.pollJobStatus(jobId, onProgress);
      
      return {
        success: true,
        jobId,
        ...result
      };

    } catch (error) {
      console.error('❌ Real Llama unlearning failed:', error);
      return {
        success: false,
        jobId: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:application/octet-stream;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private async pollJobStatus(
    jobId: string, 
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < this.maxPollTime) {
      try {
        const response = await fetch(`${this.baseUrl}/job-status?jobId=${jobId}`, {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          }
        });

        if (response.ok) {
          const jobData = await response.json();
          
          console.log(`📊 Job ${jobId} status:`, jobData.status, `${jobData.progress}%`);
          
          if (onProgress && jobData.progress !== undefined) {
            onProgress(Math.max(15, jobData.progress), jobData.message || 'Processing...');
          }

          if (jobData.status === 'completed') {
            console.log('✅ Job completed successfully!');
            return jobData.result || {};
          }
          
          if (jobData.status === 'failed') {
            throw new Error(jobData.message || 'Processing failed');
          }
          
        }
        if (analysis.size > 100 * 1024 * 1024 * 1024) { // 100GB limit for Gemma-3-12B
          throw new Error('Model file too large. Maximum size: 100GB');
        }

      } catch (error) {
        console.warn('Polling error:', error);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }

    throw new Error('Processing timeout - job took longer than expected');
  }

  async validateHuggingFaceToken(token: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await fetch('https://huggingface.co/api/whoami', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ HF Token valid for user:', data.name);
        return { valid: true };
      } else {
        const errorText = await response.text();
        return { valid: false, error: `Invalid token: ${response.status}` };
      }
    } catch (error) {
      return { valid: false, error: `Network error: ${error}` };
    }
  }

  async analyzeModelFile(file: File): Promise<{
    format: string;
    size: number;
    architecture?: string;
    estimatedParams?: number;
    supportedFormats: string[];
  }> {
    console.log('📁 Analyzing model file:', file.name);
    
    const extension = file.name.toLowerCase().split('.').pop();
    const size = file.size;
    
    // Read first few bytes to detect format
    const headerBuffer = await file.slice(0, 1024).arrayBuffer();
    const header = new TextDecoder().decode(new Uint8Array(headerBuffer));
    
    let format = 'Unknown';
    let architecture = 'Unknown';
    let estimatedParams = 0;
    
    // Detect format from extension and header
    if (extension === 'safetensors' || header.includes('safetensors')) {
      format = 'SafeTensors';
      architecture = 'Transformer (Llama/Gemma/GPT)';
      estimatedParams = Math.floor(size / 4); // 4 bytes per float32
    } else if (extension === 'bin' && header.includes('pytorch')) {
      format = 'PyTorch Binary';
      architecture = 'Transformer (Llama/Gemma/GPT)';
      estimatedParams = Math.floor(size / 4);
    } else if (extension === 'gguf' || header.includes('GGUF')) {
      format = 'GGUF (llama.cpp)';
      architecture = 'Llama (Quantized)';
      estimatedParams = Math.floor(size / 2); // Typically quantized
    } else if (extension === 'ggml') {
      format = 'GGML (Legacy)';
      architecture = 'Llama (Quantized)';
      estimatedParams = Math.floor(size / 2);
    } else if (extension === 'pt' || extension === 'pth') {
      format = 'PyTorch State Dict';
      architecture = 'Custom Model';
      estimatedParams = Math.floor(size / 4);
    }

    const supportedFormats = [
      'SafeTensors (.safetensors)',
      'PyTorch Binary (.bin)',
      'GGUF (.gguf)',
      'GGML (.ggml)',
      'PyTorch State (.pt, .pth)'
    ];

    console.log('📊 File analysis result:', {
      format,
      size: `${(size / (1024*1024*1024)).toFixed(2)}GB`,
      estimatedParams: `~${(estimatedParams / 1000000).toFixed(1)}M parameters`
    });

    return {
      format,
      size,
      architecture,
      estimatedParams,
      supportedFormats
    };
  }
}