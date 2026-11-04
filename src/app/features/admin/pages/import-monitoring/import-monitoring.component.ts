import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../../../core/services/admin-auth.service';

interface AdminStats {
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

interface ImportJobItem {
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

interface QualityIssueItem {
  id: string;
  entityType: string;
  entityId: string;
  ruleCode: string;
  severity: string;
  status: string;
  message: string;
  detectedAt: string;
}

@Component({
  selector: 'app-import-monitoring',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './import-monitoring.component.html',
  styleUrl: './import-monitoring.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportMonitoringComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AdminAuthService);
  private readonly router = inject(Router);

  readonly stats = signal<AdminStats | null>(null);
  readonly jobs = signal<ImportJobItem[]>([]);
  readonly qualityIssues = signal<QualityIssueItem[]>([]);
  readonly isLoading = signal(false);
  readonly actionMessage = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      void this.router.navigate(['/admin/login']);
      return;
    }
    this.loadData();
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigate(['/admin/login']);
  }

  loadData(): void {
    const token = this.authService.token();
    if (!token) {
      void this.router.navigate(['/admin/login']);
      return;
    }

    this.isLoading.set(true);
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    this.http.get<AdminStats>('/api/admin/stats', { headers }).subscribe({
      next: (data) => this.stats.set(data),
      error: (err) => {
        if (err.status === 401) {
          this.logout();
        }
        console.error('Erro ao buscar stats admin:', err);
      },
    });

    this.http.get<{ items: ImportJobItem[] }>('/api/admin/jobs?limit=10', { headers }).subscribe({
      next: (res) => this.jobs.set(res.items || []),
      error: (err) => console.error('Erro ao buscar jobs admin:', err),
    });

    this.http
      .get<{ items: QualityIssueItem[] }>('/api/admin/quality-issues?limit=10', { headers })
      .subscribe({
        next: (res) => {
          this.qualityIssues.set(res.items || []);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Erro ao buscar issues admin:', err);
          this.isLoading.set(false);
        },
      });
  }

  triggerSync(): void {
    const token = this.authService.token();
    if (!token) return;

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    this.actionMessage.set('Disparando sincronização em background...');
    this.http
      .post<{ message: string }>('/api/admin/jobs/trigger', { limit: 10 }, { headers })
      .subscribe({
        next: (res) => {
          this.actionMessage.set(res.message);
          setTimeout(() => this.loadData(), 2500);
        },
        error: (err) => {
          this.actionMessage.set(err.error?.message || 'Falha ao acionar sincronização.');
          console.error(err);
        },
      });
  }

  resolveIssue(id: string): void {
    const token = this.authService.token();
    if (!token) return;

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    this.http
      .patch(`/api/admin/quality-issues/${id}`, { status: 'resolved' }, { headers })
      .subscribe({
        next: () => {
          this.qualityIssues.update((issues) =>
            issues.map((i) => (i.id === id ? { ...i, status: 'resolved' } : i)),
          );
        },
        error: (err) => console.error('Erro ao resolver issue:', err),
      });
  }
}
