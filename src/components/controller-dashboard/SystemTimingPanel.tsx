import { useCallback, useEffect, useState } from 'react';
import { IonButton, IonCard, IonCardContent, IonInput, IonItem, IonLabel, IonText, IonSpinner } from '@ionic/react';
import type { SavedController } from '../../models/saved-controller';
import { ControllerSessionStore } from '../../services/controller-session-store';
import { controllerRequest } from '../../services/controller-api';

type Timing = {
    controller_cycle_seconds: number; minimum_seconds: number; maximum_seconds: number;
    remote_sensor_interval_seconds?: number; remote_actuator_interval_seconds?: number;
    remote_interval_minimum_seconds?: number; remote_interval_maximum_seconds?: number;
};

/** System timing is a controller setting, not an unapplied controls draft. */
const SystemTimingPanel: React.FC<{ controller: SavedController }> = ({ controller }) => {
    const [timing, setTiming] = useState<Timing | null>(null);
    const [cycle, setCycle] = useState<number>(1);
    const [sensorInterval, setSensorInterval] = useState<number>(5);
    const [actuatorInterval, setActuatorInterval] = useState<number>(5);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const request = useCallback(async (operation: string, extra: Record<string, unknown> = {}) => {
        const session = await ControllerSessionStore.load(controller.deviceId);
        if (!session?.sessionToken) throw new Error('Sign in to configure system timing.');
        return controllerRequest(controller.address, controller.httpPort, operation, { session_token: session.sessionToken, ...extra });
    }, [controller]);
    const refresh = useCallback(async () => {
        const result = await request('get_system_timing');
        const data = result.data as unknown as Timing;
        if (!data || !Number.isInteger(data.controller_cycle_seconds) || !Number.isInteger(data.minimum_seconds) || !Number.isInteger(data.maximum_seconds)) {
            throw new Error('Controller returned invalid system timing settings.');
        }
        setTiming(data);
        setCycle(data.controller_cycle_seconds);
        setSensorInterval(data.remote_sensor_interval_seconds ?? 5);
        setActuatorInterval(data.remote_actuator_interval_seconds ?? 5);
    }, [request]);
    useEffect(() => {
        let active = true;
        void refresh().catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not read system timing.'); });
        return () => { active = false; };
    }, [refresh]);
    const minHttp = timing?.remote_interval_minimum_seconds ?? 1;
    const maxHttp = timing?.remote_interval_maximum_seconds ?? 3600;
    const valid = timing && Number.isInteger(cycle) && cycle >= timing.minimum_seconds && cycle <= timing.maximum_seconds &&
        Number.isInteger(sensorInterval) && sensorInterval >= minHttp && sensorInterval <= maxHttp &&
        Number.isInteger(actuatorInterval) && actuatorInterval >= minHttp && actuatorInterval <= maxHttp;
    const save = async () => {
        if (!valid || busy) return;
        setBusy(true); setError(''); setNotice('');
        try {
            await request('set_system_timing', {
                controller_cycle_seconds: cycle,
                remote_sensor_interval_seconds: sensorInterval,
                remote_actuator_interval_seconds: actuatorInterval,
            });
            await refresh();
            setNotice('System timing saved and verified.');
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not save controller timing.'); }
        finally { setBusy(false); }
    };
    return <IonCard><IonCardContent>
        <h2>System timing</h2>
        <IonText color="medium"><p>Controller cycle is a logical timebase. The main loop remains responsive. Changes here are applied directly to the controller, independently of the Controls Save button.</p></IonText>
        {!timing && !error && <IonSpinner />}
        {timing && <>
            <IonItem><IonLabel position="stacked">Controller cycle (seconds)</IonLabel>
                <IonInput type="number" min={String(timing.minimum_seconds)} max={String(timing.maximum_seconds)} step="1" value={cycle} onIonInput={e => setCycle(Number(e.detail.value))} /></IonItem>
            <IonText color="medium"><p>Firmware range: {timing.minimum_seconds}–{timing.maximum_seconds} seconds.</p></IonText>
            <IonItem><IonLabel position="stacked">Remote sensor polling interval (seconds)</IonLabel>
                <IonInput type="number" min={String(minHttp)} max={String(maxHttp)} step="1" value={sensorInterval} onIonInput={e => setSensorInterval(Number(e.detail.value))} /></IonItem>
            <IonItem><IonLabel position="stacked">Remote actuator minimum dispatch spacing (seconds)</IonLabel>
                <IonInput type="number" min={String(minHttp)} max={String(maxHttp)} step="1" value={actuatorInterval} onIonInput={e => setActuatorInterval(Number(e.detail.value))} /></IonItem>
            <IonText color="medium"><p>Remote HTTP range: {minHttp}–{maxHttp} seconds. Defaults are 5 seconds; each setting is independent of the controller cycle.</p></IonText>
            <IonButton expand="block" disabled={!valid || busy} onClick={() => void save()}>Save system timing</IonButton>
            <IonButton expand="block" fill="outline" disabled={busy} onClick={() => { setError(''); setNotice(''); void refresh().catch(e => setError(e instanceof Error ? e.message : 'Refresh failed.')); }}>Refresh from controller</IonButton>
        </>}
        {notice && <IonText color="success"><p>{notice}</p></IonText>}
        {error && <IonText color="danger"><p role="alert">{error}</p></IonText>}
    </IonCardContent></IonCard>;
};
export default SystemTimingPanel;
