export interface CalendarReleaseDto {
  id: string;
  slug: string;
  title: string;
  publisher: string;
  number: number;
  date: string;
  status: 'released' | 'planned' | 'unknown';
  price: number | null;
  coverUrl?: string | null;
}

export interface CalendarFilterParams {
  year?: string;
  month?: string;
  publisher?: string;
  status?: string;
}
