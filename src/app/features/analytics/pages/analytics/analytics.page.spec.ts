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
            getReleaseYearRange: async () => ({ minYear: 1990, maxYear: 2026 }),
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
            getEditionsByFormat: async () => [],
            getPricesByFormat: async () => [],
            getPricesByPage: async () => [],
            getObservedPricesByMonth: async () => [],
            getComparableEditionPrices: async () => [],
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

  it('defaults to the latest 20-year window available from actual release dates', async () => {
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fixture.componentInstance.yearFrom()).toBe(2007);
    expect(fixture.componentInstance.yearTo()).toBe(2026);
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

  it('adds a PNG export action for each chart', async () => {
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll(
      'button[aria-label="Exportar gráfico como imagem"]',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(10);
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

  it('keeps years without known prices out of the price trend while preserving their volume counts', () => {
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    const component = fixture.componentInstance;
    component.pricesByYear.set([
      { year: 2025, averagePrice: 49.9, medianPrice: 47.9, sampleSize: 4, volumesCount: 5 },
      { year: 2026, averagePrice: null, medianPrice: null, sampleSize: 0, volumesCount: 12 },
      { year: 2027, averagePrice: 52, medianPrice: 50, sampleSize: 2, volumesCount: 3 },
    ]);

    expect(component.yearlyPriceRows().map((row) => row.year)).toEqual([2025, 2027]);
    expect(component.pricesByYear()[1].volumesCount).toBe(12);
    fixture.destroy();
  });

  it('keeps publication, work, and volume totals distinct by format', () => {
    const fixture = TestBed.createComponent(AnalyticsPageComponent);
    const component = fixture.componentInstance;
    component.editionsByFormat.set([
      {
        formatType: 'unknown',
        label: 'Volume convencional',
        editionsCount: 922,
        mangaCount: 921,
        volumesCount: 6158,
      },
    ]);

    expect(component.formatSummary().editions).toBe(922);
    expect(component.editionsByFormat()[0].mangaCount).toBe(921);
    expect(component.editionsByFormat()[0].volumesCount).toBe(6158);
    expect(component.formatOptions).toContainEqual({ label: 'Box', value: 'box_set' });
    expect(component.formatOptions).toContainEqual({
      label: 'Edição digital',
      value: 'digital_edition',
    });
    fixture.destroy();
  });
});
