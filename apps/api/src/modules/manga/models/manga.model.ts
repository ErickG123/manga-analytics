export interface MangaVolumeDto {
  id: string;
  number: number;
  title: string;
  price: string;
  releaseDate?: string;
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
  volumes: MangaVolumeDto[];
}

export interface MangaDetailDto extends MangaListItemDto {
  editions: {
    id: string;
    name: string;
    format: string;
    status: string;
    publisher: string;
  }[];
}

export interface MangaQueryParams {
  search?: string;
  publisher?: string;
  category?: string;
  status?: string;
  yearFrom?: string;
  yearTo?: string;
  sort?:
    'title_asc' | 'title_desc' | 'recent' | 'oldest' | 'price_asc' | 'price_desc' | 'volumes_desc';
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
