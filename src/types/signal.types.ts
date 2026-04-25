export interface Signal {
  traceId: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  volume: number;
}
