import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { CalendarService } from './calendar.service';
import { environment } from '../../../../environments/environment';

describe('CalendarService', () => {
  let service: CalendarService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CalendarService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CalendarService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('deve obter a lista de lançamentos via GET /releases', async () => {
    const mockData = [
      {
        id: 'vol-1',
        slug: 'one-piece',
        title: 'One Piece',
        publisher: 'Panini',
        number: 1,
        date: '15/04/2026',
        precision: 'day' as const,
        year: 2026,
        month: 4,
        day: 15,
        status: 'released' as const,
        price: 39.9,
      },
    ];
    const mockResult = {
      data: mockData,
      pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
    };

    const promise = service.getReleases({ year: 2026, publisher: 'panini' });

    const req = httpTesting.expectOne(
      (r) => r.url === `${environment.apiUrl}/releases` && r.params.has('year'),
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('publisher')).toBe('panini');
    expect(req.request.params.get('limit')).toBe('24');
    expect(req.request.params.get('page')).toBeNull();
    req.flush(mockResult);

    const result = await promise;
    expect(result).toEqual(mockResult);
  });
});
