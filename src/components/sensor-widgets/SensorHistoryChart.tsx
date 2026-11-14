import React, { useMemo, useState } from 'react';
import { IonCard, IonCardContent, IonText } from '@ionic/react';
import type { SensorHistoryPoint } from '../../services/capability-operations';
import '../../theme/skins/default/styles/components/sensor-widgets/sensor-widgets.css';

export interface SensorHistoryChartProps {
    title: string;
    unit?: string;
    points: SensorHistoryPoint[];
    loading?: boolean;
    error?: string;
    min?: number;
    max?: number;
}

const WIDTH = 760;
const HEIGHT = 290;
const PLOT = { left: 62, right: 744, top: 18, bottom: 238 };
type HistoryRange = '1h' | '6h' | '24h' | 'all';
const HISTORY_RANGES: { value: HistoryRange; label: string; seconds?: number }[] = [
    { value: '1h', label: '1 hour', seconds: 3600 },
    { value: '6h', label: '6 hours', seconds: 21600 },
    { value: '24h', label: '24 hours', seconds: 86400 },
    { value: 'all', label: 'All available' },
];
const numberLabel = (value: number) => Number(value.toFixed(2)).toString();

function makeScale(values: number[], declaredMin?: number, declaredMax?: number) {
    if (typeof declaredMin === 'number' && typeof declaredMax === 'number' &&
        Number.isFinite(declaredMin) && Number.isFinite(declaredMax) && declaredMax > declaredMin) {
        return { min: declaredMin, max: declaredMax };
    }
    const dataMin = values.length ? Math.min(...values) : 0;
    const dataMax = values.length ? Math.max(...values) : 1;
    const span = Math.max(dataMax - dataMin, Math.abs(dataMax) * 0.08, 1);
    const padding = span * 0.12;
    return { min: dataMin - padding, max: dataMax + padding };
}

const formatTime = (timestamp: number) => new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', hour12: false,
});

const SensorHistoryChart: React.FC<SensorHistoryChartProps> = ({
    title, unit = '', points, loading = false, error, min, max,
}) => {
    const [range, setRange] = useState<HistoryRange>('all');
    const visiblePoints = useMemo(() => {
        const selected = HISTORY_RANGES.find(item => item.value === range);
        if (!selected?.seconds) return points;
        const cutoff = Date.now() / 1000 - selected.seconds;
        return points.filter(point => point.timestamp >= cutoff);
    }, [points, range]);

    const chart = useMemo(() => {
        if (!visiblePoints.length) return null;
        const values = visiblePoints.flatMap(point => point.value === null ? [] : [point.value]);
        const scale = makeScale(values, min, max);
        const y = (value: number) => PLOT.bottom - ((value - scale.min) / (scale.max - scale.min)) * (PLOT.bottom - PLOT.top);
        const x = (index: number) => visiblePoints.length === 1
            ? (PLOT.left + PLOT.right) / 2
            : PLOT.left + (index / (visiblePoints.length - 1)) * (PLOT.right - PLOT.left);
        // Missing measurements break the line. Never connect across a null point.
        const segments: string[] = [];
        let current: string[] = [];
        visiblePoints.forEach((point, index) => {
            if (point.value === null) {
                if (current.length) segments.push(current.join(' '));
                current = [];
            } else {
                current.push(`${x(index).toFixed(1)},${y(point.value).toFixed(1)}`);
            }
        });
        if (current.length) segments.push(current.join(' '));
        const yTicks = Array.from({ length: 6 }, (_, index) => scale.min + ((scale.max - scale.min) * index / 5)).reverse();
        const xIndices = Array.from(new Set([0, Math.round((visiblePoints.length - 1) / 4), Math.round((visiblePoints.length - 1) / 2), Math.round((visiblePoints.length - 1) * 3 / 4), visiblePoints.length - 1]));
        return { segments, yTicks, xIndices, x, y, scale };
    }, [visiblePoints, min, max]);

    return <IonCard className="sensor-history-card">
        <IonCardContent>
            <div className="sensor-history-heading">
                <div>
                    <IonText className="sensor-history-title">{title} History</IonText>
                    <div className="sensor-history-subtitle">Recent measurements</div>
                </div>
                <label className="sensor-history-range-control">
                    <span className="sensor-history-range-label">Range</span>
                    <select aria-label="History time range" value={range} onChange={event => setRange(event.target.value as HistoryRange)}>
                        {HISTORY_RANGES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                </label>
            </div>
            {error && <IonText color="danger"><p className="sensor-history-message">{error}</p></IonText>}
            {loading && !points.length && <div className="sensor-history-message">Loading sensor history…</div>}
            {!loading && !error && !points.length && <div className="sensor-history-message">No history is available yet.</div>}
            {!loading && !error && points.length > 0 && !visiblePoints.length && <div className="sensor-history-message">No measurements in the selected time range.</div>}
            {chart && <div className="sensor-history-chart-wrap">
                <svg className="sensor-history-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${title} history chart`}>
                    <defs>
                        <linearGradient id="sensor-history-area" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" className="sensor-history-area-top" />
                            <stop offset="100%" className="sensor-history-area-bottom" />
                        </linearGradient>
                    </defs>
                    {chart.yTicks.map((tick, index) => {
                        const yy = chart.y(tick);
                        return <g key={`y-${index}`}>
                            <line x1={PLOT.left} y1={yy} x2={PLOT.right} y2={yy} className="sensor-history-grid-major" />
                            <text x={PLOT.left - 10} y={yy + 4} textAnchor="end" className="sensor-history-axis-label">{numberLabel(tick)}</text>
                        </g>;
                    })}
                    {Array.from({ length: 9 }, (_, index) => {
                        const xx = PLOT.left + (index / 8) * (PLOT.right - PLOT.left);
                        return <line key={`x-${index}`} x1={xx} y1={PLOT.top} x2={xx} y2={PLOT.bottom} className="sensor-history-grid-minor" />;
                    })}
                    {chart.segments.map((segment, index) =>
                        <polyline key={`segment-${index}`} points={segment} className="sensor-history-line" />
                    )}
                    <line x1={PLOT.left} y1={PLOT.bottom} x2={PLOT.right} y2={PLOT.bottom} className="sensor-history-axis" />
                    {chart.xIndices.map(index => {
                        const xx = chart.x(index);
                        return <text key={`x-label-${index}`} x={xx} y={PLOT.bottom + 25} textAnchor="middle" className="sensor-history-axis-label">{formatTime(visiblePoints[index].timestamp)}</text>;
                    })}
                    {unit && <text x={PLOT.left} y={12} className="sensor-history-unit">{unit}</text>}
                </svg>
            </div>}
            {loading && points.length > 0 && <div className="sensor-history-refreshing">Updating history…</div>}
        </IonCardContent>
    </IonCard>;
};

export default SensorHistoryChart;
