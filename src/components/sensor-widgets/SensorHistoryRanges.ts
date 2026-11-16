export type HistoryRange = '1h' | '6h' | '24h' | 'all';
export const HISTORY_RANGES: { value: HistoryRange; label: string; seconds?: number }[] = [
    { value: '1h', label: '1 hour', seconds: 3600 },
    { value: '6h', label: '6 hours', seconds: 21600 },
    { value: '24h', label: '24 hours', seconds: 86400 },
    { value: 'all', label: 'All available' },
];
