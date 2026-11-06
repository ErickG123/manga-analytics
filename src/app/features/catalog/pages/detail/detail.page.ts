import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MANGA_REPOSITORY } from '../../../../core/data/manga.repository';
import type { Manga, Volume } from '../../models/manga.model';

@Component({
  selector: 'app-detail-page',
  standalone: true,
  imports: [RouterLink, CurrencyPipe, DatePipe, FormsModule],
  templateUrl: './detail.page.html',
  styleUrl: './detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailPageComponent {
  private readonly repo = inject(MANGA_REPOSITORY);
  readonly manga = signal<Manga | undefined>(undefined);
  readonly loading = signal(true);
  readonly imageFailed = signal(false);
  readonly volumeSearch = signal('');
  readonly volumeStatus = signal('');
  readonly volumeYear = signal('');
  readonly volumeHasPrice = signal('');
  readonly volumeSort = signal('number_asc');
  readonly coverUrl = computed(() =>
    this.imageFailed() ? null : (this.manga()?.coverUrl ?? null),
  );
  readonly lastRelease = computed(
    () =>
      this.manga()
        ?.volumes.filter((volume) => volume.release.status === 'released' && volume.release.value)
        .sort((left, right) => this.releaseSortKey(right) - this.releaseSortKey(left))[0],
  );
  readonly nextRelease = computed(
    () =>
      this.manga()
        ?.volumes.filter((volume) => volume.release.status === 'planned' && volume.release.value)
        .sort((left, right) => this.releaseSortKey(left) - this.releaseSortKey(right))[0],
  );
  readonly filteredVolumes = computed(() => {
    const search = this.volumeSearch().trim().toLocaleLowerCase('pt-BR');
    const values = (this.manga()?.volumes ?? []).filter((volume) => {
      const matchSearch =
        !search ||
        String(volume.number).includes(search) ||
        (volume.isbn13 ?? '').toLocaleLowerCase('pt-BR').includes(search) ||
        (volume.variants ?? []).some((variant) =>
          variant.name.toLocaleLowerCase('pt-BR').includes(search),
        );
      const matchStatus = !this.volumeStatus() || volume.release.status === this.volumeStatus();
      const matchYear = !this.volumeYear() || volume.release.value?.includes(this.volumeYear());
      const matchPrice =
        !this.volumeHasPrice() ||
        (this.volumeHasPrice() === 'true'
          ? volume.coverPriceBrl !== null ||
            (volume.variants ?? []).some((variant) => variant.coverPriceBrl !== null)
          : volume.coverPriceBrl === null &&
            !(volume.variants ?? []).some((variant) => variant.coverPriceBrl !== null));
      return matchSearch && matchStatus && matchYear && matchPrice;
    });
    return [...values].sort((left, right) => {
      if (this.volumeSort() === 'date_asc' || this.volumeSort() === 'date_desc') {
        const direction = this.volumeSort() === 'date_asc' ? 1 : -1;
        const leftKey = this.releaseSortKey(left);
        const rightKey = this.releaseSortKey(right);
        if (leftKey === Number.MAX_SAFE_INTEGER) return rightKey === leftKey ? 0 : 1;
        if (rightKey === Number.MAX_SAFE_INTEGER) return -1;
        return direction * (leftKey - rightKey);
      }
      if (this.volumeSort() === 'price_asc' || this.volumeSort() === 'price_desc') {
        const direction = this.volumeSort() === 'price_asc' ? 1 : -1;
        if (left.coverPriceBrl === null) return 1;
        if (right.coverPriceBrl === null) return -1;
        return direction * (left.coverPriceBrl - right.coverPriceBrl) || left.number - right.number;
      }
      return left.number - right.number;
    });
  });

  constructor() {
    const slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';
    void this.loadManga(slug);
  }

  private async loadManga(slug: string): Promise<void> {
    try {
      const value = await this.repo.findBySlug(slug);
      this.manga.set(value);
      this.imageFailed.set(false);
    } finally {
      this.loading.set(false);
    }
  }

  releaseDescription(volume: Volume): string {
    const status =
      volume.release.status === 'released'
        ? 'Lançado'
        : volume.release.status === 'planned'
          ? 'Previsto'
          : 'Situação desconhecida';
    const precision =
      volume.release.precision === 'day'
        ? 'data confirmada'
        : volume.release.precision === 'month'
          ? 'mês informado'
          : volume.release.precision === 'year'
            ? 'ano informado'
            : 'data não informada';
    return `${status} · ${precision}`;
  }

  formatTypeLabel(formatType: string): string {
    switch (formatType) {
      case 'regular':
        return 'Regular';
      case 'two_in_one':
        return '2 em 1';
      case 'three_in_one':
        return '3 em 1';
      case 'omnibus':
        return 'Omnibus';
      case 'definitive':
        return 'Edição definitiva';
      case 'deluxe':
        return 'Deluxe';
      case 'other':
        return 'Outro formato';
      default:
        return 'Volume convencional';
    }
  }

  private releaseSortKey(volume: Volume): number {
    const value = volume.release.value;
    if (!value) return Number.MAX_SAFE_INTEGER;
    const dayMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
    if (dayMatch)
      return (
        Number(dayMatch[3]) * 100_000_000 +
        Number(dayMatch[2]) * 1_000_000 +
        Number(dayMatch[1]) * 1_000 +
        3
      );
    const monthMatch = /^(\d{1,2})\/(\d{4})$/.exec(value);
    if (monthMatch)
      return Number(monthMatch[2]) * 100_000_000 + Number(monthMatch[1]) * 1_000_000 + 2;
    if (/^\d{4}$/.test(value)) return Number(value) * 100_000_000 + 1;
    return Number.MAX_SAFE_INTEGER;
  }
}
