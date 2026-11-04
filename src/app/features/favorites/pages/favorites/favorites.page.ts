import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
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
    const byId = new Map(this.allMangas().map((manga) => [manga.id, manga]));
    return ids.map((id) => byId.get(id)).filter((manga): manga is Manga => Boolean(manga));
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
    effect(() => {
      const ids = this.favoriteService.favoriteIds();
      void this.repo.listByIds(ids).then((items) => this.allMangas.set(items));
    });
  }

  clearAll(): void {
    this.favoriteService.clearFavorites();
  }
}
