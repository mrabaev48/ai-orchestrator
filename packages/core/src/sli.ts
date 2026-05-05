export interface SliSnapshot {
  successRatePercent: number;
  timeoutRatePercent: number;
  cancellationRatePercent: number;
  p95LatencyMs: number;
  sampleSize: number;
}
