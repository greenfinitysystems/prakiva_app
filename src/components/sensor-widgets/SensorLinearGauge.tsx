import React from 'react';
import { IonCard, IonCardContent } from '@ionic/react';
import type { SensorDisplayProps } from './SensorDisplayProps';
import { useDampedPointer } from './useDampedPointer';
import { PanelFasteners } from './PanelFasteners';
import '../../theme/skins/default/styles/components/sensor-widgets/sensor-widgets.css';

/** Default-skin linear meter. Its pointer translates horizontally; it never rotates. */
export const SensorLinearGauge: React.FC<SensorDisplayProps> = ({
    title, value, rawValue, unit = '', min, max, precision = 1, status,
}) => {
    const validValue = typeof value === 'number' && Number.isFinite(value);
    const declaredRange = typeof min === 'number' && typeof max === 'number' &&
        Number.isFinite(min) && Number.isFinite(max) && max > min;
    const center = validValue ? value : 0;
    const halfSpan = Math.max(Math.abs(center) * 0.2, 2);
    const lower = declaredRange ? min : center - halfSpan;
    const upper = declaredRange ? max : center + halfSpan;
    const span = upper - lower;
    const position = (reading: number) => 38 + Math.max(0, Math.min(1, (reading - lower) / span)) * 284;
    const tickValue = (i: number) => lower + (i / 10) * span;
    const fmt = (n: number) => Number(n.toFixed(Math.max(0, Math.min(2, precision)))).toString();
    const reading = validValue && status === 'valid' ? value : undefined;
    const rawReading = typeof rawValue === 'number' && Number.isFinite(rawValue) && status === 'valid'
        ? rawValue : undefined;
    const normalized = reading === undefined ? 0 : Math.max(0, Math.min(1, (reading - lower) / span));
    const animatedPosition = useDampedPointer(normalized, reading !== undefined);
    return <IonCard className="sensor-widget-card sensor-linear-card sensor-fastened-panel">
        <PanelFasteners />
        <IonCardContent>
            <svg viewBox="0 0 360 158" className="sensor-linear-svg" role="img"
                aria-label={`${title}: ${reading === undefined ? 'unavailable' : fmt(reading)} ${unit}`}>
                <rect x="18" y="17" width="324" height="124" rx="12" className="sensor-linear-face"/>
                <text x="180" y="40" textAnchor="middle" className="sensor-linear-brand">PRAKIVA</text>
                {Array.from({length: 51}, (_,i) => {
                    const x=38+i*284/50;
                    const major=i%5===0;
                    return <line key={i} x1={x} x2={x} y1="65" y2={major?88:78}
                        className={major?'sensor-linear-tick-major':'sensor-linear-tick'}/>;
                })}
                {Array.from({length: 11},(_,i) => <text key={i} x={38+i*284/10} y="58"
                    textAnchor="middle" className="sensor-linear-label">{fmt(tickValue(i))}</text>)}
                {rawReading !== undefined && <line x1={position(rawReading)} x2={position(rawReading)}
                    y1="66" y2="111" className="sensor-linear-raw"/>}
                {reading !== undefined && <line x1={38 + animatedPosition * 284} x2={38 + animatedPosition * 284}
                    y1="63" y2="111" className="sensor-linear-pointer"/>}
                <text x="180" y="130" textAnchor="middle" className="sensor-linear-reading">
                    {reading === undefined ? '—' : `${reading.toFixed(Math.max(0, Math.min(6, precision)))} ${unit}`}
                </text>
                <circle cx="323" cy="127" r="4.5"
                    className={`sensor-linear-status-led sensor-linear-status-${status}`}/>
            </svg>
        </IonCardContent>
    </IonCard>;
};
