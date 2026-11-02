import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import './CurveEditor.css';

export type CurveMode = 'analog' | 'binary';

export interface CurvePoint {
    /** X coordinate in the configured domain. */
    x: number;
    /** Y coordinate in the configured range. */
    y: number;
}

export interface CurveDefinition {
    id: string;
    label: string;
    color: string;
    points: CurvePoint[];
}

export interface CurveAxis {
    label: string;
    min: number;
    max: number;
    unit?: string;
    /** Optional tick labels. When omitted, evenly spaced numeric ticks are used. */
    ticks?: number[];
    /** Optional formatter for tick labels. */
    formatTick?: (value: number) => string;
}

export interface CurveEditorProps {
    xAxis: CurveAxis;
    yAxis: CurveAxis;
    mode: CurveMode;
    curves: CurveDefinition[];
    onChange: (curves: CurveDefinition[]) => void;
    /** In binary mode, the only permitted Y values. Defaults to [0, 1]. */
    binaryValues?: [number, number];
    /** X domain is always periodic; points at both domain ends share a Y value. */
    periodic?: true;
    readOnly?: boolean;
    selectedCurveId?: string;
    onSelectedCurveChange?: (id: string) => void;
    /** Optional accessible title above the graph. */
    title?: string;
}

const SVG_WIDTH = 760;
const SVG_HEIGHT = 360;
const LEFT = 58;
const RIGHT = 20;
const TOP = 22;
const BOTTOM = 58;
const PLOT_WIDTH = SVG_WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = SVG_HEIGHT - TOP - BOTTOM;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 1e-7;

function xToSvg(x: number, min: number, max: number): number {
    return LEFT + ((x - min) / (max - min)) * PLOT_WIDTH;
}

function yToSvg(y: number, min: number, max: number): number {
    return TOP + ((max - y) / (max - min)) * PLOT_HEIGHT;
}

function svgToDomain(clientX: number, clientY: number, rect: DOMRect, xAxis: CurveAxis, yAxis: CurveAxis) {
    const px = ((clientX - rect.left) / rect.width) * SVG_WIDTH;
    const py = ((clientY - rect.top) / rect.height) * SVG_HEIGHT;
    return {
        x: clamp(xAxis.min + ((px - LEFT) / PLOT_WIDTH) * (xAxis.max - xAxis.min), xAxis.min, xAxis.max),
        y: clamp(yAxis.max - ((py - TOP) / PLOT_HEIGHT) * (yAxis.max - yAxis.min), yAxis.min, yAxis.max),
    };
}

/** Monotone cubic Hermite interpolation (Fritsch-Carlson-style slope limiting). */
function monotonePath(points: CurvePoint[], xAxis: CurveAxis, yAxis: CurveAxis): string {
    if (points.length < 2) return '';
    const pts = points.map(p => ({ x: xToSvg(p.x, xAxis.min, xAxis.max), y: yToSvg(p.y, yAxis.min, yAxis.max) }));
    const n = pts.length;
    const h: number[] = [];
    const d: number[] = [];
    for (let i = 0; i < n - 1; i++) {
        h[i] = pts[i + 1].x - pts[i].x;
        d[i] = h[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / h[i];
    }

    const m = new Array<number>(n);
    if (n === 2) {
        m[0] = d[0];
        m[1] = d[0];
    } else {
        m[0] = d[0];
        m[n - 1] = d[n - 2];
        for (let i = 1; i < n - 1; i++) {
            if (d[i - 1] === 0 || d[i] === 0 || Math.sign(d[i - 1]) !== Math.sign(d[i])) {
                m[i] = 0;
            } else {
                const w1 = 2 * h[i] + h[i - 1];
                const w2 = h[i] + 2 * h[i - 1];
                m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
            }
        }
        for (let i = 0; i < n - 1; i++) {
            if (d[i] === 0) {
                m[i] = 0;
                m[i + 1] = 0;
            } else {
                const a = m[i] / d[i];
                const b = m[i + 1] / d[i];
                const norm = a * a + b * b;
                if (norm > 9) {
                    const tau = 3 / Math.sqrt(norm);
                    m[i] = tau * a * d[i];
                    m[i + 1] = tau * b * d[i];
                }
            }
        }
    }

    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < n - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x;
        path += ` C ${pts[i].x + dx / 3} ${pts[i].y + m[i] * dx / 3}, ${pts[i + 1].x - dx / 3} ${pts[i + 1].y - m[i + 1] * dx / 3}, ${pts[i + 1].x} ${pts[i + 1].y}`;
    }
    return path;
}

/** Periodic monotone interpolation: the same boundary value and slope are used on both sides of midnight. */
function periodicMonotonePath(points: CurvePoint[], xAxis: CurveAxis, yAxis: CurveAxis): string {
    if (points.length < 3) return monotonePath(points, xAxis, yAxis);
    const min = xAxis.min;
    const max = xAxis.max;
    const period = max - min;
    const interior = points.filter(p => p.x > min && p.x < max);
    const first = points.find(p => nearlyEqual(p.x, min)) ?? { x: min, y: points[0].y };
    const last = points.find(p => nearlyEqual(p.x, max)) ?? { x: max, y: first.y };
    const y0 = (first.y + last.y) / 2;
    const core = [{ x: min, y: y0 }, ...interior, { x: max, y: y0 }];
    const extended = [
        ...core.slice(0, -1).map(p => ({ x: p.x - period, y: p.y })),
        ...core,
        ...core.slice(1).map(p => ({ x: p.x + period, y: p.y })),
    ];
    // Build only the central-period segment, using the neighbouring day's points
    // to calculate compatible slopes on both sides of the midnight boundary.
    return centralPeriodicPath(core, extended, xAxis, yAxis);
}

function centralPeriodicPath(core: CurvePoint[], extended: CurvePoint[], xAxis: CurveAxis, yAxis: CurveAxis): string {
    const xs = extended.map(p => p.x);
    const ys = extended.map(p => p.y);
    const n = xs.length;
    const secants: number[] = [];
    for (let i = 0; i < n - 1; i++) {
        const dx = xs[i + 1] - xs[i];
        secants[i] = dx === 0 ? 0 : (ys[i + 1] - ys[i]) / dx;
    }
    const tangent = new Array<number>(n);
    tangent[0] = secants[0];
    tangent[n - 1] = secants[n - 2];
    for (let i = 1; i < n - 1; i++) {
        const before = secants[i - 1];
        const after = secants[i];
        if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) tangent[i] = 0;
        else tangent[i] = (before + after) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
        if (secants[i] === 0) {
            tangent[i] = 0;
            tangent[i + 1] = 0;
        } else {
            const a = tangent[i] / secants[i];
            const b = tangent[i + 1] / secants[i];
            const norm = a * a + b * b;
            if (norm > 9) {
                const tau = 3 / Math.sqrt(norm);
                tangent[i] = tau * a * secants[i];
                tangent[i + 1] = tau * b * secants[i];
            }
        }
    }

    const min = xAxis.min;
    const max = xAxis.max;
    let path = '';
    let started = false;
    for (let i = 0; i < n - 1; i++) {
        const x0 = xs[i];
        const x1 = xs[i + 1];
        if (x1 <= min || x0 >= max) continue;
        // The visible segment should be inside the daily domain; domain endpoints align to the same value.
        const a = Math.max(x0, min);
        const b = Math.min(x1, max);
        if (b <= a) continue;
        const ratioA = (a - x0) / (x1 - x0);
        const ratioB = (b - x0) / (x1 - x0);
        const y0 = hermite(ys[i], ys[i + 1], tangent[i], tangent[i + 1], x1 - x0, ratioA);
        const y1 = hermite(ys[i], ys[i + 1], tangent[i], tangent[i + 1], x1 - x0, ratioB);
        const slopeA = hermiteDerivative(ys[i], ys[i + 1], tangent[i], tangent[i + 1], x1 - x0, ratioA);
        const slopeB = hermiteDerivative(ys[i], ys[i + 1], tangent[i], tangent[i + 1], x1 - x0, ratioB);
        const sx0 = xToSvg(a, min, max);
        const sx1 = xToSvg(b, min, max);
        const sy0 = yToSvg(y0, yAxis.min, yAxis.max);
        const sy1 = yToSvg(y1, yAxis.min, yAxis.max);
        const scaleY = -PLOT_HEIGHT / (yAxis.max - yAxis.min);
        const dxSvg = sx1 - sx0;
        const slope0Svg = slopeA * scaleY * (max - min) / PLOT_WIDTH;
        const slope1Svg = slopeB * scaleY * (max - min) / PLOT_WIDTH;
        if (!started) {
            path = `M ${sx0} ${sy0}`;
            started = true;
        }
        path += ` C ${sx0 + dxSvg / 3} ${sy0 + slope0Svg * dxSvg / 3}, ${sx1 - dxSvg / 3} ${sy1 - slope1Svg * dxSvg / 3}, ${sx1} ${sy1}`;
    }
    return path || monotonePath(core, xAxis, yAxis);
}

function hermite(y0: number, y1: number, m0: number, m1: number, h: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
}

function hermiteDerivative(y0: number, y1: number, m0: number, m1: number, h: number, t: number): number {
    const t2 = t * t;
    return ((6 * t2 - 6 * t) * y0 + (3 * t2 - 4 * t + 1) * h * m0 + (-6 * t2 + 6 * t) * y1 + (3 * t2 - 2 * t) * h * m1) / h;
}

function binaryPath(points: CurvePoint[], xAxis: CurveAxis, yAxis: CurveAxis, binaryValues: [number, number]): string {
    if (points.length < 2) return '';
    const sorted = [...points].sort((a, b) => a.x - b.x);
    let path = `M ${xToSvg(sorted[0].x, xAxis.min, xAxis.max)} ${yToSvg(sorted[0].y, yAxis.min, yAxis.max)}`;
    for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1];
        const current = sorted[i];
        const x = xToSvg(current.x, xAxis.min, xAxis.max);
        path += ` H ${x} V ${yToSvg(current.y, yAxis.min, yAxis.max)}`;
    }
    // Explicitly close the daily cycle at the same binary state.
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (nearlyEqual(first.x, xAxis.min) && nearlyEqual(last.x, xAxis.max)) {
        const allowed = binaryValues;
        const shared = nearlyEqual(first.y, allowed[0]) ? allowed[0] : allowed[1];
        const y = yToSvg(shared, yAxis.min, yAxis.max);
        path += ` L ${xToSvg(xAxis.max, xAxis.min, xAxis.max)} ${y}`;
    }
    return path;
}

function formatTimeOfDay(value: number): string {
    const totalMinutes = Math.round(value * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatTick(axis: CurveAxis, value: number): string {
    if (axis.formatTick) return axis.formatTick(value);
    if (axis.unit === 'hours') {
        const totalMinutes = Math.round(value * 60);
        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    return `${value}${axis.unit ? ` ${axis.unit}` : ''}`;
}

export function validateCurves(curves: CurveDefinition[], xAxis: CurveAxis, yAxis: CurveAxis, mode: CurveMode, binaryValues: [number, number] = [0, 1]): string[] {
    const errors: string[] = [];
    for (const curve of curves) {
        if (curve.points.length < 2) errors.push(`${curve.label}: at least two points are required.`);
        const sorted = [...curve.points].sort((a, b) => a.x - b.x);
        for (let i = 0; i < sorted.length; i++) {
            const point = sorted[i];
            if (point.x < xAxis.min || point.x > xAxis.max) errors.push(`${curve.label}: X value is outside the axis range.`);
            if (point.y < yAxis.min || point.y > yAxis.max) errors.push(`${curve.label}: Y value is outside the axis range.`);
            if (i > 0 && nearlyEqual(point.x, sorted[i - 1].x)) errors.push(`${curve.label}: two points cannot share the same X value.`);
            if (mode === 'binary' && !binaryValues.some(value => nearlyEqual(value, point.y))) {
                errors.push(`${curve.label}: binary curves may use only ${binaryValues.join(' and ')}.`);
            }
        }
        if (sorted.length >= 2) {
            if (!nearlyEqual(sorted[0].x, xAxis.min) || !nearlyEqual(sorted[sorted.length - 1].x, xAxis.max)) {
                errors.push(`${curve.label}: periodic curves need points at both domain boundaries.`);
            } else if (!nearlyEqual(sorted[0].y, sorted[sorted.length - 1].y)) {
                errors.push(`${curve.label}: the first and last point must have the same Y value for midnight continuity.`);
            }
        }
    }
    return errors;
}

const CurveEditor: React.FC<CurveEditorProps> = ({
    xAxis,
    yAxis,
    mode,
    curves,
    onChange,
    binaryValues = [0, 1],
    readOnly = false,
    selectedCurveId,
    onSelectedCurveChange,
    title,
}) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [drag, setDrag] = useState<{ curveId: string; pointIndex: number } | null>(null);
    const [selectedPoint, setSelectedPoint] = useState<{ curveId: string; pointIndex: number } | null>(null);

    const sortedCurves = useMemo(() => curves.map(curve => ({
        ...curve,
        points: [...curve.points].sort((a, b) => a.x - b.x),
    })), [curves]);

    const selected = sortedCurves.find(c => c.id === selectedCurveId) ?? sortedCurves[0];
    const usesTimeOfDay = xAxis.unit === 'hours' && nearlyEqual(xAxis.min, 0) && nearlyEqual(xAxis.max, 24);
    const [currentTime, setCurrentTime] = useState(() => new Date());

    useEffect(() => {
        if (!usesTimeOfDay) return;
        const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, [usesTimeOfDay]);

    const currentTimeValue = currentTime.getHours() + currentTime.getMinutes() / 60 + currentTime.getSeconds() / 3600;

    const addPointPreview = useMemo(() => {
        if (readOnly || !selected || !selectedPoint || selectedPoint.curveId !== selected.id) return null;

        const points = [...selected.points].sort((a, b) => a.x - b.x);
        const pointIndex = selectedPoint.pointIndex;

        // The first and last points represent the same midnight boundary; only interior points can anchor insertion.
        if (pointIndex <= 0 || pointIndex >= points.length - 1) return null;

        const left = points[pointIndex];
        const right = points[pointIndex + 1];

        if (!left || !right || right.x - left.x <= (xAxis.max - xAxis.min) / 1000) return null;

        const x = (left.x + right.x) / 2;
        const ratio = (x - left.x) / (right.x - left.x);
        const y = mode === 'binary' ? left.y : left.y + (right.y - left.y) * ratio;

        return { x, y, gapIndex: pointIndex };

    }, [readOnly, selected, selectedPoint, xAxis.min, xAxis.max, mode]);

    const movePoint = (curveId: string, pointIndex: number, clientX: number, clientY: number) => {
        if (!svgRef.current || readOnly) return;
        const rect = svgRef.current.getBoundingClientRect();
        const coordinate = svgToDomain(clientX, clientY, rect, xAxis, yAxis);
        const curve = curves.find(c => c.id === curveId);

        if (!curve) return;

        const points = curve.points.map(p => ({ ...p })).sort((a, b) => a.x - b.x);
        const index = pointIndex;

        if (index === 0 || index === points.length - 1) {
            // The endpoints are one logical point on the daily cycle and cannot move horizontally.
            const sharedValue = mode === 'binary'
                ? (Math.abs(coordinate.y - binaryValues[0]) <= Math.abs(coordinate.y - binaryValues[1]) ? binaryValues[0] : binaryValues[1])
                : coordinate.y;
            points[0] = { x: xAxis.min, y: sharedValue };
            points[points.length - 1] = { x: xAxis.max, y: sharedValue };
        } else {
            const before = points[index - 1];
            const after = points[index + 1];
            const minX = Math.max(xAxis.min, before.x + (xAxis.max - xAxis.min) / 1000);
            const maxX = Math.min(xAxis.max, after.x - (xAxis.max - xAxis.min) / 1000);
            const newY = mode === 'binary'
                ? (Math.abs(coordinate.y - binaryValues[0]) <= Math.abs(coordinate.y - binaryValues[1]) ? binaryValues[0] : binaryValues[1])
                : coordinate.y;
            const newX = clamp(coordinate.x, minX, maxX);
            points[index] = { x: newX, y: newY };
        }
        onChange(curves.map(c => c.id === curveId ? { ...c, points } : c));
    };

    const addPoint = (curveId: string) => {
        if (readOnly || !selectedPoint || selectedPoint.curveId !== curveId) return;

        const curve = curves.find(c => c.id === curveId);

        if (!curve) return;

        const points = [...curve.points].sort((a, b) => a.x - b.x);
        const pointIndex = selectedPoint.pointIndex;

        // Midnight is represented by the first and last points and cannot anchor insertion.
        if (pointIndex <= 0 || pointIndex >= points.length - 1) return;

        const left = points[pointIndex];
        const right = points[pointIndex + 1];

        if (!left || !right || right.x - left.x <= (xAxis.max - xAxis.min) / 1000) return;

        const x = (left.x + right.x) / 2;
        const ratio = (x - left.x) / (right.x - left.x);
        const y = mode === 'binary' ? left.y : left.y + (right.y - left.y) * ratio;
        const nextPoints = [...points.slice(0, pointIndex + 1), { x, y }, ...points.slice(pointIndex + 1)];
        const newIndex = pointIndex + 1;

        onChange(curves.map(c => c.id === curveId ? { ...c, points: nextPoints } : c));
        setSelectedPoint({ curveId, pointIndex: newIndex });
    };

    const deleteSelectedPoint = () => {
        if (readOnly || !selectedPoint) return;

        const curve = curves.find(c => c.id === selectedPoint.curveId);

        if (!curve) return;

        const points = [...curve.points].sort((a, b) => a.x - b.x);
        const index = selectedPoint.pointIndex;

        // The first and last points define the shared midnight boundary and cannot be deleted.
        if (index <= 0 || index >= points.length - 1 || points.length <= 3) return;

        const nextPoints = points.filter((_, i) => i !== index);

        onChange(curves.map(c => c.id === selectedPoint.curveId ? { ...c, points: nextPoints } : c));
        setSelectedPoint(null);
    };

    const selectedPointIsDeletable = Boolean(
        selectedPoint &&
        selected?.id === selectedPoint.curveId &&
        selectedPoint.pointIndex > 0 &&
        selectedPoint.pointIndex < (selected?.points.length ?? 0) - 1 &&
        (selected?.points.length ?? 0) > 3
    );

    const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
        if (!drag) return;
        movePoint(drag.curveId, drag.pointIndex, event.clientX, event.clientY);
    };

    const handlePointerUp = () => setDrag(null);

    const xTicks = xAxis.ticks ?? Array.from({ length: 9 }, (_, i) => xAxis.min + ((xAxis.max - xAxis.min) * i) / 8);
    const yTicks = yAxis.ticks ?? Array.from({ length: 6 }, (_, i) => yAxis.min + ((yAxis.max - yAxis.min) * i) / 5);

    return (
        <section className="curve-editor" aria-label={title ?? 'Curve editor'}>
            {title && <h3 className="curve-editor-title">{title}</h3>}
            {curves.length > 1 && onSelectedCurveChange && (
                <div className="curve-editor-curve-picker" role="group" aria-label="Select curve">
                    {curves.map(curve => (
                        <button
                            type="button"
                            key={curve.id}
                            className={`curve-editor-curve-chip ${selected?.id === curve.id ? 'selected' : ''}`}
                            onClick={() => onSelectedCurveChange(curve.id)}
                        >
                            <span style={{ backgroundColor: curve.color }} />
                            {curve.label}
                        </button>
                    ))}
                </div>
            )}
            {!readOnly && selected && (
                <div className="curve-editor-point-tools">
                    <button type="button" className="curve-editor-tool-button" onClick={() => addPoint(selected.id)} disabled={!addPointPreview}>
                        <span aria-hidden="true">＋</span> Add point
                    </button>
                    <button
                        type="button"
                        className="curve-editor-tool-button"
                        onClick={deleteSelectedPoint}
                        disabled={!selectedPointIsDeletable}
                    >
                        <span aria-hidden="true">−</span> Delete selected point
                    </button>
                    <span className="curve-editor-tool-hint">
                        {selectedPoint?.curveId === selected.id
                            ? (() => {
                                const point = selected.points[selectedPoint.pointIndex];
                                if (!point) return 'Select a point on the curve';
                                const xLabel = usesTimeOfDay ? formatTimeOfDay(point.x) : `${point.x.toFixed(2)}${xAxis.unit ? ` ${xAxis.unit}` : ''}`;
                                const yLabel = mode === 'binary' ? (point.y === binaryValues[1] ? 'ON' : 'OFF') : `${point.y.toFixed(1)}${yAxis.unit ? ` ${yAxis.unit}` : ''}`;
                                return `Selected: ${xLabel} · ${yLabel}${selectedPointIsDeletable ? '' : ' · boundary point protected'}`;
                            })()
                            : 'Tap an interior point to select it for adding or deleting'}
                    </span>
                </div>
            )}
            {!readOnly && !addPointPreview && (
                <div className="curve-editor-add-preview" aria-live="polite">
                    Select an interior point (not the midnight boundary) to preview where the next point will be added.
                </div>
            )}
            {!readOnly && addPointPreview && (
                <div className="curve-editor-add-preview" aria-live="polite">
                    <span className="curve-editor-preview-swatch" />
                    Add point preview (halfway to next point): <strong>{usesTimeOfDay ? formatTimeOfDay(addPointPreview.x) : addPointPreview.x.toFixed(2)}</strong>
                    {mode === 'binary'
                        ? <span> · Starts {addPointPreview.y === binaryValues[1] ? 'ON' : 'OFF'}; drag vertically to change state</span>
                        : <span> · Starts at {addPointPreview.y.toFixed(1)}{yAxis.unit ? ` ${yAxis.unit}` : ''}</span>}
                </div>
            )}
            <div className="curve-editor-graph-wrap">
                <svg
                    ref={svgRef}
                    className={`curve-editor-graph ${readOnly ? 'read-only' : 'editable'}`}
                    viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                    role="img"
                    aria-label={`${mode} curve graph. X axis: ${xAxis.label}. Y axis: ${yAxis.label}.`}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onLostPointerCapture={handlePointerUp}
                >
                    {yTicks.map((value, i) => (
                        <g key={`y-${i}`}>
                            <line x1={LEFT} x2={SVG_WIDTH - RIGHT} y1={yToSvg(value, yAxis.min, yAxis.max)} y2={yToSvg(value, yAxis.min, yAxis.max)} className="curve-editor-gridline" />
                            <text x={LEFT - 9} y={yToSvg(value, yAxis.min, yAxis.max) + 4} textAnchor="end" className="curve-editor-tick">{formatTick(yAxis, value)}</text>
                        </g>
                    ))}
                    {xTicks.map((value, i) => (
                        <g key={`x-${i}`}>
                            <line x1={xToSvg(value, xAxis.min, xAxis.max)} x2={xToSvg(value, xAxis.min, xAxis.max)} y1={TOP} y2={SVG_HEIGHT - BOTTOM} className="curve-editor-gridline vertical" />
                            <text x={xToSvg(value, xAxis.min, xAxis.max)} y={SVG_HEIGHT - 35} textAnchor="middle" className="curve-editor-tick">{formatTick(xAxis, value)}</text>
                        </g>
                    ))}
                    {usesTimeOfDay && (
                        <g className="curve-editor-current-time" pointerEvents="none">
                            <line
                                x1={xToSvg(currentTimeValue, xAxis.min, xAxis.max)}
                                x2={xToSvg(currentTimeValue, xAxis.min, xAxis.max)}
                                y1={TOP}
                                y2={SVG_HEIGHT - BOTTOM}
                                className="curve-editor-current-time-line"
                            />
                            <rect
                                x={clamp(xToSvg(currentTimeValue, xAxis.min, xAxis.max) - 27, LEFT, SVG_WIDTH - RIGHT - 54)}
                                y={TOP - 16}
                                width="54"
                                height="16"
                                rx="4"
                                className="curve-editor-current-time-label-bg"
                            />
                            <text
                                x={clamp(xToSvg(currentTimeValue, xAxis.min, xAxis.max), LEFT + 27, SVG_WIDTH - RIGHT - 27)}
                                y={TOP - 4}
                                textAnchor="middle"
                                className="curve-editor-current-time-label"
                            >NOW {formatTimeOfDay(currentTimeValue)}</text>
                        </g>
                    )}
                    {addPointPreview && selected && !readOnly && (
                        <g className="curve-editor-add-point-ghost" pointerEvents="none">
                            <line
                                x1={xToSvg(addPointPreview.x, xAxis.min, xAxis.max)}
                                x2={xToSvg(addPointPreview.x, xAxis.min, xAxis.max)}
                                y1={TOP}
                                y2={SVG_HEIGHT - BOTTOM}
                                className="curve-editor-add-preview-line"
                            />
                            <circle
                                cx={xToSvg(addPointPreview.x, xAxis.min, xAxis.max)}
                                cy={yToSvg(addPointPreview.y, yAxis.min, yAxis.max)}
                                r="10"
                                className="curve-editor-add-preview-point"
                            />
                        </g>
                    )}
                    <text x={LEFT + PLOT_WIDTH / 2} y={SVG_HEIGHT - 8} textAnchor="middle" className="curve-editor-axis-title">{xAxis.label}</text>
                    <text x={15} y={TOP + PLOT_HEIGHT / 2} textAnchor="middle" className="curve-editor-axis-title" transform={`rotate(-90 15 ${TOP + PLOT_HEIGHT / 2})`}>{yAxis.label}</text>
                    {sortedCurves.map(curve => {
                        const path = mode === 'binary'
                            ? binaryPath(curve.points, xAxis, yAxis, binaryValues)
                            : periodicMonotonePath(curve.points, xAxis, yAxis);
                        return (
                            <g key={curve.id}>
                                <path
                                    d={path}
                                    fill="none"
                                    stroke={curve.color}
                                    strokeWidth={selected?.id === curve.id ? 3.5 : 2.5}
                                    opacity={selected?.id === curve.id ? 1 : 0.7}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="curve-editor-path"
                                />
                                {!readOnly && selected?.id === curve.id && curve.points.map((point, pointIndex) => (
                                    <circle
                                        key={`${curve.id}-${pointIndex}`}
                                        cx={xToSvg(point.x, xAxis.min, xAxis.max)}
                                        cy={yToSvg(point.y, yAxis.min, yAxis.max)}
                                        r={drag?.curveId === curve.id && drag.pointIndex === pointIndex ? 8 : selectedPoint?.curveId === curve.id && selectedPoint.pointIndex === pointIndex ? 7 : 6}
                                        fill={curve.color}
                                        stroke="var(--curve-editor-point-stroke)"
                                        strokeWidth={selectedPoint?.curveId === curve.id && selectedPoint.pointIndex === pointIndex ? 4 : 2}
                                        className={`curve-editor-point ${selectedPoint?.curveId === curve.id && selectedPoint.pointIndex === pointIndex ? 'selected' : ''}`}
                                        onPointerDown={event => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setSelectedPoint({ curveId: curve.id, pointIndex });
                                            setDrag({ curveId: curve.id, pointIndex });
                                            (event.currentTarget as SVGCircleElement).setPointerCapture?.(event.pointerId);
                                        }}
                                    />
                                ))}
                            </g>
                        );
                    })}
                </svg>
            </div>
            <div className="curve-editor-footer">
                <span>{readOnly ? 'Read-only preview' : 'Drag a point to edit · Add or delete points with the controls above'}</span>
                <span>{mode === 'analog' ? 'Shape-preserving curve' : `Step curve · ${binaryValues[0]} / ${binaryValues[1]}`}</span>
            </div>
        </section>
    );
};

export default CurveEditor;
