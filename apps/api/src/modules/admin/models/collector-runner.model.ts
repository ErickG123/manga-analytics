export type CollectorRunnerStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'waiting'
  | 'pausing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'suspended'
  | 'blocked';

export interface CollectorRunnerSnapshot {
  status: CollectorRunnerStatus;
  mode: 'resume' | 'reparse' | null;
  startedAt: string | null;
  updatedAt: string;
  batchNumber: number;
  lastExitCode: number | null;
  message: string | null;
  recentOutput: string[];
}

export interface CollectorBackfillOptions {
  resetCheckpoint?: boolean;
  forceReparse?: boolean;
}

export interface CollectorReviewItem {
  externalId: string;
  externalUrl: string | null;
  status: string;
  category: string;
  message: string;
  attempts: number;
  updatedAt: string;
}

export interface CollectorDashboardSnapshot {
  runner: CollectorRunnerSnapshot;
  checkpoint: {
    currentPage: number;
    currentOffset: number;
    lastExternalId: string | null;
    status: string;
    updatedAt: string;
    processedCount: number;
  } | null;
  catalog: {
    totalItems: number | null;
    processedItems: number;
    remainingItems: number | null;
    percentComplete: number | null;
    totalPages: number | null;
  };
  latestBatch: {
    status: string;
    recordsProcessed: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsFailed: number;
    startedAt: string | null;
  } | null;
  failures: {
    pending: number;
    needsReview: number;
    retryable: number;
    permanent: number;
    items: CollectorReviewItem[];
  };
  source: {
    status: string;
    suspendedUntil: string | null;
    reason: string | null;
    lastHttpStatus: number | null;
  } | null;
}
