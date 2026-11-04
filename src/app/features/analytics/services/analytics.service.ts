import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type {
  AnalyticsFilters,
  AnalyticsOverview,
  PriceBand,
  PriceByManga,
  PriceByPublisher,
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
    try {
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
    } catch {
      return EMPTY_OVERVIEW;
    }
  }

  async getPricesByManga(filters?: AnalyticsFilters): Promise<PriceByManga[]> {
    try {
      return await firstValueFrom(
        this.http.get<PriceByManga[]>(`${this.baseUrl}/analytics/prices/by-manga`, {
          params: this.toParams(filters),
        }),
      );
    } catch {
      return [];
    }
  }

  async getPricesByPublisher(filters?: AnalyticsFilters): Promise<PriceByPublisher[]> {
    try {
      return await firstValueFrom(
        this.http.get<PriceByPublisher[]>(`${this.baseUrl}/analytics/prices/by-publisher`, {
          params: this.toParams(filters),
        }),
      );
    } catch {
      return [];
    }
  }

  async getReleasesByMonth(filters?: AnalyticsFilters): Promise<ReleasesByMonth[]> {
    try {
      return await firstValueFrom(
        this.http.get<ReleasesByMonth[]>(`${this.baseUrl}/analytics/releases/by-month`, {
          params: this.toParams(filters),
        }),
      );
    } catch {
      return [];
    }
  }

  async getReleasesByYear(filters?: AnalyticsFilters): Promise<ReleasesByYear[]> {
    try {
      return await firstValueFrom(
        this.http.get<ReleasesByYear[]>(`${this.baseUrl}/analytics/releases/by-year`, {
          params: this.toParams(filters),
        }),
      );
    } catch {
      return [];
    }
  }

  async getPriceBands(filters?: AnalyticsFilters): Promise<PriceBand[]> {
    try {
      return await firstValueFrom(
        this.http.get<PriceBand[]>(`${this.baseUrl}/analytics/prices/by-band`, {
          params: this.toParams(filters),
        }),
      );
    } catch {
      return [];
    }
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
