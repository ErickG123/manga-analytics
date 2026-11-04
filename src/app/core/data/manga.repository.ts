import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Manga } from '../../shared/models/manga.model';
import { MOCK_MANGAS } from './mock-mangas';

export interface MangaRepository {
  list(query?: string, publisher?: string, category?: string): Promise<readonly Manga[]>;
  findBySlug(slug: string): Promise<Manga | undefined>;
}

@Injectable({ providedIn: 'root' })
export class HttpMangaRepository implements MangaRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  async list(query?: string, publisher?: string, category?: string): Promise<readonly Manga[]> {
    try {
      const params: Record<string, string> = {};
      if (query) params['search'] = query;
      if (publisher) params['publisher'] = publisher;
      if (category) params['category'] = category;

      const res = await firstValueFrom(
        this.http.get<{ data: Manga[] }>(`${this.baseUrl}/mangas`, { params }),
      );
      return res.data;
    } catch {
      // Fallback gracioso se a API não estiver conectada
      return MOCK_MANGAS;
    }
  }

  async findBySlug(slug: string): Promise<Manga | undefined> {
    try {
      return await firstValueFrom(this.http.get<Manga>(`${this.baseUrl}/mangas/${slug}`));
    } catch {
      return MOCK_MANGAS.find((m) => m.slug === slug);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class MockMangaRepository implements MangaRepository {
  async list(): Promise<readonly Manga[]> {
    return MOCK_MANGAS;
  }
  async findBySlug(slug: string): Promise<Manga | undefined> {
    return MOCK_MANGAS.find((m) => m.slug === slug);
  }
}

import { InjectionToken } from '@angular/core';
export const MANGA_REPOSITORY = new InjectionToken<MangaRepository>('MANGA_REPOSITORY', {
  providedIn: 'root',
  factory: () => inject(HttpMangaRepository),
});
