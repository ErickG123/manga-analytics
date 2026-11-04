import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface ReleaseItem {
  id: string;
  slug: string;
  title: string;
  publisher: string;
  number: number;
  date: string;
  status: 'released' | 'planned' | 'unknown';
  price: number | null;
  coverUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  async getReleases(filters?: {
    year?: number;
    month?: number;
    publisher?: string;
    status?: string;
  }): Promise<ReleaseItem[]> {
    try {
      const params: Record<string, string> = {};
      if (filters?.year) params['year'] = String(filters.year);
      if (filters?.month) params['month'] = String(filters.month);
      if (filters?.publisher) params['publisher'] = filters.publisher;
      if (filters?.status) params['status'] = filters.status;

      return await firstValueFrom(
        this.http.get<ReleaseItem[]>(`${this.baseUrl}/releases`, { params }),
      );
    } catch {
      return [];
    }
  }
}
