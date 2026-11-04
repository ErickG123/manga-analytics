import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  inject,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts';
import { AnalyticsService } from '../../services/analytics.service';
import type {
  AnalyticsOverview,
  PriceByManga,
  PriceByPublisher,
  ReleasesByMonth,
} from '../../services/analytics.service';

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CurrencyPipe],
  templateUrl: './analytics.page.html',
  styleUrl: './analytics.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsPageComponent implements OnInit {
  private readonly analyticsService = inject(AnalyticsService);

  readonly overview = signal<AnalyticsOverview>({
    totalMangas: 0,
    totalVolumes: 0,
    totalPublishers: 0,
    averagePrice: 0,
  });

  readonly pricesByManga = signal<PriceByManga[]>([]);
  readonly pricesByPublisher = signal<PriceByPublisher[]>([]);
  readonly releasesByMonth = signal<ReleasesByMonth[]>([]);

  readonly publisherChartEl = viewChild<ElementRef<HTMLDivElement>>('publisherChart');
  readonly releaseChartEl = viewChild<ElementRef<HTMLDivElement>>('releaseChart');

  ngOnInit() {
    void this.loadData();
  }

  async loadData() {
    const [ov, mPrices, pPrices, rMonth] = await Promise.all([
      this.analyticsService.getOverview(),
      this.analyticsService.getPricesByManga(),
      this.analyticsService.getPricesByPublisher(),
      this.analyticsService.getReleasesByMonth(),
    ]);

    this.overview.set(ov);
    this.pricesByManga.set(mPrices);
    this.pricesByPublisher.set(pPrices);
    this.releasesByMonth.set(rMonth);

    setTimeout(() => {
      this.initPublisherChart();
      this.initReleaseChart();
    }, 50);
  }

  private initPublisherChart() {
    const el = this.publisherChartEl()?.nativeElement;
    if (!el || !this.pricesByPublisher().length) return;

    const chart = echarts.init(el);
    const names = this.pricesByPublisher().map((p) => p.name);
    const values = this.pricesByPublisher().map((p) => p.averagePrice);

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const item = (params as { name: string; value: number }[])[0];
          return `${item.name}<br/>Preço Médio: <b>R$ ${item.value.toFixed(2)}</b>`;
        },
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: names,
        axisLine: { lineStyle: { color: '#444' } },
        axisLabel: { color: '#aaa' },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#444' } },
        splitLine: { lineStyle: { color: '#222' } },
        axisLabel: { color: '#aaa', formatter: 'R$ {value}' },
      },
      series: [
        {
          name: 'Preço Médio',
          type: 'bar',
          data: values,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#ef4444' },
              { offset: 1, color: '#991b1b' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    });
  }

  private initReleaseChart() {
    const el = this.releaseChartEl()?.nativeElement;
    if (!el || !this.releasesByMonth().length) return;

    const chart = echarts.init(el);
    const labels = this.releasesByMonth().map((r) => r.label);
    const counts = this.releasesByMonth().map((r) => r.count);

    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        formatter: '{b}: <b>{c} lançamentos</b>',
      },
      grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: '#444' } },
        axisLabel: { color: '#aaa' },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: '#444' } },
        splitLine: { lineStyle: { color: '#222' } },
        axisLabel: { color: '#aaa' },
      },
      series: [
        {
          name: 'Lançamentos',
          type: 'line',
          smooth: true,
          data: counts,
          lineStyle: { color: '#dc2626', width: 3 },
          itemStyle: { color: '#ef4444' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(220, 38, 38, 0.4)' },
              { offset: 1, color: 'rgba(220, 38, 38, 0.0)' },
            ]),
          },
        },
      ],
    });
  }

  downloadReleasesCsv() {
    window.open(this.analyticsService.downloadReleasesCsvUrl(), '_blank');
  }

  downloadPricesCsv() {
    window.open(this.analyticsService.downloadPricesCsvUrl(), '_blank');
  }
}
