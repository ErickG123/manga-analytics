import { describe, it, expect } from 'vitest';
import { MangaService } from '../services/manga.service.js';
import type { MangaRepository } from '../repositories/manga.repository.js';
import type { Manga } from '../../../entities/index.js';

describe('MangaService (Unit Tests)', () => {
  it('deve listar mangás mapeando edições, volumes e paginação corretamente', async () => {
    const mockManga: Partial<Manga> = {
      id: 'm-1',
      slug: 'berserk',
      title: 'Berserk',
      category: 'Seinen',
      accent: '#000',
      initials: 'BK',
      editions: [
        {
          id: 'ed-1',
          name: 'Padrão',
          format: 'Tankobon',
          status: 'ongoing',
          mangaId: 'm-1',
          publisherId: 'pub-1',
          publisher: {
            id: 'pub-1',
            name: 'Panini',
            slug: 'panini',
            website: null,
            editions: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          manga: null as unknown as Manga,
          volumes: [
            {
              id: 'v-1',
              editionId: 'ed-1',
              number: 1,
              title: 'Volume 1',
              releaseDate: '15/07/2014',
              releaseDatePrecision: 'day',
              releaseStatus: 'released',
              prices: [
                {
                  id: 'p-1',
                  volumeId: 'v-1',
                  amount: '16.90',
                  currency: 'BRL',
                  sourceId: 'bbm',
                  observedAt: new Date(),
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  volume: null as unknown as Volume,
                },
              ],
              observations: [],
              createdAt: new Date(),
              updatedAt: new Date(),
              edition: null as unknown as Edition,
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };

    const fakeRepo: Partial<MangaRepository> = {
      findMany: async () => [[mockManga as Manga], 1],
    };

    const service = new MangaService(fakeRepo as MangaRepository);
    const result = await service.list({ page: '1', limit: '10' });

    expect(result.data.length).toBe(1);
    expect(result.data[0].title).toBe('Berserk');
    expect(result.data[0].publisher).toBe('Panini');
    expect(result.data[0].volumes.length).toBe(1);
    expect(result.data[0].volumes[0].coverPriceBrl).toBe(16.9);
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
  });
});
