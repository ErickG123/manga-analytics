import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface AnalyticsOverview {
  totalMangas: number;
  totalVolumes: number;
  totalPublishers: number;
  averagePrice: number;
}

export interface PriceByManga {
  id: string;
  title: string;
  slug: string;
  averagePrice: number;
  volumesCount: number;
}

export interface PriceByPublisher {
  id: string;
  name: string;
  slug: string;
  averagePrice: number;
  volumesCount: number;
}

export interface ReleasesByMonth {
  year: number;
  month: number;
  label: string;
  count: number;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  async getOverview(): Promise<AnalyticsOverview> {
    try {
      return await firstValueFrom(
        this.http.get<AnalyticsOverview>(`${this.baseUrl}/analytics/overview`),
      );
    } catch {
      return { totalMangas: 0, totalVolumes: 0, totalPublishers: 0, averagePrice: 0 };
    }
  }

  async getPricesByManga(): Promise<PriceByManga[]> {
    try {
      return await firstValueFrom(
        this.http.get<PriceByManga[]>(`${this.baseUrl}/analytics/prices/by-manga`),
      );
    } catch {
      return [];
    }
  }

  async getPricesByPublisher(): Promise<PriceByPublisher[]> {
    try {
      return await firstValueFrom(
        this.http.get<PriceByPublisher[]>(`${this.baseUrl}/analytics/prices/by-publisher`),
      );
    } catch {
      return [];
    }
  }

  async getReleasesByMonth(): Promise<ReleasesByMonth[]> {
    try {
      return await firstValueFrom(
        this.http.get<ReleasesByMonth[]>(`${this.baseUrl}/analytics/releases/by-month`),
      );
    } catch {
      return [];
    }
  }

  downloadReleasesCsvUrl(): string {
    return `${this.baseUrl}/reports/releases?format=csv`;
  }

  downloadPricesCsvUrl(): string {
    return `${this.baseUrl}/reports/prices?format=csv`;
  }
}
