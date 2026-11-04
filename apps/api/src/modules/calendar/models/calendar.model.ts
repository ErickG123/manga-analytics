export interface CalendarReleaseDto {
  id: string;
  slug: string;
  title: string;
  publisher: string;
  number: number;
  date: string | null;
  precision: 'day' | 'month' | 'year' | 'unknown';
  year: number | null;
  month: number | null;
  day: number | null;
  status: 'released' | 'planned' | 'unknown';
  price: number | null;
  coverUrl?: string | null;
}

export interface CalendarFilterParams {
  year?: string;
  month?: string;
  publisher?: string;
  status?: string;
  manga?: string;
  from?: string;
  to?: string;
  hasPrice?: string;
  page?: string;
  limit?: string;
}
