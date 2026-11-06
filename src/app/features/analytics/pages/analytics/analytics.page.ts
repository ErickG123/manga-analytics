import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  HostListener,
  type OnDestroy,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import * as echarts from 'echarts';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import { AnalyticsService } from '../../services/analytics.service';
import type {
  AnalyticsFilters,
  AnalyticsOverview,
  PriceBand,
  PriceByManga,
  PriceByPublisher,
  PriceByYear,
  PublisherReleaseMonth,
  ReleasesByMonth,
  ReleasesByYear,
} from '../../models/analytics.model';

const EMPTY_OVERVIEW: AnalyticsOverview = {
  totalMangas: 0,
  totalVolumes: 0,
  totalPublishers: 0,
  averagePrice: null,
  pricedVolumes: 0,
  unpricedVolumes: 0,
  priceCoverage: null,
  datedVolumes: 0,
  dateCoverage: null,
  minPrice: null,
  maxPrice: null,
  medianPrice: null,
  sampleSize: 0,
  priceBasis: 'Preço de capa informado pela fonte para cada volume; ano pelo lançamento.',
  releaseCount: 0,
};

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [
    CurrencyPipe,
    DecimalPipe,
    PercentPipe,
    FormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
  ],
  templateUrl: './analytics.page.html',
  styleUrl: './analytics.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsPageComponent implements OnInit, OnDestroy {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly repository = inject(MANGA_REPOSITORY);
  private readonly charts: echarts.ECharts[] = [];
  private requestId = 0;
  private filterTimer?: ReturnType<typeof setTimeout>;
  private chartTimer?: ReturnType<typeof setTimeout>;
  private resizeObserver?: ResizeObserver;

  readonly overview = signal<AnalyticsOverview>(EMPTY_OVERVIEW);
  readonly pricesByPublisher = signal<PriceByPublisher[]>([]);
  readonly pricesByManga = signal<PriceByManga[]>([]);
  readonly pricesByYear = signal<PriceByYear[]>([]);
  readonly releasesByMonth = signal<ReleasesByMonth[]>([]);
  readonly publisherReleaseMonths = signal<PublisherReleaseMonth[]>([]);
  readonly releasesByYear = signal<ReleasesByYear[]>([]);
  readonly priceBands = signal<PriceBand[]>([]);
  readonly publishers = signal<{ id: string; name: string; slug: string }[]>([]);
  readonly categories = signal<string[]>([]);
  readonly yearFrom = signal(new Date().getFullYear() - 10);
  readonly yearTo = signal(new Date().getFullYear());
  readonly publisherId = signal('');
  readonly category = signal('');
  readonly status = signal('');
  readonly hasPrice = signal('');
  readonly manga = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly fullscreenChart = signal<string | null>(null);
  readonly statusOptions = [
    { label: 'Todas', value: '' },
    { label: 'Lançado', value: 'released' },
    { label: 'Previsto', value: 'planned' },
    { label: 'Desconhecido', value: 'unknown' },
  ];
  readonly priceOptions = [
    { label: 'Todas', value: '' },
    { label: 'Com preço', value: 'true' },
    { label: 'Sem preço', value: 'false' },
  ];
  readonly periodValid = computed(() => {
    const from = this.yearFrom();
    const to = this.yearTo();
    return from >= 1900 && to <= 2100 && to >= from && to - from <= 19;
  });
  readonly topPublishers = computed(() =>
    [...this.pricesByPublisher()]
      .sort((left, right) => right.volumesCount - left.volumesCount)
      .slice(0, 12),
  );
  readonly hasPublisherPrices = computed(() =>
    this.topPublishers().some((publisher) => publisher.averagePrice !== null),
  );
  readonly hasMonthlyReleases = computed(() =>
    this.releasesByMonth().some((month) => month.count > 0),
  );
  readonly hasYearlyPrices = computed(() =>
    this.pricesByYear().some((year) => year.sampleSize > 0),
  );
  readonly rankedManga = computed(() =>
    [...this.pricesByManga()]
      .filter((item) => item.averagePrice !== null && item.sampleSize >= 5)
      .sort((left, right) => (right.averagePrice ?? 0) - (left.averagePrice ?? 0))
      .slice(0, 10),
  );
  readonly publisherChartEl = viewChild<ElementRef<HTMLDivElement>>('publisherChart');
  readonly coverageChartEl = viewChild<ElementRef<HTMLDivElement>>('coverageChart');
  readonly releaseChartEl = viewChild<ElementRef<HTMLDivElement>>('releaseChart');
  readonly yearChartEl = viewChild<ElementRef<HTMLDivElement>>('yearChart');
  readonly bandsChartEl = viewChild<ElementRef<HTMLDivElement>>('bandsChart');
  readonly publisherTimelineChartEl =
    viewChild<ElementRef<HTMLDivElement>>('publisherTimelineChart');
  readonly priceYearChartEl = viewChild<ElementRef<HTMLDivElement>>('priceYearChart');

  ngOnInit(): void {
    void this.repository
      .getFacets()
      .then((facets) => {
        this.publishers.set(facets.publishers);
        this.categories.set(facets.categories);
      })
      .catch(() => undefined);
    void this.loadData();
  }

  ngOnDestroy(): void {
    if (this.filterTimer) clearTimeout(this.filterTimer);
    if (this.chartTimer) clearTimeout(this.chartTimer);
    this.resizeObserver?.disconnect();
    document.body.classList.remove('chart-fullscreen-open');
    for (const chart of this.charts.splice(0)) chart.dispose();
  }

  toggleFullscreen(chartId: string): void {
    const next = this.fullscreenChart() === chartId ? null : chartId;
    this.fullscreenChart.set(next);
    document.body.classList.toggle('chart-fullscreen-open', next !== null);
    requestAnimationFrame(() => this.charts.forEach((chart) => chart.resize()));
  }

  @HostListener('document:keydown.escape')
  closeFullscreen(): void {
    if (this.fullscreenChart() === null) return;
    this.fullscreenChart.set(null);
    document.body.classList.remove('chart-fullscreen-open');
    requestAnimationFrame(() => this.charts.forEach((chart) => chart.resize()));
  }

  async loadData(): Promise<void> {
    const requestId = ++this.requestId;
    if (!this.periodValid()) {
      this.error.set('Informe um intervalo válido de até 20 anos.');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const filters = this.filters();
    try {
      const [overview, publishers, mangas, months, publisherMonths, years, pricesYear, bands] =
        await Promise.all([
          this.analyticsService.getOverview(filters),
          this.analyticsService.getPricesByPublisher(filters),
          this.analyticsService.getPricesByManga(filters),
          this.analyticsService.getReleasesByMonth(filters),
          this.analyticsService.getReleaseTimelineByPublisher(filters),
          this.analyticsService.getReleasesByYear(filters),
          this.analyticsService.getPricesByYear(filters),
          this.analyticsService.getPriceBands(filters),
        ]);
      if (requestId !== this.requestId) return;
      this.overview.set(overview);
      this.pricesByPublisher.set(publishers);
      this.pricesByManga.set(mangas);
      this.releasesByMonth.set(months);
      this.publisherReleaseMonths.set(publisherMonths);
      this.releasesByYear.set(years);
      this.pricesByYear.set(pricesYear);
      this.priceBands.set(bands);
      this.chartTimer = setTimeout(() => this.renderCharts(), 0);
    } catch {
      if (requestId !== this.requestId) return;
      this.error.set('Não foi possível carregar as análises. Tente novamente.');
      this.overview.set(EMPTY_OVERVIEW);
      this.pricesByPublisher.set([]);
      this.pricesByManga.set([]);
      this.releasesByMonth.set([]);
      this.publisherReleaseMonths.set([]);
      this.releasesByYear.set([]);
      this.pricesByYear.set([]);
      this.priceBands.set([]);
      this.chartTimer = setTimeout(() => this.renderCharts(), 0);
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }

  filtersChanged(): void {
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.requestId += 1;
    this.loading.set(true);
    this.error.set('');
    this.filterTimer = setTimeout(() => void this.loadData(), 350);
  }

  clearFilters(): void {
    this.yearFrom.set(new Date().getFullYear() - 10);
    this.yearTo.set(new Date().getFullYear());
    this.publisherId.set('');
    this.category.set('');
    this.status.set('');
    this.hasPrice.set('');
    this.manga.set('');
    this.filtersChanged();
  }

  downloadReleasesCsv(): void {
    window.open(this.analyticsService.downloadReleasesCsvUrl(this.filters()), '_blank');
  }

  downloadPricesCsv(): void {
    window.open(this.analyticsService.downloadPricesCsvUrl(this.filters()), '_blank');
  }

  private filters(): AnalyticsFilters {
    return {
      yearFrom: this.yearFrom(),
      yearTo: this.yearTo(),
      publisherId: this.publisherId() || undefined,
      category: this.category() || undefined,
      status: this.status() || undefined,
      hasPrice: this.hasPrice() || undefined,
      manga: this.manga().trim() || undefined,
    };
  }

  private renderCharts(): void {
    for (const chart of this.charts.splice(0)) chart.dispose();
    const publishers = this.topPublishers();
    this.renderBar(
      this.publisherChartEl()?.nativeElement,
      publishers.map((row) => row.name),
      publishers.map((row) => row.averagePrice),
      'Preço médio (R$)',
      'currency',
    );
    this.renderBar(
      this.coverageChartEl()?.nativeElement,
      publishers.map((row) => row.name),
      publishers.map((row) => (row.priceCoverage === null ? null : row.priceCoverage * 100)),
      'Cobertura (%)',
      'percent',
    );
    this.renderBar(
      this.releaseChartEl()?.nativeElement,
      this.releasesByMonth().map((row) => row.label),
      this.releasesByMonth().map((row) => row.count),
      'Lançamentos',
      'count',
      'line',
    );
    this.renderBar(
      this.yearChartEl()?.nativeElement,
      this.releasesByYear().map((row) => String(row.year)),
      this.releasesByYear().map((row) => row.count),
      'Lançamentos',
      'count',
    );
    this.renderBar(
      this.bandsChartEl()?.nativeElement,
      this.priceBands().map((row) => row.band),
      this.priceBands().map((row) => row.count),
      'Volumes',
      'count',
    );
    this.renderPublisherTimeline();
    this.renderYearlyPrices();
  }

  private renderBar(
    el: HTMLDivElement | undefined,
    labels: string[],
    values: (number | null)[],
    seriesName: string,
    format: 'currency' | 'percent' | 'count',
    type: 'bar' | 'line' = 'bar',
  ): void {
    if (!el || !labels.length) return;
    this.observeChartSize(el);
    const chart = echarts.init(el);
    this.charts.push(chart);
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#20212b',
        borderColor: '#424451',
        textStyle: { color: '#f4f4f6' },
        valueFormatter: (value: unknown) => this.formatChartValue(value, format),
      },
      grid: { left: 16, right: 16, bottom: 42, top: 18, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: '#444' } },
        axisLabel: { color: '#aaa', rotate: labels.length > 9 ? 35 : 0 },
      },
      yAxis: {
        type: 'value',
        min: format === 'percent' ? 0 : undefined,
        max: format === 'percent' ? 100 : undefined,
        axisLabel: {
          color: '#aaa',
          formatter: (value: number) => this.formatChartValue(value, format),
        },
        splitLine: { lineStyle: { color: '#222' } },
      },
      series: [
        {
          name: seriesName,
          type,
          data: values,
          connectNulls: false,
          smooth: false,
          itemStyle: { color: '#dc2626', borderRadius: type === 'bar' ? [4, 4, 0, 0] : 0 },
          lineStyle: { color: '#dc2626', width: 3 },
          areaStyle: type === 'line' ? { color: 'rgba(220,38,38,.16)' } : undefined,
        },
      ],
    });
  }

  private renderPublisherTimeline(): void {
    const el = this.publisherTimelineChartEl()?.nativeElement;
    if (!el) return;
    const labels = Array.from(
      { length: this.yearTo() - this.yearFrom() + 1 },
      (_, index) => this.yearFrom() + index,
    ).flatMap((year) =>
      Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, '0')}/${year}`),
    );
    const rows = this.publisherReleaseMonths();
    if (!labels.length || !rows.length) return;
    this.observeChartSize(el);

    const totals = new Map<string, { id: string; name: string; count: number }>();
    const monthlyCounts = new Map<string, number>();
    for (const row of rows) {
      const publisher = totals.get(row.publisherId) ?? {
        id: row.publisherId,
        name: row.publisher,
        count: 0,
      };
      publisher.count += row.count;
      totals.set(row.publisherId, publisher);
      const monthKey = `${row.publisherId}:${row.year}-${row.month}`;
      monthlyCounts.set(monthKey, row.count);
    }
    const ordered = [...totals.values()].sort((left, right) => right.count - left.count);
    const selected = ordered.slice(0, 7);
    const selectedIds = new Set(selected.map((publisher) => publisher.id));
    const series = selected.map((publisher) => ({
      name: publisher.name,
      type: 'line' as const,
      showSymbol: false,
      smooth: false,
      data: labels.map((label) => {
        const [month, year] = label.split('/').map(Number);
        return monthlyCounts.get(`${publisher.id}:${year}-${month}`) ?? 0;
      }),
    }));
    const otherPublishers = ordered.filter((publisher) => !selectedIds.has(publisher.id));
    if (otherPublishers.length) {
      series.push({
        name: 'Demais editoras',
        type: 'line',
        showSymbol: false,
        smooth: false,
        data: labels.map((label) => {
          const [month, year] = label.split('/').map(Number);
          return rows
            .filter(
              (row) =>
                !selectedIds.has(row.publisherId) && row.year === year && row.month === month,
            )
            .reduce((sum, row) => sum + row.count, 0);
        }),
      });
    }

    const chart = echarts.init(el);
    this.charts.push(chart);
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#20212b',
        borderColor: '#424451',
        textStyle: { color: '#f4f4f6' },
        valueFormatter: (value: unknown) => this.formatChartValue(value, 'count'),
      },
      legend: { type: 'scroll', textStyle: { color: '#bbb' } },
      grid: { left: 16, right: 20, bottom: 56, top: 48, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        axisLabel: { color: '#aaa', rotate: labels.length > 24 ? 45 : 0, interval: 'auto' },
        axisLine: { lineStyle: { color: '#444' } },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: {
          color: '#aaa',
          formatter: (value: number) => this.formatChartValue(value, 'count'),
        },
        splitLine: { lineStyle: { color: '#222' } },
      },
      dataZoom: labels.length > 36 ? [{ type: 'inside' }, { type: 'slider', height: 16 }] : [],
      series: series.map((item, index) => ({
        ...item,
        lineStyle: {
          color: [
            '#f15b66',
            '#4e9fff',
            '#48c6a8',
            '#e4b455',
            '#b48cff',
            '#f08d47',
            '#71c6e2',
            '#aaa',
          ][index % 8],
          width: index === 0 ? 3 : 2,
        },
      })),
    });
  }

  private renderYearlyPrices(): void {
    const el = this.priceYearChartEl()?.nativeElement;
    if (!el) return;
    const labels = Array.from(
      { length: this.yearTo() - this.yearFrom() + 1 },
      (_, index) => this.yearFrom() + index,
    );
    const rows = this.pricesByYear();
    if (!labels.length || !rows.length) return;
    this.observeChartSize(el);
    const prices = new Map(rows.map((row) => [row.year, row]));
    const chart = echarts.init(el);
    this.charts.push(chart);
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#20212b',
        borderColor: '#424451',
        textStyle: { color: '#f4f4f6' },
        valueFormatter: (value: unknown) => this.formatChartValue(value, 'currency'),
      },
      legend: { textStyle: { color: '#bbb' } },
      grid: { left: 16, right: 20, bottom: 36, top: 42, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { color: '#aaa' },
        axisLine: { lineStyle: { color: '#444' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#aaa',
          formatter: (value: number) => this.formatChartValue(value, 'currency'),
        },
        splitLine: { lineStyle: { color: '#222' } },
      },
      series: [
        {
          name: 'Preço médio',
          type: 'line',
          data: labels.map((year) => prices.get(year)?.averagePrice ?? null),
          showSymbol: true,
          connectNulls: false,
          lineStyle: { color: '#dc2626', width: 3 },
          itemStyle: { color: '#dc2626' },
        },
        {
          name: 'Mediana',
          type: 'line',
          data: labels.map((year) => prices.get(year)?.medianPrice ?? null),
          showSymbol: true,
          connectNulls: false,
          lineStyle: { color: '#4e9fff', width: 2 },
          itemStyle: { color: '#4e9fff' },
        },
      ],
    });
  }

  private observeChartSize(el: HTMLDivElement): void {
    if (!this.resizeObserver && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        for (const chart of this.charts) chart.resize();
      });
    }
    this.resizeObserver?.observe(el);
  }

  private formatChartValue(value: unknown, format: 'currency' | 'percent' | 'count'): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 'Sem dados';
    if (format === 'currency') {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
        numericValue,
      );
    }
    if (format === 'percent')
      return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(numericValue)}%`;
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(numericValue);
  }
}
