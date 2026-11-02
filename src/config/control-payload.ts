import type { ChannelInstance, ControlConfiguration, ControlInstance, CurveControlData } from './control-definitions';
export function makeChannelControlPayload(instance: ControlInstance, channels: ChannelInstance[]): ControlConfiguration {
    return { schemaVersion: 2, instance, channels };
}
export function makeCurveControlPayload(instance: ControlInstance, channelId: string, curves: CurveControlData['curves']): ControlConfiguration<CurveControlData> {
    return { schemaVersion: 2, instance, channels: [{ channelId, policy: 'analog_curve', configuration: { curve: curves.find(curve => curve.id === channelId) ?? curves[0] } }] };
}
export function makeManualControlPayload(instance: ControlInstance, channelId: string): ControlConfiguration {
    return { schemaVersion: 2, instance, channels: [{ channelId, policy: 'manual_binary', configuration: {} }] };
}
