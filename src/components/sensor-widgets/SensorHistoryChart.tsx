import React, { useMemo } from 'react';
import { IonCard, IonCardContent, IonText } from '@ionic/react';
import type { SensorHistoryPoint } from '../../services/capability-operations';
import './sensor-widgets.css';

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
    const chart = useMemo(() => {
        if (!points.length) return null;
        const values = points.map(point => point.value);
        const scale = makeScale(values, min, max);
        const y = (value: number) => PLOT.bottom - ((value - scale.min) / (scale.max - scale.min)) * (PLOT.bottom - PLOT.top);
        const x = (index: number) => points.length === 1
            ? (PLOT.left + PLOT.right) / 2
            : PLOT.left + (index / (points.length - 1)) * (PLOT.right - PLOT.left);
        const line = points.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ');
        const area = `${PLOT.left},${PLOT.bottom} ${line} ${PLOT.right},${PLOT.bottom}`;
        const yTicks = Array.from({ length: 6 }, (_, index) => scale.min + ((scale.max - scale.min) * index / 5)).reverse();
        const xIndices = Array.from(new Set([0, Math.round((points.length - 1) / 4), Math.round((points.length - 1) / 2), Math.round((points.length - 1) * 3 / 4), points.length - 1]));
        return { line, area, yTicks, xIndices, x, y, scale };
    }, [points, min, max]);

    return <IonCard className="sensor-history-card">
        <IonCardContent>
            <div className="sensor-history-heading">
                <div>
                    <IonText className="sensor-history-title">{title} History</IonText>
                    <div className="sensor-history-subtitle">Recent measurements</div>
                </div>
                <span className="sensor-history-period">Last hour</span>
            </div>
            {error && <IonText color="danger"><p className="sensor-history-message">{error}</p></IonText>}
            {loading && !points.length && <div className="sensor-history-message">Loading sensor history…</div>}
            {!loading && !error && !points.length && <div className="sensor-history-message">No history is available yet.</div>}
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
                    <path d={`M ${chart.area} Z`} className="sensor-history-area" />
                    <polyline points={chart.line} className="sensor-history-line" />
                    <line x1={PLOT.left} y1={PLOT.bottom} x2={PLOT.right} y2={PLOT.bottom} className="sensor-history-axis" />
                    {chart.xIndices.map(index => {
                        const xx = chart.x(index);
                        return <text key={`x-label-${index}`} x={xx} y={PLOT.bottom + 25} textAnchor="middle" className="sensor-history-axis-label">{formatTime(points[index].timestamp)}</text>;
                    })}
                    {unit && <text x={PLOT.left} y={12} className="sensor-history-unit">{unit}</text>}
                </svg>
            </div>}
            {loading && points.length > 0 && <div className="sensor-history-refreshing">Updating history…</div>}
        </IonCardContent>
    </IonCard>;
};

export default SensorHistoryChart;
