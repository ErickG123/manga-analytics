export interface CatalogQuery {
  search: string;
  publisher: string;
  category: string;
  status: string;
  yearFrom: string;
  yearTo: string;
  volumesMin: string;
  volumesMax: string;
  hasPrice: string;
  upcoming: string;
  hasCover: string;
  sort: string;
  page: number;
  limit: number;
}

export interface CatalogFacets {
  categories: string[];
  statuses: string[];
  publishers: { id: string; name: string; slug: string }[];
}
