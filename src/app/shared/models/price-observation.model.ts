export interface PriceObservation {
  volumeId: string;
  amountBrl: number;
  observedAt: string;
  sourceUrl: string;
  kind: 'cover' | 'retail';
}
