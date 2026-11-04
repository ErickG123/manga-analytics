export type DatePrecision = 'day' | 'month' | 'year' | 'unknown';
export type ReleaseStatus = 'released' | 'planned' | 'unknown';

export interface ReleaseDate {
  value: string | null;
  precision: DatePrecision;
  status: ReleaseStatus;
}
