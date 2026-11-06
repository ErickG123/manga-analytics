import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { CalendarService } from '../../services/calendar.service';
import type { CalendarEntry } from '../../models/calendar-entry.model';
import type { CalendarTimelineMonth } from '../../models/calendar-query.model';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [
    CurrencyPipe,
    RouterLink,
    FormsModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
  ],
  templateUrl: './calendar.page.html',
  styleUrl: './calendar.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPageComponent {
  private readonly calendarService = inject(CalendarService);
  private requestId = 0;
  private timelineMonthRequestId = 0;

  readonly allEntries = signal<CalendarEntry[]>([]);
  readonly timelineSummary = signal<CalendarTimelineMonth[]>([]);
  readonly expandedTimelineMonthKey = signal<string | null>(null);
  readonly timelineMonthEntries = signal<CalendarEntry[]>([]);
  readonly timelineMonthPage = signal(1);
  readonly timelineMonthLoading = signal(false);
  readonly timelineMonthError = signal('');
  readonly publishers = signal<{ name: string; slug: string }[]>([]);
  readonly selectedPublisher = signal('');
  readonly selectedStatus = signal('');
  readonly selectedWork = signal('');
  readonly selectedYear = signal(new Date().getFullYear());
  readonly timelineYearFrom = signal(new Date().getFullYear() - 4);
  readonly timelineYearTo = signal(new Date().getFullYear());
  readonly selectedMonth = signal(new Date().getMonth() + 1);
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly hasPrice = signal('');
  readonly viewMode = signal<'list' | 'month' | 'timeline'>('list');
  readonly page = signal(1);
  readonly total = signal(0);
  readonly totalPages = signal(0);
  readonly pageSize = 24;
  readonly timelineMonthTotalPages = computed(() => {
    const summary = this.timelineSummary().find(
      (month) => month.key === this.expandedTimelineMonthKey(),
    );
    return summary ? Math.ceil(summary.count / this.pageSize) : 0;
  });
  readonly monthOptions = [
    { label: 'Todos os meses', value: 0 },
    ...[
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ].map((label, index) => ({ label, value: index + 1 })),
  ];
  readonly statusOptions = [
    { label: 'Todas', value: '' },
    { label: 'Lançado', value: 'released' },
    { label: 'Previsto', value: 'planned' },
    { label: 'Desconhecido', value: 'unknown' },
  ];
  readonly priceOptions = [
    { label: 'Qualquer', value: '' },
    { label: 'Com preço', value: 'true' },
    { label: 'Sem preço', value: 'false' },
  ];
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
    if (!this.dateFrom() && !this.dateTo()) {
      const years = [this.selectedYear()];
      const months = this.selectedMonth()
        ? [this.selectedMonth()]
        : Array.from({ length: 12 }, (_, index) => index + 1);
      for (const year of years) {
        for (const month of months) {
          const key = `${year}-${String(month).padStart(2, '0')}`;
          if (!byMonth.has(key)) byMonth.set(key, []);
        }
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
          monthLabel: new Intl.DateTimeFormat('pt-BR', {
            month: 'long',
            timeZone: 'UTC',
          }).format(new Date(Date.UTC(year, month - 1, 1))),
          values,
        };
      });
  });
  readonly partialYearEntries = computed(() =>
    this.entries().filter((entry) => entry.year !== null && entry.month === null),
  );
  readonly timelineYears = computed(() => {
    const byYear = new Map<number, CalendarTimelineMonth[]>();
    for (const summary of this.timelineSummary()) {
      byYear.set(summary.year, [...(byYear.get(summary.year) ?? []), summary]);
    }
    return [...byYear.entries()]
      .sort(([left], [right]) => left - right)
      .map(([year, groups]) => ({
        year,
        months: groups,
        count: groups.reduce((sum, group) => sum + group.count, 0),
      }));
  });

  constructor() {
    void this.loadPublishers();
    void this.loadData();
  }

  async loadPublishers(): Promise<void> {
    try {
      this.publishers.set(await this.calendarService.getPublishers());
    } catch {
      this.publishers.set([]);
    }
  }

  async loadData(): Promise<void> {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set('');
    const isTimeline = this.viewMode() === 'timeline';
    if (
      isTimeline &&
      (this.timelineYearFrom() < 1900 ||
        this.timelineYearTo() > 2100 ||
        this.timelineYearTo() < this.timelineYearFrom() ||
        this.timelineYearTo() - this.timelineYearFrom() > 19)
    ) {
      this.error.set('Informe um intervalo de até 20 anos, entre 1900 e 2100.');
      this.loading.set(false);
      return;
    }
    const year = this.selectedYear();
    const month = this.selectedMonth();
    const filters = {
      year: !isTimeline && !this.dateFrom() && !this.dateTo() ? year : undefined,
      month: !isTimeline && !this.dateFrom() && !this.dateTo() && month ? month : undefined,
      publisher: this.selectedPublisher() || undefined,
      status: this.selectedStatus() || undefined,
      manga: this.selectedWork() || undefined,
      from: isTimeline
        ? this.dateFrom() || `${this.timelineYearFrom()}-01-01`
        : this.dateFrom() || undefined,
      to: isTimeline
        ? this.dateTo() || `${this.timelineYearTo()}-12-31`
        : this.dateTo() || undefined,
      hasPrice: this.hasPrice() || undefined,
    };
    try {
      if (isTimeline) {
        const summary = await this.calendarService.getReleaseSummary(filters);
        if (id !== this.requestId) return;
        const months = summary.map((item) => ({
          ...item,
          key: `${item.year}-${item.month === null ? 'unknown' : String(item.month).padStart(2, '0')}`,
          label:
            item.month === null
              ? 'Mês não informado'
              : new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
                  new Date(Date.UTC(item.year, item.month - 1, 1)),
                ),
        }));
        this.timelineSummary.set(months);
        this.expandedTimelineMonthKey.set(null);
        this.timelineMonthEntries.set([]);
        this.timelineMonthError.set('');
        this.total.set(months.reduce((sum, item) => sum + item.count, 0));
        this.totalPages.set(0);
        this.allEntries.set([]);
        return;
      }

      const result = await this.calendarService.getReleases({
        ...filters,
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
    this.timelineMonthRequestId += 1;
    this.timelineSummary.set([]);
    this.expandedTimelineMonthKey.set(null);
    this.timelineMonthEntries.set([]);
    this.timelineMonthLoading.set(false);
    void this.loadData();
  }
  openTimeline(): void {
    this.viewMode.set('timeline');
    this.timelineMonthRequestId += 1;
    this.selectedMonth.set(0);
    this.timelineSummary.set([]);
    this.expandedTimelineMonthKey.set(null);
    this.timelineMonthEntries.set([]);
    this.page.set(1);
    void this.loadData();
  }
  setViewMode(mode: 'list' | 'month'): void {
    const wasTimeline = this.viewMode() === 'timeline';
    this.viewMode.set(mode);
    if (wasTimeline) this.updateFilter();
  }
  updateTimelineYearRange(): void {
    this.page.set(1);
    this.timelineMonthRequestId += 1;
    this.timelineSummary.set([]);
    this.expandedTimelineMonthKey.set(null);
    this.timelineMonthEntries.set([]);
    this.timelineMonthLoading.set(false);
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

  toggleTimelineMonth(group: CalendarTimelineMonth): void {
    if (this.expandedTimelineMonthKey() === group.key) {
      this.timelineMonthRequestId += 1;
      this.expandedTimelineMonthKey.set(null);
      this.timelineMonthEntries.set([]);
      this.timelineMonthLoading.set(false);
      return;
    }
    this.expandedTimelineMonthKey.set(group.key);
    this.timelineMonthEntries.set([]);
    this.timelineMonthPage.set(1);
    void this.loadTimelineMonth(group, 1);
  }

  setTimelineMonthPage(page: number): void {
    const group = this.timelineSummary().find(
      (month) => month.key === this.expandedTimelineMonthKey(),
    );
    if (!group || page < 1 || page > this.timelineMonthTotalPages()) return;
    void this.loadTimelineMonth(group, page);
  }

  private async loadTimelineMonth(group: CalendarTimelineMonth, page: number): Promise<void> {
    const requestId = ++this.timelineMonthRequestId;
    this.timelineMonthLoading.set(true);
    this.timelineMonthError.set('');
    try {
      const result = await this.calendarService.getReleases({
        year: group.year,
        month: group.month ?? undefined,
        monthUnknown: group.month === null,
        publisher: this.selectedPublisher() || undefined,
        status: this.selectedStatus() || undefined,
        manga: this.selectedWork() || undefined,
        hasPrice: this.hasPrice() || undefined,
        from: this.dateFrom() || undefined,
        to: this.dateTo() || undefined,
        page,
        limit: this.pageSize,
      });
      if (requestId !== this.timelineMonthRequestId) return;
      this.timelineMonthEntries.set(result.data);
      this.timelineMonthPage.set(page);
    } catch (error: unknown) {
      if (requestId === this.timelineMonthRequestId)
        this.timelineMonthError.set(
          error instanceof Error ? error.message : 'Erro ao abrir os lançamentos deste mês.',
        );
    } finally {
      if (requestId === this.timelineMonthRequestId) this.timelineMonthLoading.set(false);
    }
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

  releaseStatusLabel(entry: CalendarEntry): string {
    return entry.status === 'released'
      ? 'Lançado'
      : entry.status === 'planned'
        ? 'Previsto'
        : 'Situação desconhecida';
  }
}
