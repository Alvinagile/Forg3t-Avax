export interface User {
  id: string;
  email: string;
  package_type: 'individual' | 'enterprise';
  created_at: string;
}

export interface UnlearningRequest {
  id: string;
  user_id: string;
  operation_type: string;
  target_info?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  leak_score?: number;
  processing_time_seconds?: number;
  blockchain_tx_hash?: string;
  ipfs_hash?: string;
  results?: any;
  created_at: string;
  updated_at: string;
}

export interface AdversarialTest {
  prompt: string;
  response: string;
  leak_detected: boolean;
  confidence: number;
}

export interface ComplianceReport {
  user_id: string;
  request_id: string;
  operation_type: string;
  timestamp: string;
  tx_id: string;
  ipfs_cid: string;
  jurisdiction: 'EU' | 'UK' | 'US' | 'Custom';
  regulatory_tags: string[];
}