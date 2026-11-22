import { useCallback, useEffect, useRef, useState } from 'react';
import { IonAlert, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonSpinner, IonText, IonTitle, IonToolbar, useIonViewDidEnter } from '@ionic/react';
import { arrowBack } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerSessionStore } from '../services/controller-session-store';
import { controllerRequest } from '../services/controller-api';

type Timing = {
    controller_cycle_seconds: number;
    minimum_seconds: number;
    maximum_seconds: number;
    remote_sensor_interval_seconds?: number;
    remote_actuator_interval_seconds?: number;
    remote_interval_minimum_seconds?: number;
    remote_interval_maximum_seconds?: number;
};
type Draft = { cycle: number; sensor: number; actuator: number };
const fromTiming = (t: Timing): Draft => ({ cycle: t.controller_cycle_seconds, sensor: t.remote_sensor_interval_seconds ?? 5, actuator: t.remote_actuator_interval_seconds ?? 5 });

const SystemTimingPage: React.FC = () => {
    const navigate = useNavigate();
    const controller = (useLocation().state as { controller?: SavedController } | null)?.controller;
    const [timing, setTiming] = useState<Timing | null>(null);
    const [draft, setDraft] = useState<Draft>({ cycle: 1, sensor: 5, actuator: 5 });
    const [baseline, setBaseline] = useState<Draft | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [leaveOpen, setLeaveOpen] = useState(false);
    const active = useRef(true);
    const dirty = baseline !== null && JSON.stringify(draft) !== JSON.stringify(baseline);
    const request = useCallback(async (operation: string, fields: Record<string, unknown> = {}) => {
        if (!controller) throw new Error('Controller context is missing.');
        const session = await ControllerSessionStore.load(controller.deviceId);
        if (!session?.sessionToken) throw new Error('Sign in to configure system timing.');
        return controllerRequest(controller.address, controller.httpPort, operation, { session_token: session.sessionToken, ...fields });
    }, [controller]);
    const load = useCallback(async () => {
        const result = await request('get_system_timing');
        const t = result.data as unknown as Timing;
        if (!t || !Number.isInteger(t.controller_cycle_seconds) || !Number.isInteger(t.minimum_seconds) || !Number.isInteger(t.maximum_seconds)) {
            throw new Error('Controller returned invalid system timing settings.');
        }
        if (active.current) { const values = fromTiming(t); setTiming(t); setDraft(values); setBaseline(values); }
    }, [request]);
    useIonViewDidEnter(() => {
        active.current = true;
        setTiming(null); setBaseline(null); setError(''); setNotice('');
        void load().catch(e => { if (active.current) setError(e instanceof Error ? e.message : 'Could not read system timing.'); });
    });
    useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
    const minHttp = timing?.remote_interval_minimum_seconds ?? 1;
    const maxHttp = timing?.remote_interval_maximum_seconds ?? 3600;
    const valid = timing !== null && Number.isInteger(draft.cycle) && draft.cycle >= timing.minimum_seconds && draft.cycle <= timing.maximum_seconds &&
        Number.isInteger(draft.sensor) && draft.sensor >= minHttp && draft.sensor <= maxHttp &&
        Number.isInteger(draft.actuator) && draft.actuator >= minHttp && draft.actuator <= maxHttp;
    const leave = () => { setLeaveOpen(false); navigate('/controller-dashboard', { state: { controller } }); };
    const apply = async (leaveAfter: boolean) => {
        if (!valid || busy) return;
        setBusy(true); setError(''); setNotice('');
        try {
            await request('set_system_timing', {
                controller_cycle_seconds: draft.cycle,
                remote_sensor_interval_seconds: draft.sensor,
                remote_actuator_interval_seconds: draft.actuator,
            });
            const result = await request('get_system_timing');
            const verified = result.data as unknown as Timing;
            const values = fromTiming(verified);
            if (JSON.stringify(values) !== JSON.stringify(draft)) throw new Error('Controller timing read-back did not match the requested values.');
            setTiming(verified); setDraft(values); setBaseline(values);
            setNotice('System timing applied and verified.');
            if (leaveAfter) leave();
        } catch (e) { setLeaveOpen(false); setError(e instanceof Error ? e.message : 'Could not save system timing.'); }
        finally { setBusy(false); }
    };
    if (!controller) return <IonPage><IonContent className="ion-padding">Controller context missing. <IonButton onClick={() => navigate('/home')}>Home</IonButton></IonContent></IonPage>;
    return <IonPage>
        <IonHeader><IonToolbar>
            <IonButtons slot="start"><IonButton fill="clear" aria-label="Back to dashboard" onClick={() => { if (!busy) { if (dirty) setLeaveOpen(true); else leave(); } }}><IonIcon slot="icon-only" icon={arrowBack}/></IonButton></IonButtons>
            <IonTitle>System Timing</IonTitle>
        </IonToolbar></IonHeader>
        <IonContent className="ion-padding">
            {!timing && !error && <IonSpinner />}
            {timing && <>
                <IonText color="medium"><p>These settings apply directly to the controller and are independent of Controls Configuration.</p></IonText>
                <IonItem><IonLabel position="stacked">Controller cycle (seconds)</IonLabel><IonInput type="number" min={String(timing.minimum_seconds)} max={String(timing.maximum_seconds)} step="1" value={draft.cycle} onIonInput={e => setDraft(p => ({ ...p, cycle: Number(e.detail.value) }))}/></IonItem>
                <IonText color="medium"><p>Allowed: {timing.minimum_seconds}–{timing.maximum_seconds} seconds.</p></IonText>
                <IonItem><IonLabel position="stacked">Remote sensor polling interval (seconds)</IonLabel><IonInput type="number" min={String(minHttp)} max={String(maxHttp)} step="1" value={draft.sensor} onIonInput={e => setDraft(p => ({ ...p, sensor: Number(e.detail.value) }))}/></IonItem>
                <IonItem><IonLabel position="stacked">Remote actuator minimum dispatch spacing (seconds)</IonLabel><IonInput type="number" min={String(minHttp)} max={String(maxHttp)} step="1" value={draft.actuator} onIonInput={e => setDraft(p => ({ ...p, actuator: Number(e.detail.value) }))}/></IonItem>
                <IonText color="medium"><p>Remote HTTP interval range: {minHttp}–{maxHttp} seconds.</p></IonText>
                <IonButton expand="block" disabled={!dirty || !valid || busy} onClick={() => void apply(false)}>{busy ? 'Applying…' : 'Apply'}</IonButton>
            </>}
            {notice && <IonText color="success"><p>{notice}</p></IonText>}
            {error && <IonText color="danger"><p role="alert">{error}</p></IonText>}
        </IonContent>
        <IonAlert isOpen={leaveOpen} onDidDismiss={() => setLeaveOpen(false)} header="Unsaved system timing" message="Apply the changes before leaving?" buttons={[
            { text: 'Continue Editing', role: 'cancel' },
            { text: 'Discard & Leave', role: 'destructive', handler: leave },
            { text: 'Apply & Leave', handler: () => { void apply(true); } },
        ]}/>
    </IonPage>;
};
export default SystemTimingPage;
