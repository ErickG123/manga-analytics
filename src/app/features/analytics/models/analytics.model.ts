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
  medianPrice: number | null;
  lowerQuartilePrice: number | null;
  upperQuartilePrice: number | null;
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
  formatType?: string;
}
export interface EditionsByFormat {
  formatType: string;
  label: string;
  editionsCount: number;
  mangaCount: number;
  volumesCount: number;
}
export interface ReleasesByYear {
  year: number;
  count: number;
}

export interface ReleaseYearRange {
  minYear: number | null;
  maxYear: number | null;
}
export interface PriceBand {
  band: string;
  count: number;
}

export interface PriceByYear {
  year: number;
  averagePrice: number | null;
  medianPrice: number | null;
  sampleSize: number;
  volumesCount: number;
}

export interface PublisherReleaseMonth {
  publisherId: string;
  publisher: string;
  year: number;
  month: number;
  count: number;
}

export interface PriceByFormat {
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

export interface PricePerPagePublisher {
  publisherId: string;
  publisher: string;
  averagePricePerPage: number | null;
  averagePages: number | null;
  pricedVolumes: number;
  volumesWithPageCount: number;
  volumesCount: number;
  pageCoverage: number | null;
}

export interface ObservedPriceMonth {
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

export interface ComparableEditionPrice {
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
