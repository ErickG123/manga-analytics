export interface CalendarEntry {
  id: string;
  slug: string;
  title: string;
  number: number;
  date: string;
  status: 'released' | 'planned' | 'unknown';
  price: number | null;
}
