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
  status: string;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  startedAt: string;
  completedAt?: string;
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
