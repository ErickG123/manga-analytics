import type { ReleaseDate } from './release-date.model';

export interface Volume {
  id: string;
  editionId?: string;
  editionName?: string;
  editionFormat?: string;
  editionFormatType?: string;
  number: number;
  title?: string;
  release: ReleaseDate;
  coverPriceBrl: number | null;
  isbn13?: string;
  coverUrl?: string | null;
  variants?: VolumeVariant[];
}

export interface VolumeVariant {
  id: string;
  name: string;
  release: ReleaseDate;
  coverPriceBrl: number | null;
  coverUrl?: string | null;
}
