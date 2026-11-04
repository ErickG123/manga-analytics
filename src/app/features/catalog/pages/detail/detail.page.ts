import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import type { Manga } from '../../models/manga.model';

@Component({
  selector: 'app-detail-page',
  standalone: true,
  imports: [RouterLink, CurrencyPipe],
  templateUrl: './detail.page.html',
  styleUrl: './detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailPageComponent {
  private readonly repo = inject(MANGA_REPOSITORY);

  readonly manga = signal<Manga | undefined>(undefined);

  constructor() {
    const slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';
    void this.repo.findBySlug(slug).then((m) => this.manga.set(m));
  }
}
