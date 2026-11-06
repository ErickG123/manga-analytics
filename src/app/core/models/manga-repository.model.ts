import type { Manga } from '../../shared/models/manga.model';

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
