import type { ReleaseDate } from './release-date.model';

export interface Volume {
  id: string;
  number: number;
  title?: string;
  release: ReleaseDate;
  coverPriceBrl: number | null;
  isbn13?: string;
}
