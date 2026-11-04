import { ChangeDetectionStrategy, Component, input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Manga } from '../../models/manga.model';
import { FavoriteService } from '../../../../core/services/favorite.service';

@Component({
  selector: 'app-manga-card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './manga-card.component.html',
  styleUrl: './manga-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MangaCardComponent {
  readonly manga = input.required<Manga>();
  private readonly favoriteService = inject(FavoriteService);

  isFavorite(): boolean {
    return this.favoriteService.isFavorite(this.manga().id);
  }

  toggleFavorite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.favoriteService.toggleFavorite(this.manga().id);
  }
}
