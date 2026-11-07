import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MOCK_MANGAS } from './mock-mangas';
import { HttpMangaRepository } from './manga.repository';

describe('HttpMangaRepository', () => {
  let repository: HttpMangaRepository;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    repository = TestBed.inject(HttpMangaRepository);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('monta a consulta do catálogo com os filtros informados', async () => {
    const resultPromise = repository.list('blue lock', 'panini', 'esporte');
    const request = http.expectOne((item) => item.url.endsWith('/mangas'));

    expect(request.request.params.get('limit')).toBe('100');
    expect(request.request.params.get('search')).toBe('blue lock');
    expect(request.request.params.get('publisher')).toBe('panini');
    expect(request.request.params.get('category')).toBe('esporte');

    const response = {
      data: [MOCK_MANGAS[0]],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    };
    request.flush(response);
    await expect(resultPromise).resolves.toEqual(response.data);
  });

  it('preserva a paginação retornada pela API na busca', async () => {
    const response = {
      data: [MOCK_MANGAS[0]],
      pagination: { page: 2, limit: 10, total: 15, totalPages: 2 },
    };
    const resultPromise = repository.search({ page: '2', limit: '10' });
    const request = http.expectOne((item) => item.url.endsWith('/mangas'));
    request.flush(response);

    await expect(resultPromise).resolves.toEqual(response);
  });

  it('converte erro de busca em uma mensagem amigável', async () => {
    const resultPromise = repository.search({ search: 'inexistente' });
    http
      .expectOne((item) => item.url.endsWith('/mangas'))
      .flush('indisponível', {
        status: 500,
        statusText: 'Internal Server Error',
      });

    await expect(resultPromise).rejects.toThrow(
      'Não foi possível carregar o catálogo. Tente novamente.',
    );
  });

  it('não faz requisição ao listar uma coleção vazia de IDs', async () => {
    await expect(repository.listByIds([])).resolves.toEqual([]);
    http.expectNone((item) => item.url.endsWith('/mangas'));
  });

  it('limita a consulta por IDs a 100 itens', async () => {
    const ids = Array.from({ length: 105 }, (_, index) => `manga-${index}`);
    const resultPromise = repository.listByIds(ids);
    const request = http.expectOne((item) => item.url.endsWith('/mangas'));

    expect(request.request.params.get('ids')?.split(',')).toHaveLength(100);
    expect(request.request.params.get('limit')).toBe('100');
    request.flush({
      data: [MOCK_MANGAS[0]],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    await expect(resultPromise).resolves.toEqual([MOCK_MANGAS[0]]);
  });

  it('usa dados locais como fallback se a consulta por IDs falhar', async () => {
    const expected = MOCK_MANGAS.filter((manga) => manga.id === MOCK_MANGAS[0].id);
    const resultPromise = repository.listByIds([MOCK_MANGAS[0].id]);
    http
      .expectOne((item) => item.url.endsWith('/mangas'))
      .flush('indisponível', {
        status: 503,
        statusText: 'Service Unavailable',
      });

    await expect(resultPromise).resolves.toEqual(expected);
  });

  it('combina facetas e editoras em uma única resposta', async () => {
    const resultPromise = repository.getFacets();
    http
      .expectOne((item) => item.url.endsWith('/mangas/facets'))
      .flush({
        categories: ['ação'],
        statuses: ['ongoing'],
      });
    http
      .expectOne((item) => item.url.endsWith('/publishers'))
      .flush([{ id: 'panini', name: 'Panini', slug: 'panini' }]);

    await expect(resultPromise).resolves.toEqual({
      categories: ['ação'],
      statuses: ['ongoing'],
      publishers: [{ id: 'panini', name: 'Panini', slug: 'panini' }],
    });
  });

  it('retorna indefinido se a API não localizar a obra', async () => {
    const resultPromise = repository.findBySlug('nao-existe');
    http
      .expectOne((item) => item.url.endsWith('/mangas/nao-existe'))
      .flush('não encontrado', {
        status: 404,
        statusText: 'Not Found',
      });

    await expect(resultPromise).resolves.toBeUndefined();
  });
});
