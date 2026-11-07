import { describe, it, expect } from 'vitest';
import { MangaService } from '../services/manga.service.js';
import type { MangaRepository } from '../repositories/manga.repository.js';
import type { Edition, Manga, Volume } from '../../../entities/index.js';

describe('MangaService (Unit Tests)', () => {
  it('inclui URL e data da referência externa no detalhe da obra', async () => {
    const manga = {
      id: 'm-1',
      slug: 'berserk',
      title: 'Berserk',
      category: 'Seinen',
      accent: '#000',
      initials: 'BK',
      editions: [],
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as unknown as Manga;
    const createdAt = new Date('2026-02-01T00:00:00Z');
    const fakeRepo: Partial<MangaRepository> = {
      findByIdentifier: async () => manga,
      findSourceReference: async () => ({ externalUrl: 'https://example.test/manga', createdAt }),
    };
    const result = await new MangaService(fakeRepo as MangaRepository).getByIdentifier('berserk');
    expect(result?.sourceUrl).toBe('https://example.test/manga');
    expect(result?.sourceUpdatedAt).toBe(createdAt);
  });

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
          sourceEditionKey: 'default',
          name: 'Padrão',
          format: 'Tankobon',
          formatType: 'two_in_one',
          formatDetails: '13,7 x 20 cm',
          volumesPerBook: 2,
          formatEvidence: '2-em-1 na ficha da fonte',
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
              variants: [
                {
                  id: 'var-1',
                  volumeId: 'v-1',
                  name: 'Blind Pack',
                  variantKey: 'blind-pack',
                  releaseDate: '18/01/2025',
                  releaseDatePrecision: 'day',
                  releaseStatus: 'released',
                  prices: [
                    {
                      id: 'vp-1',
                      volumeId: 'v-1',
                      variantId: 'var-1',
                      amount: '49.90',
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
                  volume: null as unknown as Volume,
                },
              ],
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
    expect(result.data[0].volumes[0].priceStatus).toBe('priced');
    expect(result.data[0].volumes[0].editionName).toBe('Padrão');
    expect(result.data[0].volumes[0].editionFormatType).toBe('two_in_one');
    expect(result.data[0].volumes[0].variants).toEqual([
      {
        id: 'var-1',
        name: 'Blind Pack',
        release: { value: '18/01/2025', precision: 'day', status: 'released' },
        coverUrl: undefined,
        coverPriceBrl: 49.9,
        priceStatus: 'priced',
      },
    ]);
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.totalPages).toBe(1);
  });

  it('classifica volume sem preço sem criar um valor numérico falso', async () => {
    const manga = {
      id: 'm-2',
      slug: 'sem-preco',
      title: 'Sem preço',
      category: 'Geral',
      accent: '#000',
      initials: 'SP',
      editions: [
        {
          id: 'ed-2',
          name: 'Edição brasileira',
          format: 'Volume convencional',
          formatType: 'regular',
          publisher: { name: 'Editora' },
          volumes: [{ id: 'v-2', number: 1, prices: [], variants: [], edition: null }],
        },
      ],
    } as unknown as Manga;
    const fakeRepo: Partial<MangaRepository> = {
      findByIdentifier: async () => manga,
      findSourceReference: async () => null,
    };
    const result = await new MangaService(fakeRepo as MangaRepository).getByIdentifier('sem-preco');
    expect(result?.volumes[0].coverPriceBrl).toBeNull();
    expect(result?.volumes[0].priceStatus).toBe('not_informed');
  });
});
