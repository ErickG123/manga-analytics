import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CatalogPageComponent } from './catalog.page';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import type { MangaRepository } from '../../../../core/data/manga.repository';
import type { Manga } from '../../models/manga.model';

describe('CatalogPageComponent', () => {
  let fixture: ComponentFixture<CatalogPageComponent>;
  let component: CatalogPageComponent;
  let router: Router;

  const mockMangas: Manga[] = [
    {
      id: 'm-1',
      slug: 'berserk',
      title: 'Berserk',
      author: 'Kentaro Miura',
      publisher: 'Panini',
      category: 'Seinen',
      description: 'Fantasia sombria.',
      accent: '#000',
      initials: 'BK',
      volumesCount: 1,
      volumes: [
        {
          id: 'v-1',
          number: 1,
          release: { value: '01/07/2014', precision: 'day', status: 'released' },
          coverPriceBrl: 16.9,
        },
      ],
    },
    {
      id: 'm-2',
      slug: 'naruto',
      title: 'Naruto',
      author: 'Masashi Kishimoto',
      publisher: 'Panini',
      category: 'Shonen',
      description: 'Ninjas.',
      accent: '#f97316',
      initials: 'NR',
      volumesCount: 0,
      volumes: [],
    },
  ];
  const search = vi.fn((filters: Record<string, string>) =>
    Promise.resolve({
      data: mockMangas,
      pagination: { page: Number(filters['page'] ?? 1), limit: 1, total: 2, totalPages: 2 },
    }),
  );
  const fakeRepo: MangaRepository = {
    list: () => Promise.resolve(mockMangas),
    search,
    listByIds: (ids) => Promise.resolve(mockMangas.filter((manga) => ids.includes(manga.id))),
    getFacets: () =>
      Promise.resolve({
        categories: ['Seinen', 'Shonen'],
        statuses: ['ongoing'],
        publishers: [{ id: 'p-1', name: 'Panini', slug: 'panini' }],
      }),
    findBySlug: (slug) => Promise.resolve(mockMangas.find((manga) => manga.slug === slug)),
  };

  beforeEach(async () => {
    search.mockClear();
    await TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
      providers: [provideRouter([]), { provide: MANGA_REPOSITORY, useValue: fakeRepo }],
    }).compileComponents();
    fixture = TestBed.createComponent(CatalogPageComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
  });

  it('carrega uma página do catálogo e usa a contagem do backend', () => {
    expect(component.mangas()).toHaveLength(2);
    expect(component.pagination().total).toBe(2);
    expect(component.volumeCount()).toBe(1);
  });

  it('envia busca e filtros ao backend e mantém filtros na URL', async () => {
    component.setSearch('Berserk');
    component.setCategory('Seinen');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'Berserk', category: 'Seinen', page: '1' }),
    );
    expect(router.url).toContain('q=Berserk');
    expect(router.url).toContain('category=Seinen');
  });

  it('navega páginas e altera a ordenação no servidor', async () => {
    component.setPage(2);
    component.setSort('volumes_desc');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: 'volumes_desc', page: '1' }),
    );
  });

  it('renderiza controles com rótulos acessíveis', () => {
    expect(
      fixture.nativeElement.querySelector(
        '[aria-label="Buscar título, título original, autor, editora ou ISBN"]',
      ),
    ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-label="Ordenar resultados"]')).toBeTruthy();
  });
});
