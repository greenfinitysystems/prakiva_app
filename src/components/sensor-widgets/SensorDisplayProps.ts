/** Shared sensor display contract for circular and linear gauges. */
export interface SensorDisplayProps {
    title: string;
    value?: number;
    /** Optional raw reading from the same controller acquisition snapshot. */
    rawValue?: number;
    unit?: string;
    min?: number;
    max?: number;
    precision?: number;
    status: 'loading' | 'valid' | 'invalid' | 'unavailable' | 'stale' | 'error';
    statusText?: string;
    updatedAt?: number;
}
