import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FavoriteService } from '../../../../core/services/favorite.service';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import type { Manga } from '../../../catalog/models/manga.model';
import { MangaCardComponent } from '../../../catalog/components/manga-card/manga-card.component';

@Component({
  selector: 'app-favorites-page',
  standalone: true,
  imports: [RouterLink, MangaCardComponent],
  templateUrl: './favorites.page.html',
  styleUrl: './favorites.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FavoritesPageComponent {
  private readonly favoriteService = inject(FavoriteService);
  private readonly repo = inject(MANGA_REPOSITORY);

  readonly allMangas = signal<readonly Manga[]>([]);

  readonly favoriteMangas = computed(() => {
    const ids = this.favoriteService.favoriteIds();
    return this.allMangas().filter((m: Manga) => ids.includes(m.id));
  });

  readonly upcomingVolumes = computed(() => {
    const favs = this.favoriteMangas();
    return favs
      .flatMap((m: Manga) =>
        m.volumes.map((v) => ({
          ...v,
          mangaTitle: m.title,
          mangaSlug: m.slug,
          publisher: m.publisher,
          coverUrl: m.coverUrl,
        })),
      )
      .slice(0, 6);
  });

  constructor() {
    void this.repo.list().then((items) => this.allMangas.set(items));
  }

  clearAll(): void {
    this.favoriteService.clearFavorites();
  }
}
