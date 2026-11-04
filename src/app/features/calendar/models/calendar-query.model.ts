import type { CalendarEntry } from './calendar-entry.model';

export interface CalendarFilters {
  year?: number;
  month?: number;
  publisher?: string;
  status?: string;
  manga?: string;
  from?: string;
  to?: string;
  hasPrice?: string;
  page?: number;
}

export interface CalendarResult {
  data: CalendarEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
