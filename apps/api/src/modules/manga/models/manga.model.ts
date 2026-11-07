export interface MangaVolumeVariantDto {
  id: string;
  name: string;
  release: { value: string | null | undefined; precision: string; status: string };
  coverUrl?: string | null;
  coverPriceBrl: number | null;
  priceStatus: 'priced' | 'not_informed';
}

export interface MangaVolumeDto {
  id: string;
  editionId: string;
  editionName: string;
  editionFormat: string;
  editionFormatType: string;
  number: number;
  title?: string | null;
  isbn13?: string | null;
  coverUrl?: string | null;
  release: { value: string | null | undefined; precision: string; status: string };
  coverPriceBrl: number | null;
  priceStatus: 'priced' | 'not_informed';
  variants: MangaVolumeVariantDto[];
}

export interface MangaListItemDto {
  id: string;
  title: string;
  slug: string;
  originalTitle?: string | null;
  author?: string | null;
  publisher: string;
  category: string;
  description: string;
  accent: string;
  initials: string;
  coverUrl?: string | null;
  volumesCount: number;
  updatedAt?: Date;
  sourceUrl?: string | null;
  sourceUpdatedAt?: Date | null;
  volumes: MangaVolumeDto[];
}

export interface MangaEditionDto {
  id: string;
  name: string;
  format: string;
  formatType: string;
  formatDetails: string | null;
  volumesPerBook: number | null;
  formatEvidence: string | null;
  status: string;
  publisher: string;
}

export interface MangaDetailDto extends MangaListItemDto {
  editions: MangaEditionDto[];
}

export interface MangaQueryParams {
  search?: string;
  publisher?: string;
  category?: string;
  status?: string;
  yearFrom?: string;
  yearTo?: string;
  hasPrice?: string;
  upcoming?: string;
  hasCover?: string;
  volumesMin?: string;
  volumesMax?: string;
  ids?: string;
  sort?:
    | 'title_asc'
    | 'title_desc'
    | 'recent'
    | 'oldest'
    | 'volumes_desc'
    | 'volumes_asc'
    | 'release_desc';
  page?: string;
  limit?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
