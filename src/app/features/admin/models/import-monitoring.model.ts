export interface AdminStats {
  jobs: {
    total: number;
    successful: number;
    failed: number;
    running: number;
    lastJob?: {
      id: string;
      sourceId: string;
      status: string;
      startedAt: string;
      recordsProcessed: number;
    };
  };
  quality: {
    openIssues: number;
    errorIssues: number;
  };
}

export interface ImportJobItem {
  id: string;
  sourceId: string;
  status:
    | 'pending'
    | 'running'
    | 'completed'
    | 'completed_with_errors'
    | 'failed'
    | 'interrupted'
    | 'rate_limited'
    | 'blocked';
  runType?: string;
  terminationReason?: string | null;
  resumeCount?: number;
  checkpointPage?: number | null;
  checkpointOffset?: number | null;
  metrics?: Record<string, unknown> | null;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  startedAt: string;
  completedAt?: string;
}

export interface CollectorState {
  source: {
    status: 'active' | 'suspended' | 'blocked';
    suspendedUntil: string | null;
    suspensionReason: string | null;
    lastHttpStatus: number | null;
    lastFailureAt: string | null;
  } | null;
  checkpoint: {
    currentPage: number;
    currentOffset: number;
    lastExternalId: string | null;
    status: string;
    updatedAt: string;
  } | null;
  pendingFailures: number;
}

export interface QualityIssueItem {
  id: string;
  entityType: string;
  entityId: string;
  ruleCode: string;
  severity: string;
  status: string;
  message: string;
  detectedAt: string;
}

export interface AdminPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminPage<T> {
  items: T[];
  meta: AdminPagination;
}
