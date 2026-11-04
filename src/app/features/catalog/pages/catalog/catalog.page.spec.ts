import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogPageComponent } from './catalog.page';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import type { MangaRepository } from '../../../../core/data/manga.repository';
import type { Manga } from '../../models/manga.model';

describe('CatalogPageComponent', () => {
  let fixture: ComponentFixture<CatalogPageComponent>;
  let component: CatalogPageComponent;

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
      volumes: [
        {
          id: 'v-1',
          number: 1,
          release: { value: '2014-07-01', precision: 'day', status: 'released' },
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
      volumes: [],
    },
  ];

  const fakeRepo: MangaRepository = {
    list: () => Promise.resolve(mockMangas),
    findBySlug: (slug: string) => Promise.resolve(mockMangas.find((m) => m.slug === slug)),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CatalogPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: MANGA_REPOSITORY,
          useValue: fakeRepo,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CatalogPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('deve carregar e listar os mangás retornados pelo repositório', () => {
    expect(component.mangas().length).toBe(2);
    expect(component.filtered().length).toBe(2);
    expect(component.volumeCount()).toBe(1);
  });

  it('deve filtrar os mangás por texto de busca', () => {
    component.query.set('Berserk');
    expect(component.filtered().length).toBe(1);
    expect(component.filtered()[0].title).toBe('Berserk');
  });

  it('deve filtrar por categoria', () => {
    component.category.set('Shonen');
    expect(component.filtered().length).toBe(1);
    expect(component.filtered()[0].title).toBe('Naruto');
  });
});
