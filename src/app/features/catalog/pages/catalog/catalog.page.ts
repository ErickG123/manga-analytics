import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, type ParamMap } from '@angular/router';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import type { Manga } from '../../models/manga.model';
import { MangaCardComponent } from '../../components/manga-card/manga-card.component';
import type { CatalogFacets } from '../../models/catalog-query.model';

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
  private requestId = 0;

  readonly mangas = signal<readonly Manga[]>([]);
  readonly pagination = signal({ page: 1, limit: 24, total: 0, totalPages: 0 });
  readonly facets = signal<CatalogFacets>({ categories: [], statuses: [], publishers: [] });
  readonly query = signal('');
  readonly category = signal('');
  readonly publisher = signal('');
  readonly status = signal('');
  readonly yearFrom = signal('');
  readonly yearTo = signal('');
  readonly volumesMin = signal('');
  readonly volumesMax = signal('');
  readonly hasPrice = signal('');
  readonly upcoming = signal('');
  readonly hasCover = signal('');
  readonly sort = signal('title_asc');
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly activeFilters = computed(() =>
    [
      this.query() && `Busca: ${this.query()}`,
      this.publisher() && `Editora: ${this.publisher()}`,
      this.category() && `Categoria: ${this.category()}`,
      this.status() && `Situação: ${this.status()}`,
      this.yearFrom() && `Ano desde: ${this.yearFrom()}`,
      this.yearTo() && `Ano até: ${this.yearTo()}`,
      this.volumesMin() && `Volumes desde: ${this.volumesMin()}`,
      this.volumesMax() && `Volumes até: ${this.volumesMax()}`,
      this.hasPrice() && (this.hasPrice() === 'true' ? 'Com preço' : 'Sem preço'),
      this.upcoming() && 'Com próximos lançamentos',
      this.hasCover() && (this.hasCover() === 'true' ? 'Com capa' : 'Sem capa'),
    ].filter((value): value is string => Boolean(value)),
  );

  constructor() {
    this.readQueryParams(this.route.snapshot.queryParamMap);
    this.route.queryParamMap.subscribe((params) => this.readQueryParams(params));
    void this.repo
      .getFacets()
      .then((value) => this.facets.set(value))
      .catch(() => undefined);

    effect((onCleanup) => {
      const filters = {
        search: this.query(),
        publisher: this.publisher(),
        category: this.category(),
        status: this.status(),
        yearFrom: this.yearFrom(),
        yearTo: this.yearTo(),
        volumesMin: this.volumesMin(),
        volumesMax: this.volumesMax(),
        hasPrice: this.hasPrice(),
        upcoming: this.upcoming(),
        hasCover: this.hasCover(),
        sort: this.sort(),
        page: String(this.page()),
        limit: '24',
      };
      const requestId = ++this.requestId;
      this.loading.set(true);
      const timeout = setTimeout(() => {
        const params = Object.fromEntries(
          Object.entries(filters).filter(([, value]) => Boolean(value)),
        );
        void this.repo
          .search(params)
          .then((result) => {
            if (requestId !== this.requestId) return;
            this.mangas.set(result.data);
            this.pagination.set(result.pagination);
            this.error.set('');
          })
          .catch((error: unknown) => {
            if (requestId === this.requestId)
              this.error.set(
                error instanceof Error ? error.message : 'Erro ao carregar o catálogo.',
              );
          })
          .finally(() => {
            if (requestId === this.requestId) this.loading.set(false);
          });
      }, 300);
      onCleanup(() => clearTimeout(timeout));
    });
  }

  readonly totalPages = computed(() => this.pagination().totalPages);
  readonly volumeCount = computed(() =>
    this.mangas().reduce((total, manga) => total + (manga.volumesCount ?? manga.volumes.length), 0),
  );

  setSearch(value: string): void {
    this.query.set(value);
    this.changeFilter();
  }
  setPublisher(value: string): void {
    this.publisher.set(value);
    this.changeFilter();
  }
  setCategory(value: string): void {
    this.category.set(value);
    this.changeFilter();
  }
  setStatus(value: string): void {
    this.status.set(value);
    this.changeFilter();
  }
  setSort(value: string): void {
    this.sort.set(value);
    this.page.set(1);
    this.syncUrl();
  }
  setYearFrom(value: string): void {
    this.yearFrom.set(value);
    this.changeFilter();
  }
  setYearTo(value: string): void {
    this.yearTo.set(value);
    this.changeFilter();
  }
  setVolumesMin(value: string): void {
    this.volumesMin.set(value);
    this.changeFilter();
  }
  setVolumesMax(value: string): void {
    this.volumesMax.set(value);
    this.changeFilter();
  }
  setHasPrice(value: string): void {
    this.hasPrice.set(value);
    this.changeFilter();
  }
  setUpcoming(value: string): void {
    this.upcoming.set(value);
    this.changeFilter();
  }
  setHasCover(value: string): void {
    this.hasCover.set(value);
    this.changeFilter();
  }

  setPage(newPage: number): void {
    if (newPage >= 1 && newPage <= this.totalPages()) {
      this.page.set(newPage);
      this.syncUrl();
    }
  }

  clearFilters(): void {
    this.query.set('');
    this.category.set('');
    this.publisher.set('');
    this.status.set('');
    this.yearFrom.set('');
    this.yearTo.set('');
    this.volumesMin.set('');
    this.volumesMax.set('');
    this.hasPrice.set('');
    this.upcoming.set('');
    this.hasCover.set('');
    this.sort.set('title_asc');
    this.page.set(1);
    this.syncUrl();
  }

  private changeFilter(): void {
    this.page.set(1);
    this.syncUrl();
  }

  private readQueryParams(params: ParamMap): void {
    this.query.set(params.get('q') ?? '');
    this.category.set(params.get('category') ?? '');
    this.publisher.set(params.get('publisher') ?? '');
    this.status.set(params.get('status') ?? '');
    this.yearFrom.set(params.get('yearFrom') ?? '');
    this.yearTo.set(params.get('yearTo') ?? '');
    this.volumesMin.set(params.get('volumesMin') ?? '');
    this.volumesMax.set(params.get('volumesMax') ?? '');
    this.hasPrice.set(params.get('hasPrice') ?? '');
    this.upcoming.set(params.get('upcoming') ?? '');
    this.hasCover.set(params.get('hasCover') ?? '');
    this.sort.set(params.get('sort') ?? 'title_asc');
    this.page.set(Math.max(1, Number(params.get('page') ?? 1)));
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.query() || null,
        category: this.category() || null,
        publisher: this.publisher() || null,
        status: this.status() || null,
        yearFrom: this.yearFrom() || null,
        yearTo: this.yearTo() || null,
        volumesMin: this.volumesMin() || null,
        volumesMax: this.volumesMax() || null,
        hasPrice: this.hasPrice() || null,
        upcoming: this.upcoming() || null,
        hasCover: this.hasCover() || null,
        sort: this.sort() === 'title_asc' ? null : this.sort(),
        page: this.page() > 1 ? this.page() : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
