import type { SensorDisplayProps } from './SensorDisplayProps';
import { useDampedPointer } from './useDampedPointer';
import React, { useEffect, useMemo, useRef, useState } from 'react';

const formatValue = (value: number, precision: number) =>
    value.toFixed(Math.max(0, Math.min(6, precision)));


const statusLabel: Record<SensorDisplayProps['status'], string> = {
    loading: 'Reading…',
    valid: 'Sensor online',
    invalid: 'Invalid measurement',
    unavailable: 'Unavailable',
    stale: 'Stale reading',
    error: 'Read failed',
};

const CENTER = 180;
const TICK_OUTER_RADIUS = 139;
const NEEDLE_RADIUS = 112;
const START_ANGLE = 135;
const SWEEP_ANGLE = 270;
const RANGE_EXPANSION_CONFIRMATIONS = 4;

interface GaugeRange {
    min: number;
    max: number;
}

interface OutsideRangeState {
    direction: 'low' | 'high' | null;
    count: number;
}

const pointOnCircle = (radius: number, angleDegrees: number) => {
    const angle = angleDegrees * Math.PI / 180;
    return {
        x: CENTER + radius * Math.cos(angle),
        y: CENTER + radius * Math.sin(angle),
    };
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

    // A first-reading estimate gives the dial useful context without pretending
    // that the virtual sensor has a firmware-declared engineering range.
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
    const precision = absolute >= 100 ? 0 : absolute >= 10 ? 0 : absolute >= 1 ? 1 : 2;
    return Number(value.toFixed(precision)).toString();
};

export const VintageSensorGauge: React.FC<SensorDisplayProps> = ({
    title,
    value,
    rawValue,
    unit = '',
    min,
    max,
    precision = 1,
    status,
    statusText,
    updatedAt,
}) => {
    const [adaptiveRange, setAdaptiveRange] = useState<GaugeRange | null>(() =>
        value !== undefined && Number.isFinite(value) ? makeInitialRange(value, min, max) : null,
    );
    const outsideState = useRef<OutsideRangeState>({ direction: null, count: 0 });
    const previousSampleKey = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (value === undefined || !Number.isFinite(value)) return;
        // updatedAt distinguishes successive controller readings even when the
        // measured value itself has not changed between polls.
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
            const nextCount = outsideState.current.direction === direction
                ? outsideState.current.count + 1
                : 1;
            outsideState.current = { direction, count: nextCount };

            // Brief excursions hit the mechanical stop. A sustained excursion
            // teaches the display a wider scale; the firmware contract is untouched.
            if (nextCount < RANGE_EXPANSION_CONFIRMATIONS) return range;
            outsideState.current = { direction: null, count: 0 };
            return expandRangeToInclude(range, value);
        });
    }, [value, min, max, updatedAt]);

    const range = adaptiveRange ?? (typeof min === 'number' && typeof max === 'number' && max > min
        ? { min, max }
        : { min: 0, max: 1 });
    const span = Math.max(range.max - range.min, Number.EPSILON);
    const normalized = value !== undefined && Number.isFinite(value)
        ? Math.max(0, Math.min(1, (value - range.min) / span))
        : 0;
    const pointerPosition = useDampedPointer(normalized, status === 'valid' && value !== undefined && Number.isFinite(value));
    const needleAngle = START_ANGLE + pointerPosition * SWEEP_ANGLE;
    const needleTip = pointOnCircle(NEEDLE_RADIUS, needleAngle);
    const needleTail = pointOnCircle(25, needleAngle + 180);
    const showRawNeedle = status === 'valid' && rawValue !== undefined && Number.isFinite(rawValue);
    const rawNormalized = showRawNeedle
        ? Math.max(0, Math.min(1, (rawValue - range.min) / span)) : 0;
    const rawTip = pointOnCircle(NEEDLE_RADIUS, START_ANGLE + rawNormalized * SWEEP_ANGLE);
    const displayValue = status === 'valid' && value !== undefined && Number.isFinite(value)
        ? formatValue(value, precision)
        : '—';
    const label = statusText || statusLabel[status];
    const isBelowRange = value !== undefined && value < range.min;
    const isAboveRange = value !== undefined && value > range.max;

    const ticks = useMemo(() => Array.from({ length: 51 }, (_, index) => {
        const angle = START_ANGLE + (index / 50) * SWEEP_ANGLE;
        const major = index % 10 === 0;
        const medium = index % 5 === 0;
        const innerRadius = major ? 119 : medium ? 127 : 132;
        const outer = pointOnCircle(TICK_OUTER_RADIUS, angle);
        const inner = pointOnCircle(innerRadius, angle);
        const tickValue = range.min + (index / 50) * span;
        return { index, major, outer, inner, tickValue };
    }), [range.min, span]);

    const statusLampClass = status === 'valid' ? 'online' : status === 'stale' || status === 'loading' ? 'warning' : 'error';

    return <div className="prakiva-instrument-shell">
            <div className="prakiva-instrument" role="img" aria-label={`${title}: ${displayValue} ${unit}, ${label}`}>
                <div className="prakiva-instrument-bezel">
                    <div className="prakiva-instrument-rim">
                        <svg className="prakiva-instrument-dial" viewBox="0 0 360 360" aria-hidden="true">
                            <defs>
                                <radialGradient id="prakiva-dial-face" cx="48%" cy="38%" r="70%">
                                    <stop offset="0%" stopColor="#fff9e8" />
                                    <stop offset="100%" stopColor="#e6dcc1" />
                                </radialGradient>
                                <linearGradient id="prakiva-needle" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#34332e" />
                                    <stop offset="50%" stopColor="#090909" />
                                    <stop offset="100%" stopColor="#45433b" />
                                </linearGradient>
                                <radialGradient id="prakiva-brass-hub" cx="35%" cy="30%" r="75%">
                                    <stop offset="0%" stopColor="#e0c27b" />
                                    <stop offset="55%" stopColor="#b28a42" />
                                    <stop offset="100%" stopColor="#65451f" />
                                </radialGradient>
                            </defs>

                            <circle cx="180" cy="180" r="174" className="prakiva-dial-shadow" />
                            <circle cx="180" cy="180" r="166" fill="url(#prakiva-dial-face)" className="prakiva-dial-face" />
                            <circle cx="180" cy="180" r="160" className="prakiva-dial-inner-ring" />

                            {/* Subtle top index and restrained red end-of-scale marks. */}
                            <path d="M 174 19 L 186 19 L 180 38 Z" className="prakiva-dial-index" />
                            {ticks.map(tick => {
                                const isEndWarning = tick.index <= 3 || tick.index >= 47;
                                return <g key={tick.index}>
                                    <line
                                        x1={tick.inner.x} y1={tick.inner.y}
                                        x2={tick.outer.x} y2={tick.outer.y}
                                        className={isEndWarning ? 'prakiva-dial-tick prakiva-dial-tick-warning' : 'prakiva-dial-tick'}
                                        strokeWidth={tick.major ? 2.8 : tick.index % 5 === 0 ? 1.8 : 1}
                                    />
                                    {tick.major && <text
                                        x={pointOnCircle(103, START_ANGLE + (tick.index / 50) * SWEEP_ANGLE).x}
                                        y={pointOnCircle(103, START_ANGLE + (tick.index / 50) * SWEEP_ANGLE).y + 5}
                                        textAnchor="middle"
                                        className="prakiva-dial-number"
                                    >{formatTick(tick.tickValue)}</text>}
                                </g>;
                            })}

                            {/* The wordmark is the sole brand element on the instrument face. */}
                            <text className="prakiva-dial-brand-wordmark" x="180" y="128" textAnchor="middle">PRAKIVA</text>
                            <text x="180" y="149" textAnchor="middle" className="prakiva-dial-measurement-label">{title.toUpperCase()}</text>

                            {/* Unit sits below the spindle, clear of the brand and measurement title. */}
                            {unit && <text x="180" y="218" textAnchor="middle" className="prakiva-dial-unit-label">{unit}</text>}

                                                         {showRawNeedle && <line x1="180" y1="180" x2={rawTip.x} y2={rawTip.y}
                                 className="prakiva-instrument-raw-needle" />}
{/* Needle is clamped to the scale endpoints for hard-stop behaviour. */}
                            <line
                                x1={needleTail.x} y1={needleTail.y}
                                x2={needleTip.x} y2={needleTip.y}
                                className="prakiva-instrument-needle"
                                stroke="url(#prakiva-needle)"
                            />
                            <circle cx="180" cy="180" r="17" className="prakiva-needle-hub-outer" />
                            <circle cx="180" cy="180" r="12.5" className="prakiva-needle-hub-brass" />
                            <circle cx="180" cy="180" r="2" className="prakiva-needle-hub-pin" />

                            <rect x="128" y="246" width="104" height="43" rx="7" className="prakiva-digital-window" />
                            <text x="180" y="275" textAnchor="middle" className="prakiva-digital-reading">{displayValue}</text>

                            <circle cx="180" cy="310" r="5.5" className={`prakiva-status-lamp prakiva-status-lamp-${statusLampClass}`} />
                            {(isBelowRange || isAboveRange) && <text
                                x="180" y="350" textAnchor="middle" className="prakiva-overrange-caption"
                            >{isBelowRange ? 'BELOW SCALE' : 'ABOVE SCALE'}</text>}
                        </svg>
                        <span className="prakiva-bezel-screw prakiva-screw-top" />
                        <span className="prakiva-bezel-screw prakiva-screw-left" />
                        <span className="prakiva-bezel-screw prakiva-screw-right" />
                        <span className="prakiva-bezel-screw prakiva-screw-bottom" />
                    </div>
                </div>
            </div>

    </div>;
};
