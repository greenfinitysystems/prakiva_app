import { useRef } from 'react';
import type { PointerEvent, KeyboardEvent } from 'react';
import '../../theme/skins/default/styles/components/FixedValueKnob.css';

interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const format = (value: number) => Number(value.toFixed(2)).toString();

/** Uses the existing History Scope rotary face/pointer classes and skin rules. */
export default function FixedValueKnob({ label, value, min, max, onChange }: Props) {
    const drag = useRef<{ y: number; value: number } | null>(null);
    const span = Math.max(0.000001, max - min);
    const normalized = clamp((value - min) / span, 0, 1);
    const angle = -135 + 270 * normalized;
    const step = span <= 10 ? 0.1 : 1;
    const onKey = (event: KeyboardEvent<HTMLButtonElement>) => {
        const delta = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? step :
            event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -step : 0;
        if (!delta) return;
        event.preventDefault();
        onChange(clamp(Number((value + delta).toFixed(2)), min, max));
    };
    const onDown = (event: PointerEvent<HTMLButtonElement>) => {
        drag.current = { y: event.clientY, value };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent<HTMLButtonElement>) => {
        if (!drag.current) return;
        const next = drag.current.value + (drag.current.y - event.clientY) * span / 180;
        onChange(clamp(Number(next.toFixed(2)), min, max));
    };
    return <div className="prakiva-fixed-knob-unit">
        <div className="prakiva-fixed-knob-station instrument-rotary-station">
            <svg className="instrument-rotary-scale" viewBox="0 0 230 160" aria-hidden="true">
                <path d="M 57 113 A 58 58 0 0 1 173 113" fill="none" stroke="currentColor" strokeWidth="1.8" />
                {Array.from({ length: 11 }, (_, i) => {
                    const a = (-135 + i * 27) * Math.PI / 180;
                    return <circle key={i} cx={115 + 58 * Math.sin(a)} cy={113 - 58 * Math.cos(a)}
                        r={i % 5 === 0 ? 3.2 : 1.8} fill="currentColor" />;
                })}
            </svg>
            <button type="button" className="instrument-rotary-knob"
                aria-label={`${label} fixed output`} aria-valuemin={min} aria-valuemax={max}
                aria-valuenow={value} role="slider" onKeyDown={onKey}
                onPointerDown={onDown} onPointerMove={onMove}
                onPointerUp={() => { drag.current = null; }}
                onPointerCancel={() => { drag.current = null; }}>
                <span className="instrument-rotary-knob-face" style={{ transform: `rotate(${angle}deg)` }}>
                    <span className="instrument-rotary-pointer" />
                </span>
            </button>
            <span className="prakiva-fixed-knob-value">{format(value)}</span>
        </div>
        <div className="prakiva-fixed-knob-label">{label}</div>
    </div>;
}
