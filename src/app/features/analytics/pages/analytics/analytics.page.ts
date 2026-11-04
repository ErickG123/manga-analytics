import { CurrencyPipe, PercentPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  inject,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as echarts from 'echarts';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import { AnalyticsService } from '../../services/analytics.service';
import type {
  AnalyticsFilters,
  AnalyticsOverview,
  PriceBand,
  PriceByPublisher,
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
  priceBasis: 'Último preço registrado por volume.',
  releaseCount: 0,
};

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CurrencyPipe, PercentPipe, FormsModule],
  templateUrl: './analytics.page.html',
  styleUrl: './analytics.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsPageComponent implements OnInit {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly repository = inject(MANGA_REPOSITORY);
  private readonly charts: echarts.ECharts[] = [];
  readonly overview = signal<AnalyticsOverview>(EMPTY_OVERVIEW);
  readonly pricesByPublisher = signal<PriceByPublisher[]>([]);
  readonly releasesByMonth = signal<ReleasesByMonth[]>([]);
  readonly releasesByYear = signal<ReleasesByYear[]>([]);
  readonly priceBands = signal<PriceBand[]>([]);
  readonly publishers = signal<{ id: string; name: string; slug: string }[]>([]);
  readonly categories = signal<string[]>([]);
  readonly yearFrom = signal(new Date().getFullYear() - 4);
  readonly yearTo = signal(new Date().getFullYear());
  readonly publisherId = signal('');
  readonly category = signal('');
  readonly status = signal('');
  readonly hasPrice = signal('');
  readonly manga = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly publisherChartEl = viewChild<ElementRef<HTMLDivElement>>('publisherChart');
  readonly coverageChartEl = viewChild<ElementRef<HTMLDivElement>>('coverageChart');
  readonly releaseChartEl = viewChild<ElementRef<HTMLDivElement>>('releaseChart');
  readonly yearChartEl = viewChild<ElementRef<HTMLDivElement>>('yearChart');
  readonly bandsChartEl = viewChild<ElementRef<HTMLDivElement>>('bandsChart');
  readonly volumeChartEl = viewChild<ElementRef<HTMLDivElement>>('volumeChart');
  readonly mangaChartEl = viewChild<ElementRef<HTMLDivElement>>('mangaChart');

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

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const filters: AnalyticsFilters = {
      yearFrom: this.yearFrom(),
      yearTo: this.yearTo(),
      publisherId: this.publisherId() || undefined,
      category: this.category() || undefined,
      status: this.status() || undefined,
      hasPrice: this.hasPrice() || undefined,
      manga: this.manga() || undefined,
    };
    try {
      const [overview, publishers, months, years, bands] = await Promise.all([
        this.analyticsService.getOverview(filters),
        this.analyticsService.getPricesByPublisher(filters),
        this.analyticsService.getReleasesByMonth(filters),
        this.analyticsService.getReleasesByYear(filters),
        this.analyticsService.getPriceBands(filters),
      ]);
      this.overview.set(overview);
      this.pricesByPublisher.set(publishers);
      this.releasesByMonth.set(months);
      this.releasesByYear.set(years);
      this.priceBands.set(bands);
      setTimeout(() => this.renderCharts(), 0);
    } catch {
      this.error.set('Não foi possível carregar as análises.');
    } finally {
      this.loading.set(false);
    }
  }

  filtersChanged(): void {
    void this.loadData();
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
      manga: this.manga() || undefined,
    };
  }

  private renderCharts(): void {
    for (const chart of this.charts.splice(0)) chart.dispose();
    this.renderBar(
      this.publisherChartEl()?.nativeElement,
      this.pricesByPublisher().map((row) => row.name),
      this.pricesByPublisher().map((row) => row.averagePrice),
      'Preço médio (R$)',
      'currency',
    );
    this.renderBar(
      this.coverageChartEl()?.nativeElement,
      this.pricesByPublisher().map((row) => row.name),
      this.pricesByPublisher().map((row) =>
        row.priceCoverage === null ? 0 : row.priceCoverage * 100,
      ),
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
    this.renderBar(
      this.volumeChartEl()?.nativeElement,
      this.pricesByPublisher().map((row) => row.name),
      this.pricesByPublisher().map((row) => row.volumesCount),
      'Volumes',
      'count',
    );
    this.renderBar(
      this.mangaChartEl()?.nativeElement,
      this.pricesByPublisher().map((row) => row.name),
      this.pricesByPublisher().map((row) => row.mangaCount),
      'Obras',
      'count',
    );
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
    const chart = echarts.init(el);
    this.charts.push(chart);
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
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
          formatter:
            format === 'currency' ? 'R$ {value}' : format === 'percent' ? '{value}%' : '{value}',
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
}
