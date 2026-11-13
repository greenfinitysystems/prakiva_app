import { useEffect, useRef, useState } from 'react';
import { IonButton, IonButtons, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList, IonModal, IonNote, IonSpinner, IonText, IonTitle, IonToolbar } from '@ionic/react';
import type { CalibrationPoint, SensorCalibration } from '../services/sensor-calibration';
import { clearSensorCalibration, getSensorCalibration, setSensorCalibration } from '../services/sensor-calibration';

interface Props {
    isOpen: boolean;
    onDismiss: () => void;
    address: string;
    port: number;
    token: string;
    capabilityId: string;
    channelId: string;
    title: string;
    unit?: string;
}
const POLL_MS = 2000;
const fmt = (value: number | undefined) => value === undefined ? 'Unavailable' : Number(value.toFixed(4)).toString();
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function SensorCalibrationEditor(props: Props) {
    const { isOpen, onDismiss, address, port, token, capabilityId, channelId, title, unit = '' } = props;
    const [calibration, setCalibration] = useState<SensorCalibration | null>(null);
    const [draft, setDraft] = useState<CalibrationPoint[]>([]);
    const [referenceText, setReferenceText] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const dirtyRef = useRef(false);
    const busyRef = useRef(false);

    useEffect(() => {
        if (!isOpen || !token) return;
        let active = true;
        let inFlight = false;
        const refresh = async () => {
            if (inFlight) return;
            inFlight = true;
            try {
                const result = await getSensorCalibration(address, port, token, capabilityId, channelId);
                if (active) {
                    setCalibration(result);
                    setDraft(current => dirtyRef.current ? current : result.points);
                    setError('');
                }
            } catch (e) { if (active) setError(message(e)); }
            finally { inFlight = false; }
        };
        setCalibration(null);
        setDraft([]);
        dirtyRef.current = false;
        setDirty(false);
        setReferenceText('');
        setNotice('');
        setError('');
        void refresh();
        const timer = window.setInterval(() => { if (!busyRef.current) void refresh(); }, POLL_MS);
        return () => { active = false; window.clearInterval(timer); };
    }, [isOpen, token, address, port, capabilityId, channelId]);

    const capture = () => {
        if (!calibration || calibration.rawValue === undefined) {
            setError('No valid raw sensor reading is available for capture.'); return;
        }
        const raw = calibration.rawValue;
        const reference = Number(referenceText);
        if (!referenceText.trim() || !Number.isFinite(reference) ||
            !(raw > calibration.minimum && raw < calibration.maximum) ||
            !(reference > calibration.minimum && reference < calibration.maximum)) {
            setError(`Raw and reference values must be strictly between ${calibration.minimum} and ${calibration.maximum}.`);
            return;
        }
        const next = draft.filter(point => Math.abs(point.raw - raw) > 1e-6);
        if (next.length >= 16) { setError('A maximum of 16 calibration points is supported.'); return; }
        next.push({ raw, reference });
        next.sort((a, b) => a.raw - b.raw);
        setDraft(next);
        dirtyRef.current = true; setDirty(true);
        setReferenceText('');
        setError('');
        setNotice('Point captured locally. Tap Save Calibration to send the complete list to the controller.');
    };
    const save = async () => {
        busyRef.current = true; setBusy(true); setError(''); setNotice('');
        try {
            const result = await setSensorCalibration(address, port, token, capabilityId, channelId, draft);
            setCalibration(result); setDraft(result.points); dirtyRef.current = false; setDirty(false);
            setNotice('Calibration saved to the controller.');
        } catch (e) { setError(message(e)); }
        finally { busyRef.current = false; setBusy(false); }
    };
    const clear = async () => {
        if (!window.confirm('Clear all calibration points for this sensor on the controller?')) return;
        busyRef.current = true; setBusy(true); setError(''); setNotice('');
        try {
            const result = await clearSensorCalibration(address, port, token, capabilityId, channelId);
            setCalibration(result); setDraft([]); dirtyRef.current = false; setDirty(false);
            setNotice('Calibration cleared. Sensor readings now use the raw values.');
        } catch (e) { setError(message(e)); }
        finally { busyRef.current = false; setBusy(false); }
    };
    const remove = (index: number) => {
        setDraft(current => current.filter((_, i) => i !== index));
        dirtyRef.current = true; dirtyRef.current = true; setDirty(true); setNotice('Point removed locally. Save to update the controller.');
    };
    return <IonModal isOpen={isOpen} onDidDismiss={onDismiss}>
        <IonHeader><IonToolbar>
            <IonTitle>{title} · Calibration</IonTitle>
            <IonButtons slot="end"><IonButton onClick={onDismiss}>Close</IonButton></IonButtons>
        </IonToolbar></IonHeader>
        <IonContent className="ion-padding">
            {!calibration && !error && <IonSpinner />}
            {error && <IonText color="danger"><p>{error}</p></IonText>}
            {notice && <IonText color="success"><p>{notice}</p></IonText>}
            {calibration && <>
                <p><strong>Raw reading:</strong> {fmt(calibration.rawValue)} {unit}</p>
                <p><strong>Calibrated reading:</strong> {fmt(calibration.calibratedValue)} {unit}</p>
                <IonNote>Sensor range: {calibration.minimum} to {calibration.maximum} {unit}. The two endpoints have fixed zero correction.</IonNote>
                <IonItem>
                    <IonInput label="Reference value" labelPlacement="stacked" type="number"
                        placeholder="Enter known reference measurement" value={referenceText}
                        onIonInput={event => setReferenceText(String(event.detail.value ?? ''))} />
                </IonItem>
                <IonButton expand="block" fill="outline" disabled={busy || calibration.rawValue === undefined} onClick={capture}>
                    Capture current raw reading
                </IonButton>
                <IonList>
                    <IonItem><IonLabel><strong>Calibration points ({draft.length})</strong></IonLabel></IonItem>
                    {draft.map((point, index) => <IonItem key={`${point.raw}-${index}`}>
                        <IonLabel>{fmt(point.raw)} → {fmt(point.reference)} {unit}</IonLabel>
                        <IonButton slot="end" color="danger" fill="clear" disabled={busy} onClick={() => remove(index)}>Remove</IonButton>
                    </IonItem>)}
                </IonList>
                {draft.length === 0 && <IonNote>No calibration points. Measurements use the identity correction.</IonNote>}
                <IonButton expand="block" disabled={busy || !dirty} onClick={() => void save()}>
                    {busy ? 'Saving…' : 'Save Calibration'}
                </IonButton>
                <IonButton expand="block" fill="outline" color="danger" disabled={busy || (!calibration.calibrated && !dirty)} onClick={() => void clear()}>
                    Clear Calibration
                </IonButton>
                {dirty && <IonNote>Unsaved changes will be discarded if you close this screen.</IonNote>}
            </>}
        </IonContent>
    </IonModal>;
}
