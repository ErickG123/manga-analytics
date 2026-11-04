export interface AnalyticsOverview {
  totalMangas: number;
  totalVolumes: number;
  totalPublishers: number;
  averagePrice: number | null;
  pricedVolumes: number;
  unpricedVolumes: number;
  priceCoverage: number | null;
  datedVolumes: number;
  dateCoverage: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  medianPrice: number | null;
  sampleSize: number;
  priceBasis: string;
  releaseCount: number;
}

export interface PriceByManga {
  id: string;
  title: string;
  slug: string;
  averagePrice: number | null;
  volumesCount: number;
  pricedVolumes: number;
  priceCoverage: number | null;
  sampleSize: number;
}

export interface PriceByPublisher {
  id: string;
  name: string;
  slug: string;
  averagePrice: number | null;
  volumesCount: number;
  mangaCount: number;
  pricedVolumes: number;
  priceCoverage: number | null;
  sampleSize: number;
}

export interface ReleasesByMonth {
  year: number;
  month: number;
  label: string;
  count: number;
}
export interface AnalyticsFilters {
  yearFrom?: number;
  yearTo?: number;
  publisherId?: string;
  category?: string;
  status?: string;
  hasPrice?: string;
  manga?: string;
}
export interface ReleasesByYear {
  year: number;
  count: number;
}
export interface PriceBand {
  band: string;
  count: number;
}
