import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import type { Manga } from '../../models/manga.model';
import { MangaCardComponent } from '../../components/manga-card/manga-card.component';

@Component({
  selector: 'app-catalog-page',
  standalone: true,
  imports: [FormsModule, MangaCardComponent],
  templateUrl: './catalog.page.html',
  styleUrl: './catalog.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPageComponent {
  private readonly repo = inject(MANGA_REPOSITORY);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly mangas = signal<readonly Manga[]>([]);
  readonly query = signal('');
  readonly category = signal('');
  readonly publisher = signal('');
  readonly sort = signal<'title_asc' | 'title_desc' | 'recent' | 'oldest'>('title_asc');
  readonly page = signal(1);
  readonly pageSize = signal(12);

  readonly volumeCount = computed(() => this.mangas().reduce((n, m) => n + m.volumes.length, 0));

  readonly categories = computed(() => [...new Set(this.mangas().map((m) => m.category))].sort());

  readonly publishers = computed(() => [...new Set(this.mangas().map((m) => m.publisher))].sort());

  readonly filtered = computed(() => {
    let list = this.mangas().filter(
      (m) =>
        (!this.category() || m.category === this.category()) &&
        (!this.publisher() || m.publisher === this.publisher()) &&
        `${m.title} ${m.author ?? ''} ${m.publisher}`
          .toLocaleLowerCase('pt-BR')
          .includes(this.query().toLocaleLowerCase('pt-BR')),
    );

    // Ordenação
    switch (this.sort()) {
      case 'title_desc':
        list = [...list].sort((a, b) => b.title.localeCompare(a.title, 'pt-BR'));
        break;
      case 'recent':
        list = [...list].reverse();
        break;
      case 'title_asc':
      default:
        list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
        break;
    }

    return list;
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filtered().length / this.pageSize())),
  );

  readonly paginated = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  constructor() {
    // 1. Sincronização inicial com Query Params da URL
    this.route.queryParams.subscribe((params) => {
      if (params['q']) this.query.set(params['q']);
      if (params['category']) this.category.set(params['category']);
      if (params['publisher']) this.publisher.set(params['publisher']);
      if (params['sort']) this.sort.set(params['sort']);
      if (params['page']) this.page.set(parseInt(params['page'], 10) || 1);
    });

    // 2. Efeito para refletir alterações nos query params
    effect(() => {
      const q = this.query();
      const cat = this.category();
      const pub = this.publisher();
      const s = this.sort();
      const p = this.page();

      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          q: q || null,
          category: cat || null,
          publisher: pub || null,
          sort: s !== 'title_asc' ? s : null,
          page: p > 1 ? p : null,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    void this.repo.list().then((items) => this.mangas.set(items));
  }

  setPage(newPage: number): void {
    if (newPage >= 1 && newPage <= this.totalPages()) {
      this.page.set(newPage);
    }
  }

  clearFilters(): void {
    this.query.set('');
    this.category.set('');
    this.publisher.set('');
    this.sort.set('title_asc');
    this.page.set(1);
  }
}
