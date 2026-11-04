import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { CalendarFilters, CalendarResult } from '../models/calendar-query.model';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  async getReleases(filters?: CalendarFilters): Promise<CalendarResult> {
    try {
      const params: Record<string, string> = {};
      if (filters?.year) params['year'] = String(filters.year);
      if (filters?.month) params['month'] = String(filters.month);
      if (filters?.publisher) params['publisher'] = filters.publisher;
      if (filters?.status) params['status'] = filters.status;
      if (filters?.manga) params['manga'] = filters.manga;
      if (filters?.from) params['from'] = filters.from;
      if (filters?.to) params['to'] = filters.to;
      if (filters?.hasPrice) params['hasPrice'] = filters.hasPrice;
      if (filters?.page) params['page'] = String(filters.page);
      params['limit'] = '24';

      return await firstValueFrom(
        this.http.get<CalendarResult>(`${this.baseUrl}/releases`, { params }),
      );
    } catch {
      throw new Error('Não foi possível carregar o calendário. Tente novamente.');
    }
  }
}
