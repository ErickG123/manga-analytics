export interface CalendarEntry {
  id: string;
  slug: string;
  title: string;
  number: number;
  publisher: string;
  date: string | null;
  precision: 'day' | 'month' | 'year' | 'unknown';
  year: number | null;
  month: number | null;
  day: number | null;
  status: 'released' | 'planned' | 'unknown';
  price: number | null;
  coverUrl?: string | null;
}
