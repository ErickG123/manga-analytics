import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AnalyticsService } from './analytics.service';
import { environment } from '../../../../environments/environment';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AnalyticsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AnalyticsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('deve buscar dados do overview analítico', async () => {
    const mockOverview = {
      totalMangas: 6,
      totalVolumes: 24,
      totalPublishers: 4,
      averagePrice: 40.5,
      pricedVolumes: 18,
      unpricedVolumes: 6,
      priceCoverage: 0.75,
      datedVolumes: 20,
      dateCoverage: 20 / 24,
      minPrice: 20,
      maxPrice: 100,
      medianPrice: 38,
      sampleSize: 18,
      priceBasis: 'Último preço registrado por volume.',
      releaseCount: 20,
    };

    const promise = service.getOverview();
    const req = httpTesting.expectOne(`${environment.apiUrl}/analytics/overview`);
    expect(req.request.method).toBe('GET');
    req.flush(mockOverview);

    const result = await promise;
    expect(result).toEqual(mockOverview);
  });

  it('aplica os filtros globais na consulta analítica', async () => {
    const promise = service.getOverview({
      yearFrom: 2024,
      yearTo: 2026,
      publisherId: 'pub-1',
      hasPrice: 'true',
    });
    const req = httpTesting.expectOne(
      (request) =>
        request.url === `${environment.apiUrl}/analytics/overview` &&
        request.params.get('yearFrom') === '2024',
    );
    expect(req.request.params.get('publisherId')).toBe('pub-1');
    expect(req.request.params.get('hasPrice')).toBe('true');
    req.flush({
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
      priceBasis: 'sem amostra',
      releaseCount: 0,
    });
    await promise;
  });

  it('normaliza indicadores ausentes sem mostrar valores vazios ou undefined', async () => {
    const promise = service.getOverview();
    const req = httpTesting.expectOne(`${environment.apiUrl}/analytics/overview`);
    req.flush({ totalMangas: 5, totalVolumes: 91 } as never);
    await expect(promise).resolves.toMatchObject({
      totalMangas: 5,
      totalVolumes: 91,
      totalPublishers: 0,
      pricedVolumes: 0,
      releaseCount: 0,
      averagePrice: null,
      medianPrice: null,
    });
  });

  it('deve fornecer links para download dos relatórios CSV', () => {
    expect(service.downloadReleasesCsvUrl()).toBe(
      `${environment.apiUrl}/reports/releases?format=csv`,
    );
    expect(service.downloadPricesCsvUrl()).toBe(`${environment.apiUrl}/reports/prices?format=csv`);
  });
});
