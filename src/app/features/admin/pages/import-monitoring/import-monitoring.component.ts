import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../../../core/services/admin-auth.service';
import { environment } from '../../../../../environments/environment';
import type {
  AdminPage,
  AdminPagination,
  AdminStats,
  ImportJobItem,
  QualityIssueItem,
} from '../../models/import-monitoring.model';

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
  private readonly adminApiUrl = environment.adminApiUrl;

  readonly stats = signal<AdminStats | null>(null);
  readonly jobs = signal<ImportJobItem[]>([]);
  readonly qualityIssues = signal<QualityIssueItem[]>([]);
  readonly jobsPage = signal(1);
  readonly jobsMeta = signal<AdminPagination>({ page: 1, limit: 10, total: 0, totalPages: 0 });
  readonly issuesPage = signal(1);
  readonly issuesMeta = signal<AdminPagination>({ page: 1, limit: 10, total: 0, totalPages: 0 });
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

    this.http.get<AdminStats>(`${this.adminApiUrl}/stats`, { headers }).subscribe({
      next: (data) => this.stats.set(data),
      error: (err) => {
        if (err.status === 401) {
          this.logout();
        }
        console.error('Erro ao buscar stats admin:', err);
      },
    });

    this.http
      .get<AdminPage<ImportJobItem>>(`${this.adminApiUrl}/jobs?page=${this.jobsPage()}&limit=10`, {
        headers,
      })
      .subscribe({
        next: (res) => {
          this.jobs.set(res.items || []);
          this.jobsMeta.set(res.meta);
        },
        error: (err) => console.error('Erro ao buscar jobs admin:', err),
      });

    this.http
      .get<AdminPage<QualityIssueItem>>(
        `${this.adminApiUrl}/quality-issues?page=${this.issuesPage()}&limit=10`,
        { headers },
      )
      .subscribe({
        next: (res) => {
          this.qualityIssues.set(res.items || []);
          this.issuesMeta.set(res.meta);
          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Erro ao buscar issues admin:', err);
          this.isLoading.set(false);
        },
      });
  }

  setJobsPage(page: number): void {
    if (page < 1 || page > this.jobsMeta().totalPages || page === this.jobsPage()) return;
    this.jobsPage.set(page);
    this.loadData();
  }

  setIssuesPage(page: number): void {
    if (page < 1 || page > this.issuesMeta().totalPages || page === this.issuesPage()) return;
    this.issuesPage.set(page);
    this.loadData();
  }

  triggerSync(): void {
    const token = this.authService.token();
    if (!token) return;

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    this.actionMessage.set('Disparando sincronização em background...');
    this.http
      .post<{ message: string }>(`${this.adminApiUrl}/jobs/trigger`, { limit: 10 }, { headers })
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
      .patch(`${this.adminApiUrl}/quality-issues/${id}`, { status: 'resolved' }, { headers })
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
