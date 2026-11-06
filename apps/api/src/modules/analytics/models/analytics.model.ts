export interface AnalyticsOverviewDto {
  totalMangas: number;
  totalVolumes: number;
  totalPublishers: number;
  averagePrice: number;
}

export interface MangaPriceAvgDto {
  id: string;
  title: string;
  slug: string;
  averagePrice: number;
  volumesCount: number;
}

export interface PublisherPriceAvgDto {
  id: string;
  name: string;
  slug: string;
  averagePrice: number;
  volumesCount: number;
}

export interface ReleaseMonthAggregateDto {
  year: number;
  month: number;
  label: string;
  count: number;
}

export interface AnalyticsFilters {
  yearFrom?: string;
  yearTo?: string;
  publisherId?: string;
  category?: string;
  status?: string;
  hasPrice?: string;
  manga?: string;
}
