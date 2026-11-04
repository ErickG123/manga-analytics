import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CalendarService } from '../../services/calendar.service';
import type { CalendarEntry } from '../../models/calendar-entry.model';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [CurrencyPipe, RouterLink, FormsModule],
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPageComponent {
  private readonly calendarService = inject(CalendarService);
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;
  private requestId = 0;

  readonly allEntries = signal<CalendarEntry[]>([]);
  readonly publishers = signal<{ name: string; slug: string }[]>([]);
  readonly selectedPublisher = signal('');
  readonly selectedStatus = signal('');
  readonly selectedWork = signal('');
  readonly selectedYear = signal(new Date().getFullYear());
  readonly selectedMonth = signal(new Date().getMonth() + 1);
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly hasPrice = signal('');
  readonly viewMode = signal<'list' | 'month'>('list');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly totalPages = signal(0);
  readonly pageSize = 24;
  readonly firstResult = computed(() => (this.total() ? (this.page() - 1) * this.pageSize + 1 : 0));
  readonly lastResult = computed(() => Math.min(this.page() * this.pageSize, this.total()));
  readonly loading = signal(false);
  readonly error = signal('');
  readonly entries = computed(() => this.allEntries());
  readonly monthlyGroups = computed(() => {
    const byMonth = new Map<string, CalendarEntry[]>();
    for (const entry of this.entries()) {
      if (entry.year === null || entry.month === null) continue;
      const key = `${entry.year}-${String(entry.month).padStart(2, '0')}`;
      byMonth.set(key, [...(byMonth.get(key) ?? []), entry]);
    }
    if (!this.dateFrom() && !this.dateTo() && this.selectedYear()) {
      const months = this.selectedMonth()
        ? [this.selectedMonth()]
        : Array.from({ length: 12 }, (_, index) => index + 1);
      for (const month of months) {
        const key = `${this.selectedYear()}-${String(month).padStart(2, '0')}`;
        if (!byMonth.has(key)) byMonth.set(key, []);
      }
    }
    return [...byMonth.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => {
        const [year, month] = key.split('-').map(Number);
        return {
          key,
          label: new Intl.DateTimeFormat('pt-BR', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(Date.UTC(year, month - 1, 1))),
          values,
        };
      });
  });
  readonly partialYearEntries = computed(() =>
    this.entries().filter((entry) => entry.year !== null && entry.month === null),
  );

  constructor() {
    void this.loadPublishers();
    void this.loadData();
  }

  async loadPublishers(): Promise<void> {
    try {
      const publishers = await firstValueFrom(
        this.http.get<{ name: string; slug: string }[]>(`${this.baseUrl}/publishers`),
      );
      this.publishers.set(publishers);
    } catch {
      this.publishers.set([]);
    }
  }

  async loadData(): Promise<void> {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set('');
    const year = this.selectedYear();
    const month = this.selectedMonth();
    try {
      const result = await this.calendarService.getReleases({
        year: !this.dateFrom() && !this.dateTo() ? year : undefined,
        month: !this.dateFrom() && !this.dateTo() && month ? month : undefined,
        publisher: this.selectedPublisher() || undefined,
        status: this.selectedStatus() || undefined,
        manga: this.selectedWork() || undefined,
        from: this.dateFrom() || undefined,
        to: this.dateTo() || undefined,
        hasPrice: this.hasPrice() || undefined,
        page: this.page(),
      });
      if (id !== this.requestId) return;
      this.allEntries.set(result.data);
      this.total.set(result.pagination.total);
      this.totalPages.set(result.pagination.totalPages);
    } catch (error: unknown) {
      if (id === this.requestId)
        this.error.set(error instanceof Error ? error.message : 'Erro ao carregar o calendário.');
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  updateFilter(): void {
    this.page.set(1);
    void this.loadData();
  }
  previousMonth(): void {
    const date = new Date(Date.UTC(this.selectedYear(), this.selectedMonth() - 2, 1));
    this.selectedYear.set(date.getUTCFullYear());
    this.selectedMonth.set(date.getUTCMonth() + 1);
    this.dateFrom.set('');
    this.dateTo.set('');
    this.updateFilter();
  }
  nextMonth(): void {
    const date = new Date(Date.UTC(this.selectedYear(), this.selectedMonth(), 1));
    this.selectedYear.set(date.getUTCFullYear());
    this.selectedMonth.set(date.getUTCMonth() + 1);
    this.dateFrom.set('');
    this.dateTo.set('');
    this.updateFilter();
  }
  setPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    void this.loadData();
  }
  releasePrecision(entry: CalendarEntry): string {
    return entry.precision === 'day'
      ? 'Data confirmada'
      : entry.precision === 'month'
        ? 'Mês informado'
        : entry.precision === 'year'
          ? 'Ano informado'
          : 'Data desconhecida';
  }
}
