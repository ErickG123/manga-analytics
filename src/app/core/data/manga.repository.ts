import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { Manga } from '../../shared/models/manga.model';
import { MOCK_MANGAS } from './mock-mangas';

export interface MangaRepository {
  list(query?: string, publisher?: string, category?: string): Promise<readonly Manga[]>;
  search(filters: Record<string, string>): Promise<{
    data: readonly Manga[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }>;
  listByIds(ids: readonly string[]): Promise<readonly Manga[]>;
  getFacets(): Promise<{
    categories: string[];
    statuses: string[];
    publishers: { id: string; name: string; slug: string }[];
  }>;
  findBySlug(slug: string): Promise<Manga | undefined>;
}

@Injectable({ providedIn: 'root' })
export class HttpMangaRepository implements MangaRepository {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  async list(query?: string, publisher?: string, category?: string): Promise<readonly Manga[]> {
    const filters: Record<string, string> = { limit: '100' };
    if (query) filters['search'] = query;
    if (publisher) filters['publisher'] = publisher;
    if (category) filters['category'] = category;
    const result = await this.search(filters);
    return result.data;
  }

  async search(filters: Record<string, string>): Promise<{
    data: readonly Manga[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const params: Record<string, string> = { ...filters };
    try {
      const res = await firstValueFrom(
        this.http.get<{
          data: Manga[];
          pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`${this.baseUrl}/mangas`, { params }),
      );
      return res;
    } catch {
      throw new Error('Não foi possível carregar o catálogo. Tente novamente.');
    }
  }

  async listByIds(ids: readonly string[]): Promise<readonly Manga[]> {
    if (ids.length === 0) return [];
    try {
      const result = await this.search({ ids: ids.slice(0, 100).join(','), limit: '100' });
      return result.data;
    } catch {
      return MOCK_MANGAS.filter((manga) => ids.includes(manga.id));
    }
  }

  async getFacets() {
    const [facets, publishers] = await Promise.all([
      firstValueFrom(
        this.http.get<{ categories: string[]; statuses: string[] }>(
          `${this.baseUrl}/mangas/facets`,
        ),
      ),
      firstValueFrom(
        this.http.get<{ id: string; name: string; slug: string }[]>(`${this.baseUrl}/publishers`),
      ),
    ]);
    return { ...facets, publishers };
  }

  async findBySlug(slug: string): Promise<Manga | undefined> {
    try {
      return await firstValueFrom(this.http.get<Manga>(`${this.baseUrl}/mangas/${slug}`));
    } catch {
      return undefined;
    }
  }
}

@Injectable({ providedIn: 'root' })
export class MockMangaRepository implements MangaRepository {
  async list(): Promise<readonly Manga[]> {
    return MOCK_MANGAS;
  }
  async search(): Promise<{
    data: readonly Manga[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    return {
      data: MOCK_MANGAS,
      pagination: { page: 1, limit: 100, total: MOCK_MANGAS.length, totalPages: 1 },
    };
  }
  async listByIds(ids: readonly string[]): Promise<readonly Manga[]> {
    return MOCK_MANGAS.filter((manga) => ids.includes(manga.id));
  }
  async getFacets() {
    return {
      categories: [...new Set(MOCK_MANGAS.map((manga) => manga.category))],
      statuses: ['ongoing', 'completed'],
      publishers: [...new Set(MOCK_MANGAS.map((manga) => manga.publisher))].map((name) => ({
        id: name,
        name,
        slug: name.toLowerCase().replaceAll(' ', '-'),
      })),
    };
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
