import { CONTROL_POLICY_STORAGE_KEY, DEFAULT_CONTROL_POLICIES } from '../config/control-policies';
import { channelPolicyKey, type ControlPolicy, type ControllerCapability, type SensorWidgetType } from '../config/controller-capabilities';

/**
 * Canonical, app-local configuration document.
 *
 * The store keeps a single in-memory working document. Mutations update that
 * draft only; Save commits the complete document to Web Storage atomically.
 */
export const CONTROL_CONFIGURATION_STORAGE_KEY = 'prakiva.configuration.local.v1';
export const CONTROL_CONFIGURATION_SCHEMA_VERSION = 1 as const;

export interface StoredControlConfiguration {
    capabilityId: string;
    channelPolicies: Record<string, ControlPolicy>;
    /** Per-sensor-channel dashboard presentation; absent in older saved documents. */
    sensorWidgets: Record<string, SensorWidgetType>;
    curves: unknown[];
    inlineConfigurations: Record<string, Record<string, unknown>>;
    workspace: Record<string, unknown> | null;
    profilesByControlId: Record<string, unknown[]>;
    savedAt?: string;
}

/**
 * Snapshot of the configuration owned by one control editor.
 * Unrelated pending changes elsewhere in the shared document are deliberately excluded.
 */
export interface ControlEditorDraftSnapshot {
    control: StoredControlConfiguration;
    channelColors: Record<string, string>;
}

export interface ControlConfigurationDocument {
    format: 'prakiva-control-configuration';
    schemaVersion: typeof CONTROL_CONFIGURATION_SCHEMA_VERSION;
    updatedAt: string;
    controls: Record<string, StoredControlConfiguration>;
    presentation: {
        capabilityLabels: Record<string, string>;
        channelColors: Record<string, string>;
    };
    migration: {
        legacyLocalStorageImportedAt: string;
        sourceKeys: string[];
        warnings: string[];
    };
}

type JsonRecord = Record<string, unknown>;

let workingDocument: ControlConfigurationDocument | null = null;
let controllerCapabilities: ControllerCapability[] | null = null;

/** Set the authenticated controller's catalogue before loading or migrating app configuration. */
export function setControllerCapabilities(capabilities: ControllerCapability[]): void {
    controllerCapabilities = capabilities.map(capability => ({ ...capability, channels: capability.channels.map(channel => ({ ...channel, supportedPolicies: [...channel.supportedPolicies] })) }));
}
let savedContent = '';
const draftListeners = new Set<() => void>();
const cloneDocument = (document: ControlConfigurationDocument): ControlConfigurationDocument => {
    const cloned = JSON.parse(JSON.stringify(document)) as ControlConfigurationDocument;
    // Drop the legacy local revision field when reading documents created by the previous build.
    delete (cloned as ControlConfigurationDocument & { revision?: number }).revision;
    for (const control of Object.values(cloned.controls)) {
        control.profilesByControlId ??= {};
        control.sensorWidgets ??= {};
    }
    return cloned;
};
const contentOf = (document: ControlConfigurationDocument): string => JSON.stringify({
    controls: document.controls,
    presentation: document.presentation,
});
const notifyDraftListeners = () => draftListeners.forEach(listener => listener());


const isRecord = (value: unknown): value is JsonRecord =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseRecord = (raw: string | null): JsonRecord => {
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
};

const parseArray = (raw: string | null): unknown[] => {
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
};

const emptyControl = (capabilityId: string): StoredControlConfiguration => ({
    capabilityId,
    channelPolicies: {},
    sensorWidgets: {},
    curves: [],
    inlineConfigurations: {},
    workspace: null,
    profilesByControlId: {},
});

const createEmptyDocument = (): ControlConfigurationDocument => ({
    format: 'prakiva-control-configuration',
    schemaVersion: CONTROL_CONFIGURATION_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    controls: {},
    presentation: { capabilityLabels: {}, channelColors: {} },
    migration: {
        legacyLocalStorageImportedAt: new Date().toISOString(),
        sourceKeys: [],
        warnings: [],
    },
});

const isValidDocument = (value: unknown): value is ControlConfigurationDocument => {
    if (!isRecord(value)) return false;
    if (value.format !== 'prakiva-control-configuration' || value.schemaVersion !== CONTROL_CONFIGURATION_SCHEMA_VERSION) return false;
    // `revision` is accepted only as a legacy field and is ignored; timestamps from the
    // controller, not a phone-local counter, identify the applied configuration.
    if (typeof value.updatedAt !== 'string') return false;
    if (!isRecord(value.controls) || !isRecord(value.presentation) || !isRecord(value.migration)) return false;
    if (!isRecord(value.presentation.capabilityLabels) || !isRecord(value.presentation.channelColors)) return false;
    for (const [capabilityId, control] of Object.entries(value.controls)) {
        if (!isRecord(control) || control.capabilityId !== capabilityId) return false;
        if (!isRecord(control.channelPolicies) ||
            !(control.sensorWidgets === undefined || (isRecord(control.sensorWidgets) && Object.values(control.sensorWidgets).every(value => ['none', 'text', 'gauge', 'linear'].includes(String(value))))) ||
            !Array.isArray(control.curves) || !isRecord(control.inlineConfigurations) || !(control.profilesByControlId === undefined || isRecord(control.profilesByControlId)) ||
            !(control.workspace === null || isRecord(control.workspace))) return false;
    }
    if (typeof value.migration.legacyLocalStorageImportedAt !== 'string' ||
        !Array.isArray(value.migration.sourceKeys) || !Array.isArray(value.migration.warnings)) return false;
    return true;
};

/** Type guard for an app editor document embedded in the controller-owned JSON configuration. */
export function isControlConfigurationDocument(value: unknown): value is ControlConfigurationDocument {
    return isValidDocument(value);
}

function readLegacyDocument(capabilities: ControllerCapability[]): ControlConfigurationDocument {
    const document = createEmptyDocument();
    const sourceKeys: string[] = [];
    const warnings: string[] = [];

    const read = (key: string): string | null => {
        const value = localStorage.getItem(key);
        if (value !== null) sourceKeys.push(key);
        return value;
    };
    const readObject = (key: string): JsonRecord => {
        try { return parseRecord(read(key)); }
        catch { warnings.push(`Ignored malformed legacy data in ${key}.`); return {}; }
    };
    const readList = (key: string): unknown[] => {
        try { return parseArray(read(key)); }
        catch { warnings.push(`Ignored malformed legacy data in ${key}.`); return []; }
    };

    // Channel policy assignments, including the older capability-level format.
    const currentPolicies = readObject(CONTROL_POLICY_STORAGE_KEY);
    const legacyPolicies = readObject('prakiva.dashboard.control-policies');
    for (const capability of capabilities) {
        const control = document.controls[capability.id] ?? emptyControl(capability.id);
        for (const channel of capability.channels) {
            const compositeKey = channelPolicyKey(capability.id, channel.id);
            const current = currentPolicies[compositeKey];
            const legacy = legacyPolicies[capability.id];
            const candidate = typeof current === 'string' ? current : legacy ?? DEFAULT_CONTROL_POLICIES[compositeKey];
            if (typeof candidate === 'string' && channel.supportedPolicies.includes(candidate as ControlPolicy)) {
                control.channelPolicies[channel.id] = candidate as ControlPolicy;
            }
        }
        document.controls[capability.id] = control;
    }

    document.presentation.capabilityLabels = Object.fromEntries(
        Object.entries(readObject('prakiva.dashboard.capability-labels')).filter(([, value]) => typeof value === 'string'),
    ) as Record<string, string>;
    document.presentation.channelColors = Object.fromEntries(
        Object.entries(readObject('prakiva.dashboard.channel-colors')).filter(([, value]) => typeof value === 'string'),
    ) as Record<string, string>;

    for (const capability of capabilities) {
        const control = document.controls[capability.id] ?? emptyControl(capability.id);
        const groupCurves = readList(`prakiva.controls.group-curves.${capability.id}`);
        if (groupCurves.length) {
            control.curves = groupCurves;
        } else {
            const legacyCurveData = readObject(`prakiva.controls.curves.${capability.id}`);
            const legacyConfiguration = isRecord(legacyCurveData.configuration) ? legacyCurveData.configuration : {};
            const legacyCurves = Array.isArray(legacyConfiguration.curves) ? legacyConfiguration.curves : [];
            if (legacyCurves.length) {
                const legacyIds: Record<string, string> = { W: 'white', R: 'red', G: 'green', B: 'blue' };
                control.curves = legacyCurves.map(item => {
                    if (!isRecord(item)) return item;
                    const id = typeof item.id === 'string' ? (legacyIds[item.id] ?? item.id) : item.id;
                    const channel = capability.channels.find(candidate => candidate.id === id);
                    return { ...item, id, ...(channel ? { label: channel.label } : {}) };
                });
            }
        }

        control.inlineConfigurations = readObject(`prakiva.controls.inline-editors.${capability.id}`) as Record<string, Record<string, unknown>>;
        const workspace = readObject(`prakiva.controls.workspace.${capability.id}`);
        if (Object.keys(workspace).length) control.workspace = workspace;
        if (typeof workspace.savedAt === 'string') control.savedAt = workspace.savedAt;
        document.controls[capability.id] = control;
    }

    document.migration = {
        legacyLocalStorageImportedAt: new Date().toISOString(),
        sourceKeys: [...new Set(sourceKeys)],
        warnings,
    };
    return document;
}

function persist(document: ControlConfigurationDocument): void {
    // Mutations update only the in-memory working copy. Explicit Save commits it.
    workingDocument = document;
    notifyDraftListeners();
}

export class ControlConfigurationStore {
    /** Load the canonical document, importing legacy keys once and non-destructively. */
    static load(): ControlConfigurationDocument {
        if (workingDocument) return workingDocument;
        if (!controllerCapabilities) throw new Error('Controller capabilities must be synchronized before loading control configuration.');
        const raw = localStorage.getItem(CONTROL_CONFIGURATION_STORAGE_KEY);
        if (raw !== null) {
            let decoded: unknown;
            try { decoded = JSON.parse(raw); }
            catch { throw new Error('The saved Prakiva configuration is not valid JSON. Legacy data has been left untouched.'); }
            if (!isValidDocument(decoded)) throw new Error('The saved Prakiva configuration has an unsupported or invalid structure. Legacy data has been left untouched.');
            workingDocument = cloneDocument(decoded);
            // Normalize the previous build's unused revision field out of persisted storage.
            if (Object.prototype.hasOwnProperty.call(decoded, 'revision')) {
                localStorage.setItem(CONTROL_CONFIGURATION_STORAGE_KEY, JSON.stringify(workingDocument));
            }
            savedContent = contentOf(workingDocument);
            return workingDocument;
        }

        const migrated = readLegacyDocument(controllerCapabilities);
        // One-time migration establishes the canonical baseline. Legacy keys remain untouched.
        localStorage.setItem(CONTROL_CONFIGURATION_STORAGE_KEY, JSON.stringify(migrated));
        workingDocument = cloneDocument(migrated);
        savedContent = contentOf(migrated);
        return workingDocument;
    }

    static subscribe(listener: () => void): () => void {
        draftListeners.add(listener);
        return () => draftListeners.delete(listener);
    }

    static hasUnsavedChanges(): boolean {
        return contentOf(this.load()) !== savedContent;
    }

    /** Return a detached copy of the locally saved document for controller apply operations. */
    static getSavedDocument(): ControlConfigurationDocument {
        const raw = localStorage.getItem(CONTROL_CONFIGURATION_STORAGE_KEY);
        if (!raw) throw new Error('No locally saved configuration is available.');
        const decoded: unknown = JSON.parse(raw);
        if (!isValidDocument(decoded)) throw new Error('The locally saved configuration is invalid.');
        return cloneDocument(decoded);
    }

    /** Replace the local saved copy with a validated controller configuration. */
    static replaceWithControllerDocument(remoteDocument: ControlConfigurationDocument): ControlConfigurationDocument {
        if (!isValidDocument(remoteDocument)) throw new Error('The controller configuration has an unsupported or invalid structure.');
        const committed = cloneDocument(remoteDocument);
        committed.updatedAt = new Date().toISOString();
        localStorage.setItem(CONTROL_CONFIGURATION_STORAGE_KEY, JSON.stringify(committed));
        workingDocument = committed;
        savedContent = contentOf(committed);
        notifyDraftListeners();
        return committed;
    }

    static save(): ControlConfigurationDocument {
        const document = this.load();
        if (!this.hasUnsavedChanges()) return document;
        const committed = cloneDocument(document);
        committed.updatedAt = new Date().toISOString();
        localStorage.setItem(CONTROL_CONFIGURATION_STORAGE_KEY, JSON.stringify(committed));
        workingDocument = committed;
        savedContent = contentOf(committed);
        notifyDraftListeners();
        return committed;
    }

    static discard(): ControlConfigurationDocument {
        const raw = localStorage.getItem(CONTROL_CONFIGURATION_STORAGE_KEY);
        if (!raw) throw new Error('No saved configuration is available to restore.');
        const decoded: unknown = JSON.parse(raw);
        if (!isValidDocument(decoded)) throw new Error('The saved configuration is invalid.');
        workingDocument = cloneDocument(decoded);
        savedContent = contentOf(workingDocument);
        notifyDraftListeners();
        return workingDocument;
    }

    static getControl(capabilityId: string): StoredControlConfiguration {
        const document = this.load();
        return document.controls[capabilityId] ?? emptyControl(capabilityId);
    }

    static getChannelPolicies(): Record<string, ControlPolicy> {
        const document = this.load();
        const result: Record<string, ControlPolicy> = {};
        for (const [capabilityId, control] of Object.entries(document.controls)) {
            for (const [channelId, policy] of Object.entries(control.channelPolicies)) {
                result[channelPolicyKey(capabilityId, channelId)] = policy;
            }
        }
        return result;
    }

    static getCapabilityLabels(): Record<string, string> {
        return { ...this.load().presentation.capabilityLabels };
    }

    static getChannelColors(): Record<string, string> {
        return { ...this.load().presentation.channelColors };
    }

    static updateControl(capabilityId: string, patch: Partial<Omit<StoredControlConfiguration, 'capabilityId'>>): ControlConfigurationDocument {
        const document = this.load();
        const current = document.controls[capabilityId] ?? emptyControl(capabilityId);
        document.controls[capabilityId] = { ...current, ...patch, capabilityId };
        persist(document);
        return document;
    }

    /**
     * Capture only the configuration scope owned by one actuator/control editor.
     * This lets an editor distinguish its own edits from unrelated pending changes
     * (for example, a sensor widget selection made on the dashboard).
     */
    static getControlEditorSnapshot(capabilityId: string): ControlEditorDraftSnapshot {
        const document = this.load();
        const prefix = `${capabilityId}:`;
        const channelColors: Record<string, string> = {};
        for (const [key, color] of Object.entries(document.presentation.channelColors)) {
            if (key.startsWith(prefix)) channelColors[key] = color;
        }
        return {
            control: JSON.parse(JSON.stringify(document.controls[capabilityId] ?? emptyControl(capabilityId))) as StoredControlConfiguration,
            channelColors,
        };
    }

    /**
     * Restore only one editor's scope. Pending changes belonging to other
     * capabilities, including sensor presentation selections, remain intact.
     */
    static restoreControlEditorSnapshot(capabilityId: string, snapshot: ControlEditorDraftSnapshot): ControlConfigurationDocument {
        const document = this.load();
        document.controls[capabilityId] = JSON.parse(JSON.stringify(snapshot.control)) as StoredControlConfiguration;

        const prefix = `${capabilityId}:`;
        const nextColors = { ...document.presentation.channelColors };
        for (const key of Object.keys(nextColors)) {
            if (key.startsWith(prefix)) delete nextColors[key];
        }
        Object.assign(nextColors, snapshot.channelColors);
        document.presentation.channelColors = nextColors;

        persist(document);
        return document;
    }

    static setChannelPolicy(capabilityId: string, channelId: string, policy?: ControlPolicy): ControlConfigurationDocument {
        const current = this.getControl(capabilityId);
        const channelPolicies = { ...current.channelPolicies };
        if (policy) channelPolicies[channelId] = policy;
        else delete channelPolicies[channelId];
        return this.updateControl(capabilityId, { channelPolicies });
    }

    static setSensorWidget(capabilityId: string, channelId: string, widget: SensorWidgetType): ControlConfigurationDocument {
        const current = this.getControl(capabilityId);
        const sensorWidgets = { ...(current.sensorWidgets ?? {}) };
        if (widget === 'none') delete sensorWidgets[channelId];
        else sensorWidgets[channelId] = widget;
        return this.updateControl(capabilityId, { sensorWidgets });
    }

    static setCapabilityLabel(capabilityId: string, label: string): ControlConfigurationDocument {
        const document = this.load();
        document.presentation.capabilityLabels = { ...document.presentation.capabilityLabels, [capabilityId]: label };
        persist(document);
        return document;
    }

    static setChannelColor(capabilityId: string, channelId: string, color: string): ControlConfigurationDocument {
        const document = this.load();
        const key = channelPolicyKey(capabilityId, channelId);
        document.presentation.channelColors = { ...document.presentation.channelColors, [key]: color };
        persist(document);
        return document;
    }

    static saveCurves(capabilityId: string, curves: unknown[]): ControlConfigurationDocument {
        return this.updateControl(capabilityId, { curves });
    }

    static saveInlineConfigurations(capabilityId: string, configurations: Record<string, Record<string, unknown>>): ControlConfigurationDocument {
        return this.updateControl(capabilityId, { inlineConfigurations: configurations });
    }

    static hasProfileCollection(capabilityId: string, controlId: string): boolean {
        return Object.prototype.hasOwnProperty.call(this.getControl(capabilityId).profilesByControlId ?? {}, controlId);
    }

    static getProfiles(capabilityId: string, controlId: string): unknown[] {
        return [...(this.getControl(capabilityId).profilesByControlId?.[controlId] ?? [])];
    }

    static saveProfiles(capabilityId: string, controlId: string, profiles: unknown[]): ControlConfigurationDocument {
        const current = this.getControl(capabilityId);
        const profilesByControlId = { ...(current.profilesByControlId ?? {}), [controlId]: JSON.parse(JSON.stringify(profiles)) as unknown[] };
        return this.updateControl(capabilityId, { profilesByControlId });
    }

    /**
     * Import already-persisted legacy profiles into the in-memory document
     * without treating the migration itself as a user edit. The legacy source
     * remains intact; the imported profiles are committed to the canonical
     * document the next time the user explicitly saves a real change.
     */
    static importProfilesAsBaseline(capabilityId: string, controlId: string, profiles: unknown[]): void {
        const document = this.load();
        const current = document.controls[capabilityId] ?? emptyControl(capabilityId);
        if (Object.prototype.hasOwnProperty.call(current.profilesByControlId ?? {}, controlId)) return;

        const imported = JSON.parse(JSON.stringify(profiles)) as unknown[];
        const nextControl = {
            ...current,
            profilesByControlId: { ...(current.profilesByControlId ?? {}), [controlId]: imported },
        };
        document.controls[capabilityId] = nextControl;

        // Extend the saved comparison baseline with the same legacy data,
        // preserving any unrelated unsaved edits already in the working copy.
        const baseline = JSON.parse(savedContent || '{}') as {
            controls?: Record<string, StoredControlConfiguration>;
            presentation?: ControlConfigurationDocument['presentation'];
        };
        const baselineControls = baseline.controls ?? {};
        const baselineControl = baselineControls[capabilityId] ?? emptyControl(capabilityId);
        baselineControls[capabilityId] = {
            ...baselineControl,
            profilesByControlId: {
                ...(baselineControl.profilesByControlId ?? {}),
                [controlId]: imported,
            },
        };
        savedContent = JSON.stringify({
            controls: baselineControls,
            presentation: baseline.presentation ?? document.presentation,
        });
        notifyDraftListeners();
    }

    static saveWorkspace(capabilityId: string, workspace: Record<string, unknown>): ControlConfigurationDocument {
        return this.updateControl(capabilityId, { workspace, savedAt: typeof workspace.savedAt === 'string' ? workspace.savedAt : new Date().toISOString() });
    }
}
