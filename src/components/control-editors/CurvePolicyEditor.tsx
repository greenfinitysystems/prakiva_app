import { useEffect, useState } from 'react';
import CurveEditor, { type CurveAxis, type CurveDefinition } from '../CurveEditor';
import type { InlineChannelEditorProps } from './types';

const X_AXIS: CurveAxis = {
    label: 'Time of day',
    min: 0,
    max: 24,
    unit: 'hours',
    ticks: [0, 3, 6, 9, 12, 15, 18, 21, 24],
    formatTick: value => `${String(value === 24 ? 0 : value).padStart(2, '0')}:00`,
};

const CurvePolicyEditor: React.FC<InlineChannelEditorProps> = ({
    channelId, channelLabel, policy, unit, min = 0, max = 100, value = {}, onChange,
}) => {
    const [curve, setCurve] = useState<CurveDefinition>(() =>
        (value.curve as CurveDefinition) ?? {
            id: channelId,
            label: channelLabel,
            color: '#269b85',
            points: [{ x: 0, y: 0 }, { x: 7, y: 0 }, { x: 10, y: 1 }, { x: 17, y: 0 }, { x: 24, y: 0 }],
        }
    );

    useEffect(() => {
        if (value.curve && typeof value.curve === 'object') {
            const restored = value.curve as CurveDefinition;
            setCurve({ ...restored, points: restored.points.map(point => ({ ...point })) });
        }
    }, [value.curve]);

    const binary = policy === 'binary_curve';
    const binaryAxis: CurveAxis = {
        label: 'Output state',
        min: 0,
        max: 1,
        ticks: [0, 1],
        formatTick: value => value >= 0.5 ? 'ON' : 'OFF',
    };
    const analogAxis: CurveAxis = {
        label: unit ? `Output (${unit})` : 'Output',
        min,
        max,
        unit,
        ticks: [min, min + (max - min) * 0.25, min + (max - min) * 0.5, min + (max - min) * 0.75, max],
    };

    const updateCurve = (changed: CurveDefinition[]) => {
        const nextCurve = changed[0] ?? curve;
        setCurve(nextCurve);
        onChange({ ...value, curve: nextCurve });
    };

    return (
        <CurveEditor
            xAxis={X_AXIS}
            yAxis={binary ? binaryAxis : analogAxis}
            mode={binary ? 'binary' : 'analog'}
            curves={[curve]}
            onChange={updateCurve}
            title={`${channelLabel} · ${binary ? 'ON/OFF schedule' : '24-hour curve'}`}
        />
    );
};

export default CurvePolicyEditor;
