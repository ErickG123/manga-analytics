import type { CalendarEntry } from './calendar-entry.model';

export interface CalendarPublisher {
  name: string;
  slug: string;
}

export interface CalendarFilters {
  year?: number;
  month?: number;
  monthUnknown?: boolean;
  publisher?: string;
  status?: string;
  manga?: string;
  from?: string;
  to?: string;
  hasPrice?: string;
  page?: number;
  limit?: number;
}

export interface CalendarReleaseMonthSummary {
  year: number;
  month: number | null;
  count: number;
}

export interface CalendarTimelineMonth extends CalendarReleaseMonthSummary {
  key: string;
  label: string;
}

export interface CalendarResult {
  data: CalendarEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
