import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type {
  AnalyticsFilters,
  AnalyticsOverview,
  ComparableEditionPrice,
  EditionsByFormat,
  ObservedPriceMonth,
  PriceBand,
  PriceByFormat,
  PriceByManga,
  PriceByPublisher,
  PricePerPagePublisher,
  PriceByYear,
  PublisherReleaseMonth,
  ReleaseYearRange,
  ReleasesByMonth,
  ReleasesByYear,
} from '../models/analytics.model';

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

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  async getOverview(filters?: AnalyticsFilters): Promise<AnalyticsOverview> {
    const response = await firstValueFrom(
      this.http.get<AnalyticsOverview>(`${this.baseUrl}/analytics/overview`, {
        params: this.toParams(filters),
      }),
    );
    return {
      totalMangas: response.totalMangas ?? 0,
      totalVolumes: response.totalVolumes ?? 0,
      totalPublishers: response.totalPublishers ?? 0,
      averagePrice: response.averagePrice ?? null,
      pricedVolumes: response.pricedVolumes ?? 0,
      unpricedVolumes: response.unpricedVolumes ?? 0,
      priceCoverage: response.priceCoverage ?? null,
      datedVolumes: response.datedVolumes ?? 0,
      dateCoverage: response.dateCoverage ?? null,
      minPrice: response.minPrice ?? null,
      maxPrice: response.maxPrice ?? null,
      medianPrice: response.medianPrice ?? null,
      sampleSize: response.sampleSize ?? 0,
      priceBasis: response.priceBasis ?? EMPTY_OVERVIEW.priceBasis,
      releaseCount: response.releaseCount ?? 0,
    };
  }

  async getEditionsByFormat(filters?: AnalyticsFilters): Promise<EditionsByFormat[]> {
    return await firstValueFrom(
      this.http.get<EditionsByFormat[]>(`${this.baseUrl}/analytics/editions/by-format`, {
        params: this.toParams(filters),
      }),
    );
  }

  async getPricesByManga(filters?: AnalyticsFilters): Promise<PriceByManga[]> {
    return await firstValueFrom(
      this.http.get<PriceByManga[]>(`${this.baseUrl}/analytics/prices/by-manga`, {
        params: this.toParams(filters),
      }),
    );
  }

  async getPricesByPublisher(filters?: AnalyticsFilters): Promise<PriceByPublisher[]> {
    return await firstValueFrom(
      this.http.get<PriceByPublisher[]>(`${this.baseUrl}/analytics/prices/by-publisher`, {
        params: this.toParams(filters),
      }),
    );
  }

  async getPricesByFormat(filters?: AnalyticsFilters): Promise<PriceByFormat[]> {
    return await firstValueFrom(
      this.http.get<PriceByFormat[]>(`${this.baseUrl}/analytics/prices/by-format`, {
        params: this.toParams(filters),
      }),
    );
  }

  async getPricesByPage(filters?: AnalyticsFilters): Promise<PricePerPagePublisher[]> {
    return await firstValueFrom(
      this.http.get<PricePerPagePublisher[]>(`${this.baseUrl}/analytics/prices/by-page`, {
        params: this.toParams(filters),
      }),
    );
  }

  async getObservedPricesByMonth(filters?: AnalyticsFilters): Promise<ObservedPriceMonth[]> {
    return await firstValueFrom(
      this.http.get<ObservedPriceMonth[]>(`${this.baseUrl}/analytics/prices/observed-by-month`, {
        params: this.toParams(filters),
      }),
    );
  }

  async getComparableEditionPrices(filters?: AnalyticsFilters): Promise<ComparableEditionPrice[]> {
    if (!filters?.manga?.trim()) return [];
    return await firstValueFrom(
      this.http.get<ComparableEditionPrice[]>(
        `${this.baseUrl}/analytics/prices/comparable-editions`,
        { params: this.toParams(filters) },
      ),
    );
  }

  async getReleasesByMonth(filters?: AnalyticsFilters): Promise<ReleasesByMonth[]> {
    return await firstValueFrom(
      this.http.get<ReleasesByMonth[]>(`${this.baseUrl}/analytics/releases/by-month`, {
        params: this.toParams(filters),
      }),
    );
  }

  async getReleasesByYear(filters?: AnalyticsFilters): Promise<ReleasesByYear[]> {
    return await firstValueFrom(
      this.http.get<ReleasesByYear[]>(`${this.baseUrl}/analytics/releases/by-year`, {
        params: this.toParams(filters),
      }),
    );
  }

  async getReleaseYearRange(filters?: AnalyticsFilters): Promise<ReleaseYearRange> {
    const params = this.toParams(filters);
    delete params['yearFrom'];
    delete params['yearTo'];
    return await firstValueFrom(
      this.http.get<ReleaseYearRange>(`${this.baseUrl}/analytics/releases/year-range`, {
        params,
      }),
    );
  }

  async getPriceBands(filters?: AnalyticsFilters): Promise<PriceBand[]> {
    return await firstValueFrom(
      this.http.get<PriceBand[]>(`${this.baseUrl}/analytics/prices/by-band`, {
        params: this.toParams(filters),
      }),
    );
  }

  async getPricesByYear(filters?: AnalyticsFilters): Promise<PriceByYear[]> {
    return await firstValueFrom(
      this.http.get<PriceByYear[]>(`${this.baseUrl}/analytics/prices/by-year`, {
        params: this.toParams(filters),
      }),
    );
  }

  async getReleaseTimelineByPublisher(
    filters?: AnalyticsFilters,
  ): Promise<PublisherReleaseMonth[]> {
    return await firstValueFrom(
      this.http.get<PublisherReleaseMonth[]>(
        `${this.baseUrl}/analytics/releases/by-publisher-month`,
        { params: this.toParams(filters) },
      ),
    );
  }

  downloadReleasesCsvUrl(filters?: AnalyticsFilters): string {
    const params = new URLSearchParams(this.toParams(filters));
    params.set('format', 'csv');
    return `${this.baseUrl}/reports/releases?${params.toString()}`;
  }

  downloadPricesCsvUrl(filters?: AnalyticsFilters): string {
    const params = new URLSearchParams(this.toParams(filters));
    params.set('format', 'csv');
    return `${this.baseUrl}/reports/prices?${params.toString()}`;
  }

  private toParams(filters?: AnalyticsFilters): Record<string, string> {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters ?? {}))
      if (value !== undefined && value !== '') params[key] = String(value);
    return params;
  }
}
