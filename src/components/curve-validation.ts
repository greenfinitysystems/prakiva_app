import type { CurveAxis, CurveDefinition, CurveMode } from './CurveEditor';

const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 1e-7;

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
