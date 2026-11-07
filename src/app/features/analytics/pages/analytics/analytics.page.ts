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
  EditionsByFormat,
  PriceBand,
  PriceByManga,
  PriceByPublisher,
  PriceByYear,
  PublisherReleaseMonth,
  ReleaseYearRange,
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
  private readonly fallbackYearFrom = new Date().getFullYear() - 10;
  private readonly fallbackYearTo = new Date().getFullYear();

  readonly overview = signal<AnalyticsOverview>(EMPTY_OVERVIEW);
  readonly pricesByPublisher = signal<PriceByPublisher[]>([]);
  readonly pricesByManga = signal<PriceByManga[]>([]);
  readonly pricesByYear = signal<PriceByYear[]>([]);
  readonly releasesByMonth = signal<ReleasesByMonth[]>([]);
  readonly publisherReleaseMonths = signal<PublisherReleaseMonth[]>([]);
  readonly releasesByYear = signal<ReleasesByYear[]>([]);
  readonly priceBands = signal<PriceBand[]>([]);
  readonly editionsByFormat = signal<EditionsByFormat[]>([]);
  readonly publishers = signal<{ id: string; name: string; slug: string }[]>([]);
  readonly categories = signal<string[]>([]);
  readonly yearFrom = signal(this.fallbackYearFrom);
  readonly yearTo = signal(this.fallbackYearTo);
  readonly publisherId = signal('');
  readonly category = signal('');
  readonly status = signal('');
  readonly hasPrice = signal('');
  readonly formatType = signal('');
  readonly manga = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly fullscreenChart = signal<string | null>(null);

  readonly monthlyYearFilter = signal<number | null>(null);
  readonly timelinePublisherFilter = signal<string>('');

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
  readonly formatOptions = [
    { label: 'Todos os formatos', value: '' },
    { label: 'Regular', value: 'regular' },
    { label: '2 em 1', value: 'two_in_one' },
    { label: '3 em 1', value: 'three_in_one' },
    { label: 'Omnibus', value: 'omnibus' },
    { label: 'Edição definitiva', value: 'definitive' },
    { label: 'Deluxe', value: 'deluxe' },
    { label: 'Outro formato', value: 'other' },
    { label: 'Volume convencional', value: 'unknown' },
  ];

  readonly formatSummary = computed(() => {
    const rows = this.editionsByFormat();
    const editions = rows.reduce((sum, row) => sum + row.editionsCount, 0);
    const unknown = rows.find((row) => row.formatType === 'unknown')?.editionsCount ?? 0;
    return {
      editions,
      unknown,
      identified: Math.max(0, editions - unknown),
      coverage: editions ? Math.max(0, editions - unknown) / editions : null,
    };
  });

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

  readonly availableMonthlyYears = computed(() => {
    const years = new Set(
      this.releasesByMonth()
        .filter((m) => m.count > 0)
        .map((m) => m.year),
    );
    return Array.from(years).sort((a, b) => b - a);
  });

  readonly monthlyYearOptions = computed(() => [
    { label: 'Todos os anos', value: null },
    ...this.availableMonthlyYears().map((year) => ({ label: `Ano ${year}`, value: year })),
  ]);

  readonly activeMonthlyReleases = computed(() => {
    const all = this.releasesByMonth();
    const selectedYear = this.monthlyYearFilter();
    if (selectedYear !== null) {
      return all.filter((m) => m.year === selectedYear);
    }
    const firstIdx = all.findIndex((m) => m.count > 0);
    if (firstIdx === -1) return [];
    let lastIdx = all.length - 1;
    while (lastIdx > firstIdx && all[lastIdx].count === 0) {
      lastIdx--;
    }
    return all.slice(firstIdx, lastIdx + 1);
  });

  readonly timelinePublisherOptions = computed(() => {
    const rows = this.publisherReleaseMonths();
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const r of rows) {
      const cur = map.get(r.publisherId) ?? { id: r.publisherId, name: r.publisher, count: 0 };
      cur.count += r.count;
      map.set(r.publisherId, cur);
    }
    const list = Array.from(map.values()).sort((a, b) => b.count - a.count);
    return [
      { label: 'Todas as principais (comparar)', value: '' },
      ...list.slice(0, 10).map((p) => ({ label: `${p.name} (${p.count} vol.)`, value: p.id })),
    ];
  });

  readonly hasYearlyPrices = computed(() => this.yearlyPriceRows().length > 0);

  readonly yearlyPriceRows = computed(() =>
    [...this.pricesByYear()]
      .filter(
        (year) => year.sampleSize > 0 && (year.averagePrice !== null || year.medianPrice !== null),
      )
      .sort((left, right) => left.year - right.year),
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
  readonly formatChartEl = viewChild<ElementRef<HTMLDivElement>>('formatChart');

  ngOnInit(): void {
    void this.initializeFilters();
  }

  private async initializeFilters(): Promise<void> {
    const [facets, yearRange] = await Promise.all([
      this.repository.getFacets().catch(() => null),
      this.analyticsService.getReleaseYearRange().catch(() => null),
    ]);
    if (facets) {
      this.publishers.set(facets.publishers);
      this.categories.set(facets.categories);
    }
    if (yearRange) this.applyYearRange(yearRange);
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

  exportChart(chartId: string): void {
    const chartElements: Record<string, ElementRef<HTMLDivElement> | undefined> = {
      'publisher-price': this.publisherChartEl(),
      'publisher-coverage': this.coverageChartEl(),
      'releases-month': this.releaseChartEl(),
      'publisher-timeline': this.publisherTimelineChartEl(),
      'releases-year': this.yearChartEl(),
      'edition-formats': this.formatChartEl(),
      'prices-year': this.priceYearChartEl(),
      'price-bands': this.bandsChartEl(),
    };
    const element = chartElements[chartId]?.nativeElement;
    const chart = element ? echarts.getInstanceByDom(element) : undefined;
    if (!chart) return;

    const image = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#101117',
    });
    const date = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = image;
    link.download = `manga-atlas-${chartId}-${date}.png`;
    link.click();
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
      const [
        overview,
        publishers,
        mangas,
        months,
        publisherMonths,
        years,
        pricesYear,
        bands,
        formats,
      ] = await Promise.all([
        this.analyticsService.getOverview(filters),
        this.analyticsService.getPricesByPublisher(filters),
        this.analyticsService.getPricesByManga(filters),
        this.analyticsService.getReleasesByMonth(filters),
        this.analyticsService.getReleaseTimelineByPublisher(filters),
        this.analyticsService.getReleasesByYear(filters),
        this.analyticsService.getPricesByYear(filters),
        this.analyticsService.getPriceBands(filters),
        this.analyticsService.getEditionsByFormat(filters),
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
      this.editionsByFormat.set(formats);
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
      this.editionsByFormat.set([]);
      this.chartTimer = setTimeout(() => this.renderCharts(), 0);
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }

  filtersChanged(): void {
    this.scheduleFilterLoad(true);
  }

  yearRangeChanged(): void {
    this.scheduleFilterLoad(false);
  }

  setMonthlyYearFilter(year: number | null): void {
    this.monthlyYearFilter.set(year);
    this.renderMonthlyReleasesChart();
  }

  setTimelinePublisherFilter(publisherId: string): void {
    this.timelinePublisherFilter.set(publisherId);
    this.renderPublisherTimeline();
  }

  private scheduleFilterLoad(refreshYearRange: boolean): void {
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.requestId += 1;
    this.loading.set(true);
    this.error.set('');
    this.filterTimer = setTimeout(() => {
      if (refreshYearRange) void this.refreshYearRangeAndLoad();
      else void this.loadData();
    }, 350);
  }

  private async refreshYearRangeAndLoad(): Promise<void> {
    const requestId = this.requestId;
    try {
      const range = await this.analyticsService.getReleaseYearRange(this.filters());
      if (requestId !== this.requestId) return;
      this.applyYearRange(range);
    } catch {
      if (requestId === this.requestId) {
        this.yearFrom.set(this.fallbackYearFrom);
        this.yearTo.set(this.fallbackYearTo);
      }
    }
    if (requestId === this.requestId) void this.loadData();
  }

  private applyYearRange(range: ReleaseYearRange): void {
    const currentYear = new Date().getFullYear();
    const maxYear = Math.min(2100, Math.max(range.maxYear ?? currentYear, currentYear));
    const minYear = Math.max(1900, Math.min(range.minYear ?? maxYear - 10, maxYear));
    this.yearTo.set(Math.min(2100, maxYear));
    this.yearFrom.set(Math.max(minYear, maxYear - 19));
  }

  clearFilters(): void {
    this.yearFrom.set(this.fallbackYearFrom);
    this.yearTo.set(this.fallbackYearTo);
    this.publisherId.set('');
    this.category.set('');
    this.status.set('');
    this.hasPrice.set('');
    this.formatType.set('');
    this.manga.set('');
    this.monthlyYearFilter.set(null);
    this.timelinePublisherFilter.set('');
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
      formatType: this.formatType() || undefined,
    };
  }

  private renderCharts(): void {
    for (const chart of this.charts.splice(0)) chart.dispose();
    this.renderPublisherPricesChart();
    this.renderPublisherCoverageChart();
    this.renderMonthlyReleasesChart();
    this.renderYearReleasesChart();
    this.renderPriceBandsChart();
    this.renderPublisherTimeline();
    this.renderYearlyPrices();
    this.renderFormatChart();
  }

  private renderPublisherPricesChart(): void {
    const el = this.publisherChartEl()?.nativeElement;
    const publishers = [...this.topPublishers()].filter((p) => p.averagePrice !== null).reverse();
    if (!el || !publishers.length) return;
    this.observeChartSize(el);
    const chart = echarts.init(el);
    this.charts.push(chart);

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#20212b',
        borderColor: '#424451',
        textStyle: { color: '#f4f4f6' },
        formatter: (params: unknown) => {
          const item = (params as { dataIndex: number }[])[0];
          const pub = publishers[item.dataIndex];
          if (!pub) return '';
          return `
            <div style="font-weight:700;margin-bottom:4px;color:#fff;">${pub.name}</div>
            <div style="color:#ef737b;">Preço médio: <strong>${this.formatChartValue(pub.averagePrice, 'currency')}</strong></div>
            <div style="color:#aaa;font-size:12px;margin-top:2px;">Com preço: <strong>${pub.sampleSize}</strong> de <strong>${pub.volumesCount}</strong> volumes</div>
            <div style="color:#aaa;font-size:12px;">Cobertura: <strong>${pub.priceCoverage !== null ? (pub.priceCoverage * 100).toFixed(1) + '%' : 'Sem dados'}</strong></div>
          `;
        },
      },
      grid: { left: 16, right: 28, bottom: 20, top: 20, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: {
          color: '#aaa',
          formatter: (value: number) => this.formatChartValue(value, 'currency'),
        },
        splitLine: { lineStyle: { color: '#252632' } },
      },
      yAxis: {
        type: 'category',
        data: publishers.map((p) => p.name),
        axisLine: { lineStyle: { color: '#444' } },
        axisLabel: {
          color: '#eaeaf0',
          fontSize: 12,
          fontWeight: 500,
        },
      },
      series: [
        {
          name: 'Preço médio (R$)',
          type: 'bar',
          data: publishers.map((p) => p.averagePrice),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#dc2626' },
              { offset: 1, color: '#ef737b' },
            ]),
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    });
  }

  private renderPublisherCoverageChart(): void {
    const el = this.coverageChartEl()?.nativeElement;
    const publishers = [...this.topPublishers()].filter((p) => p.priceCoverage !== null).reverse();
    if (!el || !publishers.length) return;
    this.observeChartSize(el);
    const chart = echarts.init(el);
    this.charts.push(chart);

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: '#20212b',
        borderColor: '#424451',
        textStyle: { color: '#f4f4f6' },
        formatter: (params: unknown) => {
          const item = (params as { dataIndex: number }[])[0];
          const pub = publishers[item.dataIndex];
          if (!pub) return '';
          return `
            <div style="font-weight:700;margin-bottom:4px;color:#fff;">${pub.name}</div>
            <div style="color:#34d399;">Cobertura: <strong>${(pub.priceCoverage! * 100).toFixed(1)}%</strong></div>
            <div style="color:#aaa;font-size:12px;margin-top:2px;">Com preço: <strong>${pub.sampleSize}</strong> de <strong>${pub.volumesCount}</strong> volumes</div>
          `;
        },
      },
      grid: { left: 16, right: 36, bottom: 20, top: 20, containLabel: true },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: {
          color: '#aaa',
          formatter: '{value}%',
        },
        splitLine: { lineStyle: { color: '#252632' } },
      },
      yAxis: {
        type: 'category',
        data: publishers.map((p) => p.name),
        axisLine: { lineStyle: { color: '#444' } },
        axisLabel: {
          color: '#eaeaf0',
          fontSize: 12,
          fontWeight: 500,
        },
      },
      series: [
        {
          name: 'Cobertura (%)',
          type: 'bar',
          data: publishers.map((p) => (p.priceCoverage === null ? null : p.priceCoverage * 100)),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#059669' },
              { offset: 1, color: '#34d399' },
            ]),
            borderRadius: [0, 4, 4, 0],
          },
        },
      ],
    });
  }

  private renderMonthlyReleasesChart(): void {
    const el = this.releaseChartEl()?.nativeElement;
    const months = this.activeMonthlyReleases();
    if (!el || !months.length) return;
    this.observeChartSize(el);
    let chart = echarts.getInstanceByDom(el);
    if (!chart) {
      chart = echarts.init(el);
      this.charts.push(chart);
    }

    const labels = months.map((m) => m.label);
    const values = months.map((m) => m.count);

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#20212b',
        borderColor: '#424451',
        textStyle: { color: '#f4f4f6' },
        formatter: (params: unknown) => {
          const item = (params as { dataIndex: number }[])[0];
          const m = months[item.dataIndex];
          if (!m) return '';
          return `
            <div style="font-weight:700;margin-bottom:4px;color:#fff;">Mês: ${m.label}</div>
            <div style="color:#ef737b;">Lançamentos informados: <strong>${m.count}</strong> volumes</div>
          `;
        },
      },
      grid: {
        left: 16,
        right: 20,
        bottom: labels.length > 24 ? 64 : 40,
        top: 24,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: '#444' } },
        axisLabel: {
          color: '#aaa',
          rotate: labels.length > 16 ? 45 : 0,
          interval: labels.length > 36 ? 'auto' : 0,
        },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: {
          color: '#aaa',
          formatter: (val: number) => this.formatChartValue(val, 'count'),
        },
        splitLine: { lineStyle: { color: '#252632' } },
      },
      dataZoom:
        labels.length > 24 ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8 }] : [],
      series: [
        {
          name: 'Lançamentos',
          type: 'line',
          data: values,
          connectNulls: false,
          smooth: true,
          itemStyle: { color: '#ef737b' },
          lineStyle: { color: '#ef737b', width: 2.5 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(239, 115, 123, 0.28)' },
              { offset: 1, color: 'rgba(239, 115, 123, 0.02)' },
            ]),
          },
        },
      ],
    });
  }

  private renderPublisherTimeline(): void {
    const el = this.publisherTimelineChartEl()?.nativeElement;
    if (!el) return;
    const allLabels = Array.from(
      { length: this.yearTo() - this.yearFrom() + 1 },
      (_, index) => this.yearFrom() + index,
    ).flatMap((year) =>
      Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, '0')}/${year}`),
    );
    const rows = this.publisherReleaseMonths();
    if (!allLabels.length || !rows.length) return;
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
    const selectedPublisherFilter = this.timelinePublisherFilter();

    let seriesToRender: {
      name: string;
      type: 'line';
      showSymbol: boolean;
      smooth: boolean;
      data: number[];
      lineStyle?: { color: string; width: number };
    }[] = [];

    const colors = [
      '#ef737b',
      '#4e9fff',
      '#34d399',
      '#fbbf24',
      '#a78bfa',
      '#f97316',
      '#38bdf8',
      '#94a3b8',
    ];

    if (selectedPublisherFilter) {
      const targetPub = totals.get(selectedPublisherFilter);
      if (targetPub) {
        seriesToRender.push({
          name: targetPub.name,
          type: 'line',
          showSymbol: true,
          smooth: true,
          data: allLabels.map((label) => {
            const [month, year] = label.split('/').map(Number);
            return monthlyCounts.get(`${targetPub.id}:${year}-${month}`) ?? 0;
          }),
          lineStyle: { color: '#ef737b', width: 3 },
        });
      }
    } else {
      const top7 = ordered.slice(0, 7);
      const top7Ids = new Set(top7.map((p) => p.id));
      seriesToRender = top7.map((publisher, idx) => ({
        name: publisher.name,
        type: 'line' as const,
        showSymbol: false,
        smooth: true,
        data: allLabels.map((label) => {
          const [month, year] = label.split('/').map(Number);
          return monthlyCounts.get(`${publisher.id}:${year}-${month}`) ?? 0;
        }),
        lineStyle: { color: colors[idx % colors.length], width: idx === 0 ? 3 : 2 },
      }));

      const others = ordered.filter((p) => !top7Ids.has(p.id));
      if (others.length) {
        seriesToRender.push({
          name: 'Demais editoras',
          type: 'line',
          showSymbol: false,
          smooth: true,
          data: allLabels.map((label) => {
            const [month, year] = label.split('/').map(Number);
            return rows
              .filter((r) => !top7Ids.has(r.publisherId) && r.year === year && r.month === month)
              .reduce((sum, r) => sum + r.count, 0);
          }),
          lineStyle: { color: '#64748b', width: 1.5 },
        });
      }
    }

    let chart = echarts.getInstanceByDom(el);
    if (!chart) {
      chart = echarts.init(el);
      this.charts.push(chart);
    }

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#20212b',
        borderColor: '#424451',
        textStyle: { color: '#f4f4f6' },
        valueFormatter: (value: unknown) => this.formatChartValue(value, 'count'),
      },
      legend: {
        type: 'scroll',
        textStyle: { color: '#bbb' },
        pageTextStyle: { color: '#bbb' },
        pageIconColor: '#ef737b',
        pageIconInactiveColor: '#555',
      },
      grid: { left: 16, right: 20, bottom: 64, top: 48, containLabel: true },
      xAxis: {
        type: 'category',
        data: allLabels,
        boundaryGap: false,
        axisLabel: { color: '#aaa', rotate: allLabels.length > 24 ? 45 : 0, interval: 'auto' },
        axisLine: { lineStyle: { color: '#444' } },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: {
          color: '#aaa',
          formatter: (value: number) => this.formatChartValue(value, 'count'),
        },
        splitLine: { lineStyle: { color: '#252632' } },
      },
      dataZoom:
        allLabels.length > 24
          ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8 }]
          : [],
      series: seriesToRender,
    });
  }

  private renderYearReleasesChart(): void {
    this.renderBar(
      this.yearChartEl()?.nativeElement,
      this.releasesByYear().map((row) => String(row.year)),
      this.releasesByYear().map((row) => row.count),
      'Lançamentos',
      'count',
    );
  }

  private renderPriceBandsChart(): void {
    this.renderBar(
      this.bandsChartEl()?.nativeElement,
      this.priceBands().map((row) => row.band),
      this.priceBands().map((row) => row.count),
      'Volumes',
      'count',
    );
  }

  private renderFormatChart(): void {
    this.renderBar(
      this.formatChartEl()?.nativeElement,
      this.editionsByFormat().map((row) => row.label),
      this.editionsByFormat().map((row) => row.editionsCount),
      'Publicações',
      'count',
    );
  }

  private renderYearlyPrices(): void {
    const el = this.priceYearChartEl()?.nativeElement;
    if (!el) return;
    const rows = this.yearlyPriceRows();
    const labels = rows.map((row) => row.year);
    if (!labels.length || !rows.length) return;
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
        formatter: (params: unknown) => {
          const items = params as { seriesName: string; value: number; dataIndex: number }[];
          const row = rows[items[0]?.dataIndex ?? 0];
          let out = `<div style="font-weight:700;margin-bottom:6px;color:#fff;">Ano de lançamento: ${row?.year}</div>`;
          for (const it of items) {
            const color = it.seriesName === 'Preço médio' ? '#ef737b' : '#38bdf8';
            out += `<div style="color:${color};margin-bottom:2px;">${it.seriesName}: <strong>${this.formatChartValue(it.value, 'currency')}</strong></div>`;
          }
          if (row) {
            out += `<div style="color:#aaa;font-size:12px;margin-top:4px;">Amostra: <strong>${row.sampleSize}</strong> com preço (${row.volumesCount} no total)</div>`;
          }
          return out;
        },
      },
      legend: { textStyle: { color: '#bbb' } },
      grid: { left: 16, right: 24, bottom: 36, top: 42, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { color: '#aaa', fontSize: 12 },
        axisLine: { lineStyle: { color: '#444' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#aaa',
          formatter: (value: number) => this.formatChartValue(value, 'currency'),
        },
        splitLine: { lineStyle: { color: '#252632' } },
      },
      series: [
        {
          name: 'Preço médio',
          type: 'line',
          data: rows.map((row) => row.averagePrice),
          showSymbol: true,
          symbolSize: 7,
          connectNulls: false,
          lineStyle: { color: '#ef737b', width: 3 },
          itemStyle: { color: '#ef737b' },
        },
        {
          name: 'Mediana',
          type: 'line',
          data: rows.map((row) => row.medianPrice),
          showSymbol: true,
          symbolSize: 6,
          connectNulls: false,
          lineStyle: { color: '#38bdf8', width: 2.5 },
          itemStyle: { color: '#38bdf8' },
        },
      ],
    });
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
        splitLine: { lineStyle: { color: '#252632' } },
      },
      series: [
        {
          name: seriesName,
          type,
          data: values,
          connectNulls: false,
          smooth: false,
          itemStyle: { color: '#ef737b', borderRadius: type === 'bar' ? [4, 4, 0, 0] : 0 },
          lineStyle: { color: '#ef737b', width: 3 },
          areaStyle: type === 'line' ? { color: 'rgba(239, 115, 123, 0.16)' } : undefined,
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
