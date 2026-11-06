import { TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import { AnalyticsService } from '../../services/analytics.service';
import { AnalyticsPageComponent } from './analytics.page';

describe('AnalyticsPageComponent', () => {
  registerLocaleData(localePt, 'pt-BR');

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AnalyticsPageComponent],
      providers: [
        {
          provide: MANGA_REPOSITORY,
          useValue: { getFacets: async () => ({ publishers: [], categories: [], statuses: [] }) },
        },
        {
          provide: AnalyticsService,
          useValue: {
            getOverview: async () => ({
              totalMangas: 12,
              totalVolumes: 3456,
              totalPublishers: 4,
              averagePrice: 31.89,
              pricedVolumes: 1800,
              unpricedVolumes: 1656,
              priceCoverage: 1800 / 3456,
              datedVolumes: 1700,
              dateCoverage: 1700 / 3456,
              minPrice: 10,
              maxPrice: 99,
              medianPrice: 29.9,
              sampleSize: 1800,
              priceBasis: 'Preço de capa no lançamento.',
              releaseCount: 1700,
            }),
            getPricesByPublisher: async () => [],
            getPricesByManga: async () => [],
            getReleasesByMonth: async () => [],
            getReleaseTimelineByPublisher: async () => [],
            getReleasesByYear: async () => [],
            getPricesByYear: async () => [],
            getPriceBands: async () => [],
            downloadReleasesCsvUrl: () => '/reports/releases?format=csv',
            downloadPricesCsvUrl: () => '/reports/prices?format=csv',
          },
        },
      ],
    });
  });

  afterEach(() => document.body.classList.remove('chart-fullscreen-open'));

  it('opens a chart in fullscreen and closes it again', () => {
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    const component = fixture.componentInstance;

    component.toggleFullscreen('prices-year');

    expect(component.fullscreenChart()).toBe('prices-year');
    expect(document.body.classList.contains('chart-fullscreen-open')).toBe(true);

    component.toggleFullscreen('prices-year');

    expect(component.fullscreenChart()).toBeNull();
    expect(document.body.classList.contains('chart-fullscreen-open')).toBe(false);
    fixture.destroy();
  });

  it('closes fullscreen when Escape is handled', () => {
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    const component = fixture.componentInstance;
    component.toggleFullscreen('publisher-timeline');

    component.closeFullscreen();

    expect(component.fullscreenChart()).toBeNull();
    expect(document.body.classList.contains('chart-fullscreen-open')).toBe(false);
    fixture.destroy();
  });

  it('renders localized big numbers and explanations for the analytics', async () => {
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.loadData();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('3.456');
    expect(content).toContain('31,89');
    expect(content).toContain('Preço de capa no lançamento.');
    expect(content).toContain('Não há lançamentos mensais conhecidos');
    fixture.destroy();
  });
});
