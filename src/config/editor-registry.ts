import type { ComponentType } from 'react';
import type { ControlPolicy } from './controller-capabilities';
import type { InlineChannelEditorProps } from '../components/control-editors/types';
import ManualControl from '../components/control-editors/ManualControl';
import CurvePolicyEditor from '../components/control-editors/CurvePolicyEditor';
import ThresholdRules from '../components/control-editors/ThresholdRules';
import PeriodicPulse from '../components/control-editors/PeriodicPulse';

/** Maps a channel policy to its reusable inline editor component. */
export const editorRegistry: Record<ControlPolicy, ComponentType<InlineChannelEditorProps>> = {
    manual_binary: ManualControl,
    binary_curve: CurvePolicyEditor,
    analog_curve: CurvePolicyEditor,
    threshold_rules: ThresholdRules,
    periodic_pulse: PeriodicPulse,
};
