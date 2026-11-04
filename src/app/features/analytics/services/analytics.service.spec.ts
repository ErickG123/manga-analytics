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
    };

    const promise = service.getOverview();
    const req = httpTesting.expectOne(`${environment.apiUrl}/analytics/overview`);
    expect(req.request.method).toBe('GET');
    req.flush(mockOverview);

    const result = await promise;
    expect(result).toEqual(mockOverview);
  });

  it('deve fornecer links para download dos relatórios CSV', () => {
    expect(service.downloadReleasesCsvUrl()).toBe(
      `${environment.apiUrl}/reports/releases?format=csv`,
    );
    expect(service.downloadPricesCsvUrl()).toBe(`${environment.apiUrl}/reports/prices?format=csv`);
  });
});
