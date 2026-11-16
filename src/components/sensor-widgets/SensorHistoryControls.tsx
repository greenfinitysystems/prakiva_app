import React from 'react';

/** Shared sensor control geometry. Skin CSS determines material and appearance. */
export interface SensorHistoryControlsProps {
    range: HistoryRange;
    onRangeChange: (range: HistoryRange) => void;
    onCalibrate?: () => void;
    onParameters?: () => void;
}

import { HISTORY_RANGES, type HistoryRange } from './SensorHistoryRanges';
const ROTARY_ANGLES: Record<HistoryRange, number> = {
    '1h': -65,
    '6h': -22,
    '24h': 22,
    'all': 65,
};
export const SensorHistoryControls: React.FC<SensorHistoryControlsProps> = ({ range, onRangeChange, onCalibrate, onParameters }) => (
            <div className="instrument-history-footer">
                <div className="instrument-pushbutton-bank">
                    {onCalibrate && <div className="instrument-pushbutton-unit"><button type="button" className="instrument-pushbutton" aria-label="Calibrate sensor" onClick={onCalibrate} /><span>CAL</span></div>}
                    {onParameters && <div className="instrument-pushbutton-unit"><button type="button" className="instrument-pushbutton" aria-label="Configure virtual sensor parameters" onClick={onParameters} /><span>PARAM</span></div>}
                </div>
                <div className="instrument-history-selector" role="group" aria-label="History time range">
                    <div className="instrument-history-selector-label">HISTORY RANGE</div>
                    <div className="instrument-rotary-station">
                        <svg className="instrument-rotary-scale" viewBox="0 0 230 160" aria-hidden="true" focusable="false">
                            <path d="M 57 113 A 58 58 0 0 1 173 113" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            <circle cx="62.43" cy="88.49" r="3.2" fill="currentColor" />
                            <circle cx="93.27" cy="59.22" r="3.2" fill="currentColor" />
                            <circle cx="136.73" cy="59.22" r="3.2" fill="currentColor" />
                            <circle cx="167.57" cy="88.49" r="3.2" fill="currentColor" />
                        </svg>
                        {HISTORY_RANGES.map(option => (
                            <button
                                type="button"
                                key={option.value}
                                className={`instrument-rotary-choice instrument-rotary-choice-${option.value}${range === option.value ? ' is-selected' : ''}`}
                                aria-label={option.label}
                                aria-pressed={range === option.value}
                                onClick={() => onRangeChange(option.value)}
                            >{option.value === 'all' ? 'ALL' : option.value.toUpperCase()}</button>
                        ))}
                        <button
                            type="button"
                            className="instrument-rotary-knob"
                            aria-label={`History range: ${HISTORY_RANGES.find(item => item.value === range)?.label}. Tap to select next range`}
                            onClick={() => onRangeChange(HISTORY_RANGES[(HISTORY_RANGES.findIndex(item => item.value === range) + 1) % HISTORY_RANGES.length].value)}
                        >
                            <span className="instrument-rotary-knob-face" style={{ transform: `rotate(${ROTARY_ANGLES[range]}deg)` }}>
                                <span className="instrument-rotary-pointer" />
                            </span>
                        </button>
                    </div>
                </div>
            </div>
);
