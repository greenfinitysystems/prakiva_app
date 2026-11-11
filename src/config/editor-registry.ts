import type { ComponentType } from 'react';
import type { ControlPolicy } from './controller-capabilities';
import type { InlineChannelEditorProps } from '../components/control-editors/types';
import ManualControl from '../components/control-editors/ManualControl';
import ThresholdRules from '../components/control-editors/ThresholdRules';

import TriggerPolicyEditor from '../components/control-editors/TriggerPolicyEditor';

/** Maps a channel policy to its reusable inline editor component. */
export const editorRegistry: Partial<Record<ControlPolicy, ComponentType<InlineChannelEditorProps>>> = {
    manual_binary: ManualControl,
    threshold_rules: ThresholdRules,
    periodic_pulse: TriggerPolicyEditor, // Legacy firmware capability: no periodic-pulse editing surface.
    trigger: TriggerPolicyEditor,
};
