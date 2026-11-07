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
  formatType?: string;
}

export interface EditionFormatAggregateDto {
  formatType: string;
  label: string;
  editionsCount: number;
  mangaCount: number;
  volumesCount: number;
}

export interface ReleaseYearRangeDto {
  minYear: number | null;
  maxYear: number | null;
}

export interface PriceByFormatDto {
  formatType: string;
  label: string;
  editionsCount: number;
  mangaCount: number;
  volumesCount: number;
  pricedVolumes: number;
  priceCoverage: number | null;
  averagePrice: number | null;
  medianPrice: number | null;
  lowerQuartilePrice: number | null;
  upperQuartilePrice: number | null;
  normalizedAveragePrice: number | null;
  normalizedSampleSize: number;
}

export interface PricePerPagePublisherDto {
  publisherId: string;
  publisher: string;
  averagePricePerPage: number | null;
  averagePages: number | null;
  pricedVolumes: number;
  volumesWithPageCount: number;
  volumesCount: number;
  pageCoverage: number | null;
}

export interface ObservedPriceMonthDto {
  year: number;
  month: number;
  label: string;
  observationsCount: number;
  changesCount: number;
  increasesCount: number;
  decreasesCount: number;
  averageObservedPrice: number | null;
  averageChangePercent: number | null;
}

export interface ComparableEditionPriceDto {
  mangaId: string;
  manga: string;
  volumeNumber: number;
  editionId: string;
  publication: string;
  publisher: string;
  formatType: string;
  formatLabel: string;
  volumesPerBook: number | null;
  price: number;
  normalizedPrice: number | null;
  comparableEditions: number;
}
