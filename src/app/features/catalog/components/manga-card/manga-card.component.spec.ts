import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MangaCardComponent } from './manga-card.component';
import type { Manga } from '../../models/manga.model';

describe('MangaCardComponent', () => {
  let fixture: ComponentFixture<MangaCardComponent>;
  let component: MangaCardComponent;

  const mockManga: Manga = {
    id: 'm-1',
    slug: 'vinland-saga',
    title: 'Vinland Saga',
    publisher: 'Panini',
    category: 'Seinen',
    description: 'História nórdica.',
    accent: '#2c3e50',
    initials: 'VS',
    volumes: [
      {
        id: 'v-1',
        number: 1,
        release: { value: '2024-01-10', precision: 'day', status: 'released' },
        coverPriceBrl: 39.9,
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MangaCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MangaCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('manga', mockManga);
    fixture.detectChanges();
  });

  it('deve renderizar o título e a editora do mangá', () => {
    expect(component).toBeTruthy();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h3')?.textContent).toContain('Vinland Saga');
    expect(compiled.querySelector('.eyebrow')?.textContent).toContain('Panini');
    expect(compiled.querySelector('.cover-monogram')?.textContent).toContain('VS');
  });

  it('deve construir o link para a página de detalhes', () => {
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/catalogo/vinland-saga');
  });
});
