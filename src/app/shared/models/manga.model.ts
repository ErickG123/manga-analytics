import type { Volume } from './volume.model';

export interface Manga {
  id: string;
  slug: string;
  title: string;
  originalTitle?: string;
  author?: string;
  publisher: string;
  category: string;
  description: string;
  accent: string;
  initials: string;
  coverUrl?: string | null;
  volumesCount?: number;
  updatedAt?: string;
  editions?: { id: string; name: string; format: string; status: string; publisher: string }[];
  volumes: Volume[];
  sourceUrl?: string;
  sourceUpdatedAt?: string;
}

export type { Volume, VolumeVariant } from './volume.model';
export type { ReleaseDate, ReleaseStatus, DatePrecision } from './release-date.model';
export type { PriceObservation } from './price-observation.model';
