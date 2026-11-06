import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type {
  CalendarFilters,
  CalendarPublisher,
  CalendarReleaseMonthSummary,
  CalendarResult,
} from '../models/calendar-query.model';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  async getPublishers(): Promise<CalendarPublisher[]> {
    return await firstValueFrom(this.http.get<CalendarPublisher[]>(`${this.baseUrl}/publishers`));
  }

  async getReleaseSummary(filters?: CalendarFilters): Promise<CalendarReleaseMonthSummary[]> {
    try {
      return await firstValueFrom(
        this.http.get<CalendarReleaseMonthSummary[]>(`${this.baseUrl}/releases/summary`, {
          params: this.toParams(filters),
        }),
      );
    } catch {
      throw new Error('Não foi possível carregar o resumo da linha do tempo. Tente novamente.');
    }
  }

  async getReleases(filters?: CalendarFilters): Promise<CalendarResult> {
    try {
      return await firstValueFrom(
        this.http.get<CalendarResult>(`${this.baseUrl}/releases`, {
          params: { ...this.toParams(filters), limit: String(filters?.limit ?? 24) },
        }),
      );
    } catch {
      throw new Error('Não foi possível carregar o calendário. Tente novamente.');
    }
  }

  private toParams(filters?: CalendarFilters): Record<string, string> {
    const params: Record<string, string> = {};
    if (filters?.year) params['year'] = String(filters.year);
    if (filters?.month) params['month'] = String(filters.month);
    if (filters?.monthUnknown) params['monthUnknown'] = 'true';
    if (filters?.publisher) params['publisher'] = filters.publisher;
    if (filters?.status) params['status'] = filters.status;
    if (filters?.manga) params['manga'] = filters.manga;
    if (filters?.from) params['from'] = filters.from;
    if (filters?.to) params['to'] = filters.to;
    if (filters?.hasPrice) params['hasPrice'] = filters.hasPrice;
    if (filters?.page) params['page'] = String(filters.page);
    return params;
  }
}
