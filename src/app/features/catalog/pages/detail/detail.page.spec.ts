import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { DetailPageComponent } from './detail.page';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import type { MangaRepository } from '../../../../core/models/manga-repository.model';
import type { Manga } from '../../models/manga.model';

describe('DetailPageComponent', () => {
  registerLocaleData(localePt, 'pt-BR');
  let fixture: ComponentFixture<DetailPageComponent>;
  const manga: Manga = {
    id: 'm-1',
    slug: 'obra',
    title: 'Obra',
    publisher: 'JBC',
    category: 'Seinen',
    description: '',
    accent: '#c00',
    initials: 'OB',
    coverUrl: 'https://example.test/cover.jpg',
    volumesCount: 2,
    volumes: [
      {
        id: 'v-1',
        number: 1,
        isbn13: '9781234567890',
        release: { value: '15/04/2025', precision: 'day', status: 'released' },
        coverPriceBrl: 35,
        variants: [
          {
            id: 'variant-1',
            name: 'Blind Pack',
            release: { value: '18/04/2025', precision: 'day', status: 'released' },
            coverPriceBrl: 49.9,
          },
        ],
      },
      {
        id: 'v-2',
        number: 2,
        isbn13: '9781234567891',
        release: { value: null, precision: 'unknown', status: 'unknown' },
        coverPriceBrl: null,
      },
    ],
  };
  const fakeRepo: MangaRepository = {
    list: () => Promise.resolve([manga]),
    search: () =>
      Promise.resolve({
        data: [manga],
        pagination: { page: 1, limit: 24, total: 1, totalPages: 1 },
      }),
    listByIds: () => Promise.resolve([manga]),
    getFacets: () => Promise.resolve({ categories: ['Seinen'], statuses: [], publishers: [] }),
    findBySlug: () => Promise.resolve(manga),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetailPageComponent],
      providers: [provideRouter([]), { provide: MANGA_REPOSITORY, useValue: fakeRepo }],
    }).compileComponents();
    fixture = TestBed.createComponent(DetailPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('exibe a capa retornada pela API e usa fallback quando a imagem falha', () => {
    const image = fixture.nativeElement.querySelector('img.detail-cover-image') as HTMLImageElement;
    expect(image.src).toBe('https://example.test/cover.jpg');
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.detail-cover')).toBeTruthy();
  });

  it('filtra volumes por ISBN e disponibilidade de preço', () => {
    const component = fixture.componentInstance;
    component.volumeSearch.set('9781234567890');
    expect(component.filteredVolumes().map((volume) => volume.number)).toEqual([1]);
    component.volumeSearch.set('');
    component.volumeHasPrice.set('false');
    expect(component.filteredVolumes().map((volume) => volume.number)).toEqual([2]);
  });

  it('exibe variações especiais com nome, data e preço', () => {
    const detail = fixture.nativeElement.textContent as string;
    expect(detail).toContain('Blind Pack');
    expect(detail).toContain('18/04/2025');
    expect(detail).toContain('R$ 49,90');
  });
});
