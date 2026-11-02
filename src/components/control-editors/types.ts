import type { ControllerCapability, ControlPolicy } from '../../config/controller-capabilities';

export interface InlineChannelEditorProps {
    capabilityId: string;
    channelId: string;
    channelLabel: string;
    policy: ControlPolicy;
    unit?: string;
    min?: number;
    max?: number;
    capabilities: ControllerCapability[];
    value?: Record<string, unknown>;
    onChange: (value: Record<string, unknown>) => void;
}
