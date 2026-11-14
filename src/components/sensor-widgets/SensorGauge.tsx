import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IonCard, IonCardContent, IonText } from '@ionic/react';
import '../../theme/skins/default/styles/components/sensor-widgets/sensor-widgets.css';

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

const formatValue = (value: number, precision: number) =>
    value.toFixed(Math.max(0, Math.min(6, precision)));

const statusLabel: Record<SensorDisplayProps['status'], string> = {
    loading: 'Reading…',
    valid: 'Online',
    invalid: 'Invalid measurement',
    unavailable: 'Unavailable',
    stale: 'Stale reading',
    error: 'Read failed',
};

const CENTER_X = 180;
const CENTER_Y = 151;
const START_ANGLE = 135;
const SWEEP_ANGLE = 270;
const RANGE_EXPANSION_CONFIRMATIONS = 4;

interface GaugeRange { min: number; max: number; }
interface OutsideRangeState { direction: 'low' | 'high' | null; count: number; }

const pointOnCircle = (radius: number, angleDegrees: number) => {
    const angle = angleDegrees * Math.PI / 180;
    return { x: CENTER_X + radius * Math.cos(angle), y: CENTER_Y + radius * Math.sin(angle) };
};

const arcPath = (radius: number, startAngle: number, sweep: number) => {
    const start = pointOnCircle(radius, startAngle);
    const end = pointOnCircle(radius, startAngle + sweep);
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
};

const niceStep = (roughStep: number): number => {
    if (!Number.isFinite(roughStep) || roughStep <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
};

const makeInitialRange = (value: number, min?: number, max?: number): GaugeRange => {
    if (typeof min === 'number' && typeof max === 'number' && Number.isFinite(min) && Number.isFinite(max) && max > min) {
        return { min, max };
    }
    const span = Math.max(Math.abs(value) * 0.4, 4);
    const step = niceStep(span / 5);
    return {
        min: Math.floor((value - span / 2) / step) * step,
        max: Math.ceil((value + span / 2) / step) * step,
    };
};

const expandRangeToInclude = (range: GaugeRange, value: number): GaugeRange => {
    const currentSpan = Math.max(range.max - range.min, Math.abs(value) * 0.1, 1);
    const padding = currentSpan * 0.12;
    const nextMin = Math.min(range.min, value - padding);
    const nextMax = Math.max(range.max, value + padding);
    const step = niceStep((nextMax - nextMin) / 6);
    return {
        min: Math.floor(nextMin / step) * step,
        max: Math.ceil(nextMax / step) * step,
    };
};

const formatTick = (value: number): string => {
    const absolute = Math.abs(value);
    const precision = absolute >= 10 ? 0 : absolute >= 1 ? 1 : 2;
    return Number(value.toFixed(precision)).toString();
};

export const SensorGauge: React.FC<SensorDisplayProps> = ({
    title, value, rawValue, unit = '', min, max, precision = 1, status, statusText, updatedAt,
}) => {
    const [adaptiveRange, setAdaptiveRange] = useState<GaugeRange | null>(() =>
        value !== undefined && Number.isFinite(value) ? makeInitialRange(value, min, max) : null,
    );
    const outsideState = useRef<OutsideRangeState>({ direction: null, count: 0 });
    const previousSampleKey = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (value === undefined || !Number.isFinite(value)) return;
        const sampleKey = updatedAt ?? value;
        if (previousSampleKey.current === sampleKey) return;
        previousSampleKey.current = sampleKey;

        setAdaptiveRange(current => {
            const range = current ?? makeInitialRange(value, min, max);
            if (value >= range.min && value <= range.max) {
                outsideState.current = { direction: null, count: 0 };
                return range;
            }
            const direction = value < range.min ? 'low' : 'high';
            const nextCount = outsideState.current.direction === direction ? outsideState.current.count + 1 : 1;
            outsideState.current = { direction, count: nextCount };
            if (nextCount < RANGE_EXPANSION_CONFIRMATIONS) return range;
            outsideState.current = { direction: null, count: 0 };
            return expandRangeToInclude(range, value);
        });
    }, [value, min, max, updatedAt]);

    const range = adaptiveRange ?? (typeof min === 'number' && typeof max === 'number' && max > min
        ? { min, max } : { min: 0, max: 1 });
    const span = Math.max(range.max - range.min, Number.EPSILON);
    const normalized = value !== undefined && Number.isFinite(value)
        ? Math.max(0, Math.min(1, (value - range.min) / span)) : 0;
    const angle = START_ANGLE + normalized * SWEEP_ANGLE;
    const needleTip = pointOnCircle(83, angle);
    const showRawNeedle = status === 'valid' && rawValue !== undefined && Number.isFinite(rawValue);
    const rawNormalized = showRawNeedle
        ? Math.max(0, Math.min(1, (rawValue - range.min) / span)) : 0;
    const rawNeedleTip = pointOnCircle(83, START_ANGLE + rawNormalized * SWEEP_ANGLE);
    const displayValue = status === 'valid' && value !== undefined && Number.isFinite(value)
        ? formatValue(value, precision) : '—';
    const label = statusText || statusLabel[status];
    const isBelowRange = value !== undefined && value < range.min;
    const isAboveRange = value !== undefined && value > range.max;

    const ticks = useMemo(() => Array.from({ length: 51 }, (_, index) => {
        const tickAngle = START_ANGLE + (index / 50) * SWEEP_ANGLE;
        const major = index % 10 === 0;
        const medium = index % 5 === 0;
        const outer = pointOnCircle(119, tickAngle);
        const inner = pointOnCircle(major ? 103 : medium ? 109 : 113, tickAngle);
        const labelPoint = pointOnCircle(88, tickAngle);
        const tickValue = range.min + (index / 50) * span;
        return { index, major, outer, inner, labelPoint, tickValue };
    }), [range.min, span]);

    const statusClass = status === 'valid' ? 'online' : status === 'stale' || status === 'loading' ? 'warning' : 'error';

    return <IonCard className="sensor-widget-card sensor-gauge-card">
        <IonCardContent>
            <div className="sensor-widget-heading">
                <IonText className="sensor-widget-title">{title}</IonText>
                <span className={`sensor-widget-status sensor-status-${status}`}>{label}</span>
            </div>
            <div className="sensor-contemporary-gauge" role="img" aria-label={`${title}: ${displayValue} ${unit}, ${label}`}>
                <svg className="sensor-contemporary-gauge-svg" viewBox="0 0 360 286" aria-hidden="true">
                    <defs>
                        <linearGradient id="sensor-gauge-needle" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#176b35" />
                            <stop offset="100%" stopColor="#2fae53" />
                        </linearGradient>
                    </defs>
                    <path d={arcPath(126, START_ANGLE, SWEEP_ANGLE)} className="sensor-gauge-track" />
                    <path
                        d={arcPath(126, START_ANGLE, Math.max(0.01, normalized * SWEEP_ANGLE))}
                        className="sensor-gauge-progress"
                    />
                    {ticks.map(tick => <g key={tick.index}>
                        <line
                            x1={tick.inner.x} y1={tick.inner.y}
                            x2={tick.outer.x} y2={tick.outer.y}
                            className={`sensor-gauge-tick${tick.major ? ' sensor-gauge-tick-major' : ''}`}
                        />
                        {tick.major && <text
                            x={tick.labelPoint.x} y={tick.labelPoint.y + 4}
                            textAnchor="middle" className="sensor-gauge-tick-label"
                        >{formatTick(tick.tickValue)}</text>}
                    </g>)}
                    <text x="180" y="104" textAnchor="middle" className="sensor-gauge-brand" style={{ fill: '#59616b', fontWeight: 600 }}>PRAKIVA</text>
                    <text x="180" y="190" textAnchor="middle" className="sensor-gauge-subtitle">{title.toUpperCase()}</text>
                    {showRawNeedle && <line x1="180" y1="151" x2={rawNeedleTip.x} y2={rawNeedleTip.y}
                        className="sensor-gauge-raw-needle" />}
                    <line x1="180" y1="151" x2={needleTip.x} y2={needleTip.y} className="sensor-gauge-needle" />
                    <circle cx="180" cy="151" r="12" className="sensor-gauge-hub-outer" />
                    <circle cx="180" cy="151" r="7" className="sensor-gauge-hub-inner" />
                    <rect x="112" y="222" width="136" height="43" rx="10" className="sensor-gauge-digital-window" />
                    <text x="180" y="250" textAnchor="middle" className="sensor-gauge-digital-value">{displayValue} {unit}</text>
                </svg>
            </div>
            {showRawNeedle && <div className="sensor-gauge-needle-legend" aria-label="Green needle calibrated; gray needle raw">
                <span><i className="sensor-gauge-legend-calibrated" />Calibrated</span>
                <span><i className="sensor-gauge-legend-raw" />Raw</span>
            </div>}
            <div className="sensor-gauge-footer">
                <span className={`sensor-gauge-status-dot sensor-gauge-status-${statusClass}`} />
                <span>{status === 'valid' ? 'Live measurement' : label}</span>
                {(isBelowRange || isAboveRange) && <strong>{isBelowRange ? 'Below range' : 'Above range'}</strong>}
            </div>
        </IonCardContent>
    </IonCard>;
};

export const SensorText: React.FC<SensorDisplayProps> = ({
    title, value, unit = '', precision = 1, status, statusText, updatedAt,
}) => {
    const displayValue = status === 'valid' && value !== undefined ? formatValue(value, precision) : '—';
    return <IonCard className="sensor-widget-card sensor-text-card">
        <IonCardContent>
            <div className="sensor-widget-heading">
                <IonText className="sensor-widget-title">{title}</IonText>
                <span className={`sensor-widget-status sensor-status-${status}`}>{statusText || statusLabel[status]}</span>
            </div>
            <div className="sensor-text-reading"><strong>{displayValue}</strong><span>{unit}</span></div>
            {updatedAt && <div className="sensor-widget-updated">Updated {new Date(updatedAt).toLocaleTimeString()}</div>}
        </IonCardContent>
    </IonCard>;
};
