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
  volumes: Volume[];
  sourceUrl?: string;
  updatedAt?: string;
}

export type { Volume } from './volume.model';
export type { ReleaseDate, ReleaseStatus, DatePrecision } from './release-date.model';
export type { PriceObservation } from './price-observation.model';
