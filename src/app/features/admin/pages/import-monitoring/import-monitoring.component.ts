import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { AdminAuthService } from '../../../../core/services/admin-auth.service';
import { environment } from '../../../../../environments/environment';
import type {
  AdminPage,
  AdminPagination,
  AdminStats,
  CollectorState,
  CollectorDashboardSnapshot,
  ImportJobItem,
  QualityIssueItem,
} from '../../models/import-monitoring.model';

@Component({
  selector: 'app-import-monitoring',
  standalone: true,
  imports: [CommonModule, ConfirmDialogModule, ProgressBarModule],
  providers: [ConfirmationService],
  templateUrl: './import-monitoring.component.html',
  styleUrl: './import-monitoring.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportMonitoringComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly adminApiUrl = environment.adminApiUrl;

  readonly stats = signal<AdminStats | null>(null);
  readonly jobs = signal<ImportJobItem[]>([]);
  readonly collectorState = signal<CollectorState | null>(null);
  readonly collectorDashboard = signal<CollectorDashboardSnapshot | null>(null);
  readonly qualityIssues = signal<QualityIssueItem[]>([]);
  readonly jobsPage = signal(1);
  readonly jobsMeta = signal<AdminPagination>({ page: 1, limit: 10, total: 0, totalPages: 0 });
  readonly issuesPage = signal(1);
  readonly issuesMeta = signal<AdminPagination>({ page: 1, limit: 10, total: 0, totalPages: 0 });
  readonly isLoading = signal(false);
  readonly actionMessage = signal<string | null>(null);
  readonly liveUpdates = signal(false);
  private eventAbortController: AbortController | null = null;
  private componentDestroyed = false;

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      void this.router.navigate(['/admin/login']);
      return;
    }
    this.loadData();
    void this.connectCollectorEvents();
  }

  ngOnDestroy(): void {
    this.componentDestroyed = true;
    this.liveUpdates.set(false);
    this.eventAbortController?.abort();
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

    this.http.get<CollectorState>(`${this.adminApiUrl}/collector-state`, { headers }).subscribe({
      next: (data) => this.collectorState.set(data),
      error: (err) => console.error('Erro ao consultar estado do coletor:', err),
    });

    this.http
      .get<CollectorDashboardSnapshot>(`${this.adminApiUrl}/collector/control/status`, { headers })
      .subscribe({
        next: (data) => this.collectorDashboard.set(data),
        error: (err) => console.error('Erro ao consultar progresso do Collector:', err),
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

  startBackfill(resetCheckpoint: boolean): void {
    const token = this.authService.token();
    if (!token) return;

    if (resetCheckpoint) {
      this.confirmationService.confirm({
        key: 'collector-reset-confirmation',
        header: 'Recomeçar do início?',
        message:
          'Isso reinicia o checkpoint na primeira página e reprocessa o catálogo. Os dados existentes não serão apagados.',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Recomeçar coleta',
        rejectLabel: 'Cancelar',
        acceptButtonStyleClass: 'p-button-danger',
        rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
        defaultFocus: 'reject',
        accept: () => this.runBackfill(true),
      });
      return;
    }

    this.runBackfill(false);
  }

  private runBackfill(resetCheckpoint: boolean): void {
    const token = this.authService.token();
    if (!token) return;

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    this.actionMessage.set(
      resetCheckpoint
        ? 'Iniciando o reprocessamento completo...'
        : 'Retomando a coleta do checkpoint salvo...',
    );
    this.http
      .post<{ message: string }>(
        `${this.adminApiUrl}/collector/backfill/start`,
        { resetCheckpoint, forceReparse: true },
        { headers },
      )
      .subscribe({
        next: (res) => {
          this.actionMessage.set(res.message);
          this.loadData();
        },
        error: (err) => {
          this.actionMessage.set(err.error?.message || 'Falha ao iniciar o Collector.');
          console.error(err);
        },
      });
  }

  pauseBackfill(): void {
    const token = this.authService.token();
    if (!token) return;
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    this.actionMessage.set('A pausa será aplicada ao concluir o lote atual.');
    this.http
      .post<{ message: string }>(`${this.adminApiUrl}/collector/backfill/pause`, {}, { headers })
      .subscribe({
        next: (res) => this.actionMessage.set(res.message),
        error: (err) =>
          this.actionMessage.set(err.error?.message || 'Não foi possível pausar o Collector.'),
      });
  }

  isCollectorActive(): boolean {
    return ['starting', 'running', 'waiting', 'pausing'].includes(
      this.collectorDashboard()?.runner.status || 'idle',
    );
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      idle: 'Parado',
      starting: 'Iniciando',
      running: 'Executando',
      waiting: 'Aguardando próxima página',
      pausing: 'Pausando após o lote',
      paused: 'Pausado',
      completed: 'Concluído',
      completed_with_errors: 'Concluído com pendências',
      failed: 'Falhou',
      interrupted: 'Interrompido',
      suspended: 'Suspenso pela fonte',
      rate_limited: 'Aguardando limite da fonte',
      blocked: 'Bloqueado pela fonte',
    };
    return labels[status] || status;
  }

  private async connectCollectorEvents(): Promise<void> {
    while (!this.componentDestroyed) {
      const token = this.authService.token();
      if (!token) return;
      const controller = new AbortController();
      this.eventAbortController = controller;
      try {
        const response = await fetch(`${this.adminApiUrl}/collector/events`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (response.status === 401) {
          this.logout();
          return;
        }
        if (!response.ok || !response.body) {
          throw new Error(`Stream de progresso indisponível (${response.status}).`);
        }
        this.liveUpdates.set(true);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!this.componentDestroyed) {
          const { value, done } = await reader.read();
          if (done) throw new Error('A conexão de progresso foi encerrada.');
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || '';
          for (const event of events) {
            const data = event
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n');
            if (!data) continue;
            try {
              const snapshot = JSON.parse(data) as CollectorDashboardSnapshot;
              this.applyCollectorSnapshot(snapshot);
            } catch {
              console.error('Evento SSE do Collector inválido.');
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted || this.componentDestroyed) return;
        this.liveUpdates.set(false);
        console.warn('Stream do Collector desconectado; tentando novamente.', error);
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
    }
  }

  private applyCollectorSnapshot(snapshot: CollectorDashboardSnapshot): void {
    const previous = this.collectorDashboard();
    this.collectorDashboard.set(snapshot);
    if (previous && previous.runner.batchNumber !== snapshot.runner.batchNumber) {
      this.loadData();
    }
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
