/** Local bookkeeping for configuration changes sent to a controller. */
export const CONFIGURATION_SYNC_STATE_KEY = 'prakiva.configuration.sync-state.v2';

export type ConfigurationSyncPhase = 'idle' | 'checking' | 'applying' | 'failed' | 'conflict';
export type ConfigurationSyncStatus = 'up-to-date' | 'apply-pending' | 'not-configured' | 'applying' | 'checking' | 'failed' | 'conflict';

export interface ControllerConfigurationMetadata {
    configuration_exists: boolean;
    configuration_updated_at: string | null;
    clock_valid: boolean;
}

export interface ControllerSyncRecord {
    controllerId: string;
    applyPending: boolean;
    phase: ConfigurationSyncPhase;
    lastSyncedControllerAt: string | null;
    controllerUpdatedAt: string | null;
    lastAppliedAt: string | null;
    lastError?: string;
}

function readRecords(): Record<string, ControllerSyncRecord> {
    try {
        const raw = localStorage.getItem(CONFIGURATION_SYNC_STATE_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed as Record<string, ControllerSyncRecord> : {};
    } catch { return {}; }
}

function writeRecord(record: ControllerSyncRecord): void {
    const records = readRecords();
    records[record.controllerId] = record;
    localStorage.setItem(CONFIGURATION_SYNC_STATE_KEY, JSON.stringify(records));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('prakiva:configuration-sync-state-changed', { detail: { controllerId: record.controllerId } }));
    }
}

export function getControllerSyncRecord(controllerId: string): ControllerSyncRecord {
    const stored = readRecords()[controllerId];
    if (!stored) return {
        controllerId, applyPending: false, phase: 'idle', lastSyncedControllerAt: null,
        controllerUpdatedAt: null, lastAppliedAt: null,
    };
    if (stored.phase === 'applying' || stored.phase === 'checking') {
        const interrupted: ControllerSyncRecord = {
            ...stored, phase: 'failed',
            lastError: 'The previous configuration update was interrupted before confirmation.',
        };
        writeRecord(interrupted);
        return interrupted;
    }
    return stored;
}

export function markLocalConfigurationPending(controllerId: string): ControllerSyncRecord {
    const previous = getControllerSyncRecord(controllerId);
    const next = { ...previous, applyPending: true, phase: 'idle' as const, lastError: undefined };
    writeRecord(next);
    return next;
}

export function getConfigurationSyncStatus(
    record: ControllerSyncRecord,
    metadata?: ControllerConfigurationMetadata | null,
): ConfigurationSyncStatus {
    if (record.phase === 'applying') return 'applying';
    if (record.phase === 'checking') return 'checking';
    if (record.phase === 'failed') return 'failed';
    if (record.phase === 'conflict') return 'conflict';
    if (record.applyPending) return 'apply-pending';
    if (metadata && !metadata.configuration_exists) return 'not-configured';
    if (record.lastSyncedControllerAt && metadata?.configuration_updated_at === record.lastSyncedControllerAt) return 'up-to-date';
    return 'not-configured';
}

export function markConfigurationApplying(controllerId: string): ControllerSyncRecord {
    const previous = getControllerSyncRecord(controllerId);
    const next = { ...previous, phase: 'applying' as const, lastError: undefined };
    writeRecord(next);
    return next;
}

export function markConfigurationSynchronized(controllerId: string, controllerTimestamp: string | null): ControllerSyncRecord {
    const previous = getControllerSyncRecord(controllerId);
    const next: ControllerSyncRecord = {
        ...previous, applyPending: false, phase: 'idle',
        lastSyncedControllerAt: controllerTimestamp, controllerUpdatedAt: controllerTimestamp,
        lastError: undefined,
    };
    writeRecord(next);
    return next;
}

export function markConfigurationApplied(controllerId: string, controllerTimestamp: string): ControllerSyncRecord {
    const next: ControllerSyncRecord = {
        ...getControllerSyncRecord(controllerId), applyPending: false, phase: 'idle',
        lastSyncedControllerAt: controllerTimestamp, controllerUpdatedAt: controllerTimestamp,
        lastAppliedAt: controllerTimestamp, lastError: undefined,
    };
    writeRecord(next);
    return next;
}

export function markConfigurationApplyFailed(controllerId: string, error: string): ControllerSyncRecord {
    const next = { ...getControllerSyncRecord(controllerId), phase: 'failed' as const, lastError: error };
    writeRecord(next);
    return next;
}
