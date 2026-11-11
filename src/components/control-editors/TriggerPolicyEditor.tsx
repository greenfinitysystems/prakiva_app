import { useCallback, useEffect, useRef, useState } from 'react';
import { IonButton, IonSpinner, IonInput, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonText, IonToggle } from '@ionic/react';
import type { InlineChannelEditorProps } from './types';
import { validateTriggerRangeConfiguration } from '../../config/trigger-validation';

type TriggerSource = 'schedule' | 'sensor' | 'system';
type SavedTriggerConfig = Omit<Partial<TriggerConfig>, 'source'> & { source?: TriggerSource | 'manual' };
type Recurrence = 'hourly' | 'daily' | 'weekly' | 'monthly';
type SensorCondition = 'above' | 'below' | 'enters_range' | 'exits_range';
type NumericInput = number | '';
type TriggerConfig = {
    enabled: boolean;
    source: TriggerSource;
    schedule: { recurrence: Recurrence; date: string; time: string; intervalHours: number; weekdays: string[]; dayOfMonth: number; missedOccurrence: 'skip' | 'run_when_available' };
    sensor: { sensorId: string; condition: SensorCondition; threshold: number; lower: NumericInput; upper: NumericInput; sustainedSeconds: number };
};

const DEFAULT_CONFIG: TriggerConfig = {
    enabled: true,
    source: 'schedule',
    schedule: { recurrence: 'daily', date: '', time: '09:00', intervalHours: 24, weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], dayOfMonth: 1, missedOccurrence: 'skip' },
    sensor: { sensorId: '', condition: 'above', threshold: 0, lower: '', upper: '', sustainedSeconds: 0 },
};

const WEEKDAYS = [
    ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
    ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
] as const;

const finiteNumberOrBlank = (value: unknown): NumericInput => {
    if (value === '' || value === null || value === undefined) return '';
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : '';
};

const TriggerPolicyEditor: React.FC<InlineChannelEditorProps> = ({ value = {}, onChange, capabilities, capabilityId, channelId, onInvoke, onReadExecutionState }) => {
    const [invoking, setInvoking] = useState(false);
    const [executionState, setExecutionState] = useState<'IDLE' | 'RUNNING' | 'UNKNOWN'>('UNKNOWN');
    const [invocationNotice, setInvocationNotice] = useState<{ message: string; error: boolean } | null>(null);
    const readStateRef = useRef(onReadExecutionState);
    readStateRef.current = onReadExecutionState;
    const pollingBusy = useRef(false);
    const mounted = useRef(true);
    const refreshState = useCallback(async () => {
        if (!readStateRef.current || pollingBusy.current) return;
        pollingBusy.current = true;
        try {
            const state = await readStateRef.current();
            if (mounted.current) setExecutionState(state);
        } catch (error) {
            if (mounted.current) {
                setExecutionState('UNKNOWN');
                console.warn('[Prakiva] Could not read actuator execution state:', error);
            }
        } finally {
            pollingBusy.current = false;
        }
    }, []);
    useEffect(() => {
        mounted.current = true;
        setExecutionState('UNKNOWN');
        void refreshState();
        const timer = window.setInterval(() => { void refreshState(); }, 2000);
        return () => { mounted.current = false; window.clearInterval(timer); };
    }, [refreshState, capabilityId, channelId]);
    const runNow = async () => {
        if (!onInvoke || invoking || executionState !== 'IDLE') return;
        setInvoking(true);
        setExecutionState('UNKNOWN');
        setInvocationNotice(null);
        try {
            await onInvoke();
            setExecutionState('RUNNING');
            setInvocationNotice({ message: 'Operation accepted by controller.', error: false });
        } catch (error) {
            setInvocationNotice({ message: error instanceof Error ? error.message : String(error), error: true });
        } finally {
            setInvoking(false);
            void refreshState();
        }
    };
    const saved = value as SavedTriggerConfig;
    // Migrate the former "Started manually" selection into manual mode.
    const legacyManual = saved.source === 'manual';
    const config: TriggerConfig = {
        ...DEFAULT_CONFIG,
        ...saved,
        enabled: legacyManual ? false : (saved.enabled ?? DEFAULT_CONFIG.enabled),
        source: saved.source === 'sensor' || saved.source === 'system' ? saved.source : 'schedule',
        schedule: { ...DEFAULT_CONFIG.schedule, ...(saved.schedule ?? {}) },
        sensor: {
            ...DEFAULT_CONFIG.sensor,
            ...(saved.sensor ?? {}),
            lower: finiteNumberOrBlank(saved.sensor?.lower),
            upper: finiteNumberOrBlank(saved.sensor?.upper),
        },
    };

    const update = (patch: Partial<TriggerConfig>) => onChange({
        ...config,
        ...patch,
        schedule: { ...config.schedule, ...(patch.schedule ?? {}) },
        sensor: { ...config.sensor, ...(patch.sensor ?? {}) },
    });
    const updateSchedule = (patch: Partial<TriggerConfig['schedule']>) => update({ schedule: { ...config.schedule, ...patch } });
    const updateSensor = (patch: Partial<TriggerConfig['sensor']>) => update({ sensor: { ...config.sensor, ...patch } });
    const sensors = capabilities
        .filter(capability => capability.kind === 'sensor')
        .flatMap(capability => capability.channels
            .filter(channel => channel.valueType === 'analog')
            .map(channel => ({ id: `${capability.id}.${channel.id}`, label: `${capability.name} · ${channel.label}${channel.unit ? ` (${channel.unit})` : ''}` })));
    const rangeCondition = config.sensor.condition === 'enters_range' || config.sensor.condition === 'exits_range';
    const rangeValidation = validateTriggerRangeConfiguration(config);
    const updateBound = (field: 'lower' | 'upper', raw: string | number | null | undefined) => {
        const parsed: NumericInput = raw === '' || raw === null || raw === undefined ? '' : Number(raw);
        updateSensor({ [field]: parsed === '' ? '' : (Number.isFinite(parsed) ? parsed : '') });
    };

    return <div className="trigger-policy-editor">
        <IonItem lines="none">
            <IonLabel>
                <h3>Automatic operation</h3>
                <p>{config.enabled ? 'Automatic trigger policy is enabled.' : 'Automatic starts are disabled. Manual operation mode is selected.'}</p>
            </IonLabel>
            <IonToggle slot="end" checked={config.enabled} onIonChange={event => update({ enabled: event.detail.checked })} />
        </IonItem>

        {config.enabled ? <>
            <IonItem>
                <IonLabel position="stacked">Start operation when</IonLabel>
                <IonSelect interface="popover" value={config.source} onIonChange={event => update({ source: event.detail.value as TriggerSource })}>
                    <IonSelectOption value="schedule">At a scheduled time</IonSelectOption>
                    <IonSelectOption value="sensor">A sensor condition is met</IonSelectOption>
                    <IonSelectOption value="system">A system event occurs</IonSelectOption>
                </IonSelect>
            </IonItem>

            {config.source === 'schedule' && <>
                <IonItem>
                    <IonLabel position="stacked">Repeat</IonLabel>
                    <IonSelect interface="popover" value={config.schedule.recurrence} onIonChange={event => updateSchedule({ recurrence: event.detail.value as Recurrence })}>
                        <IonSelectOption value="hourly">Hourly</IonSelectOption>
                        <IonSelectOption value="daily">Daily</IonSelectOption>
                        <IonSelectOption value="weekly">Weekly</IonSelectOption>
                        <IonSelectOption value="monthly">Monthly</IonSelectOption>
                    </IonSelect>
                </IonItem>
                {config.schedule.recurrence === 'weekly' && <IonItem>
                    <IonLabel position="stacked">Days of the week</IonLabel>
                    <IonSelect multiple interface="alert" value={config.schedule.weekdays} onIonChange={event => updateSchedule({ weekdays: (event.detail.value ?? []) as string[] })}>
                        {WEEKDAYS.map(([id, label]) => <IonSelectOption key={id} value={id}>{label}</IonSelectOption>)}
                    </IonSelect>
                </IonItem>}
                {config.schedule.recurrence === 'monthly' && <IonItem>
                    <IonLabel position="stacked">Day of month (1–28)</IonLabel>
                    <IonInput type="number" min="1" max="28" value={config.schedule.dayOfMonth} onIonInput={event => updateSchedule({ dayOfMonth: Math.max(1, Math.min(28, Number(event.detail.value) || 1)) })} />
                </IonItem>}
                <IonItem>
                    <IonLabel position="stacked">{config.schedule.recurrence === 'hourly' ? 'Minute of each hour (HH ignored)' : 'Start time'}</IonLabel>
                    <IonInput type="time" value={config.schedule.time} onIonInput={event => updateSchedule({ time: String(event.detail.value ?? '') })} />
                </IonItem>
                <IonNote color="medium">Missed occurrences are skipped. The controller fires only on an observed minute transition.</IonNote>
            </>}

            {config.source === 'sensor' && <>
                <IonItem>
                    <IonLabel position="stacked">Sensor</IonLabel>
                    <IonSelect interface="popover" value={config.sensor.sensorId} placeholder="Select a sensor" onIonChange={event => updateSensor({ sensorId: String(event.detail.value ?? '') })}>
                        {sensors.map(sensor => <IonSelectOption key={sensor.id} value={sensor.id}>{sensor.label}</IonSelectOption>)}
                    </IonSelect>
                </IonItem>
                <IonItem>
                    <IonLabel position="stacked">Condition</IonLabel>
                    <IonSelect interface="popover" value={config.sensor.condition} onIonChange={event => updateSensor({ condition: event.detail.value as SensorCondition })}>
                        <IonSelectOption value="below">Falls below</IonSelectOption>
                        <IonSelectOption value="above">Rises above</IonSelectOption>
                        <IonSelectOption value="enters_range">Enters a range</IonSelectOption>
                        <IonSelectOption value="exits_range">Exits a range</IonSelectOption>
                    </IonSelect>
                </IonItem>
                {rangeCondition ? <>
                    <IonItem>
                        <IonLabel position="stacked">Lower threshold</IonLabel>
                        <IonInput type="number" value={config.sensor.lower} onIonInput={event => updateBound('lower', event.detail.value)} />
                    </IonItem>
                    <IonItem>
                        <IonLabel position="stacked">Upper threshold</IonLabel>
                        <IonInput type="number" value={config.sensor.upper} onIonInput={event => updateBound('upper', event.detail.value)} />
                    </IonItem>
                    {!rangeValidation.valid && <IonText color="danger"><p className="ion-padding-start ion-padding-end">{rangeValidation.message}</p></IonText>}
                </> : <IonItem>
                    <IonLabel position="stacked">Threshold</IonLabel>
                    <IonInput type="number" value={config.sensor.threshold} onIonInput={event => updateSensor({ threshold: Number(event.detail.value) || 0 })} />
                </IonItem>}
                <IonItem>
                    <IonLabel position="stacked">Condition must remain true (seconds)</IonLabel>
                    <IonInput type="number" min="0" value={config.sensor.sustainedSeconds} onIonInput={event => updateSensor({ sustainedSeconds: Math.max(0, Number(event.detail.value) || 0) })} />
                </IonItem>
                <IonNote color="medium">The condition must persist for the configured duration before the trigger is accepted.</IonNote>
            </>}

            {config.source === 'system' && <IonText color="medium"><p>System-event triggers will be selectable when the controller publishes its supported event catalogue.</p></IonText>}
        </> : <>
            <IonItem lines="none">
                <IonLabel>
                    <h3>Manual operation</h3>
                    <p>Start the configured virtual operation immediately.</p>
                </IonLabel>
            </IonItem>
            <IonItem lines="none">
                <IonLabel>Execution state</IonLabel>
                <IonText color={executionState === 'RUNNING' ? 'success' : executionState === 'IDLE' ? 'medium' : 'warning'}>
                    <strong>{executionState}</strong>
                </IonText>
            </IonItem>
            <IonButton expand="block" disabled={!onInvoke || invoking || executionState !== 'IDLE'} onClick={() => { void runNow(); }}>
                {invoking ? <IonSpinner name="crescent" /> : 'Run Now'}
            </IonButton>
            {executionState === 'UNKNOWN' && onReadExecutionState && <IonNote color="warning">Waiting for controller execution state.</IonNote>}
            {!onInvoke && <IonNote color="medium">Manual invocation is unavailable without a connected controller.</IonNote>}
            {invocationNotice && <IonText color={invocationNotice.error ? 'danger' : 'success'}>
                <p className="ion-padding-start ion-padding-end">{invocationNotice.message}</p>
            </IonText>}
            <IonNote color="medium">Automatic schedule settings are retained but inactive. Run Now sends one request; it does not wait for operation completion.</IonNote>
        </>}
    </div>;
};

export default TriggerPolicyEditor;
