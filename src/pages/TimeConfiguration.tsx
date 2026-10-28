import { useCallback, useEffect, useState } from 'react';
import {
    IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonContent,
    IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonPage,
    IonSpinner, IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import { refreshOutline, timeOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import {
    ControllerApiError, getTimeStatus, setScheduleOffset,
    syncTimeFromNtp, syncTimeFromPhone, validateOwnerSession,
    type TimeStatus,
} from '../services/controller-api';
import { ControllerSessionStore } from '../services/controller-session-store';
import './Home.css';

interface PageState { controller?: SavedController }

function formatDate(unixSeconds: number): string {
    if (!unixSeconds || !Number.isFinite(unixSeconds)) return 'Not available';
    return new Date(unixSeconds * 1000).toLocaleString();
}

function sourceLabel(source: string): string {
    if (source === 'phone') return 'Phone';
    if (source === 'ntp') return 'NTP server';
    return 'Not synchronized';
}

const TimeConfiguration: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const controller = (location.state as PageState | null)?.controller;
    const [status, setStatus] = useState<TimeStatus | null>(null);
    const [offsetInput, setOffsetInput] = useState('0');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const loadStatus = useCallback(async (showSpinner = true) => {
        if (!controller) { navigate('/home', { replace: true }); return; }
        if (showSpinner) setLoading(true);
        setError('');
        try {
            const session = await ControllerSessionStore.load(controller.deviceId);
            if (!session) {
                navigate('/controller-login', { replace: true, state: { controller, returnTo: '/time-configuration' } });
                return;
            }
            const valid = await validateOwnerSession(controller.address, controller.httpPort, session.sessionToken);
            if (!valid) {
                await ControllerSessionStore.clear(controller.deviceId);
                navigate('/controller-login', { replace: true, state: { controller, returnTo: '/time-configuration' } });
                return;
            }
            const result = await getTimeStatus(controller.address, controller.httpPort, session.sessionToken);
            setStatus(result);
            setOffsetInput(String(result.schedule_offset_minutes));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, [controller?.deviceId, controller?.address, controller?.httpPort, navigate]);

    useEffect(() => { void loadStatus(); }, [loadStatus]);

    const perform = async (action: 'phone' | 'ntp' | 'offset') => {
        if (!controller) return;
        const offset = Number(offsetInput);
        if (action === 'offset' && (!Number.isInteger(offset) || offset < -720 || offset > 720)) {
            setError('Enter a whole number from -720 to +720 minutes.');
            return;
        }
        setBusy(true); setError(''); setNotice('');
        try {
            const session = await ControllerSessionStore.load(controller.deviceId);
            if (!session) {
                navigate('/controller-login', { replace: true, state: { controller, returnTo: '/time-configuration' } });
                return;
            }
            let result: TimeStatus;
            if (action === 'phone') {
                result = await syncTimeFromPhone(controller.address, controller.httpPort, session.sessionToken);
            } else if (action === 'ntp') {
                result = await syncTimeFromNtp(controller.address, controller.httpPort, session.sessionToken);
            } else {
                result = await setScheduleOffset(controller.address, controller.httpPort, session.sessionToken, offset);
            }
            setStatus(result);
            setOffsetInput(String(result.schedule_offset_minutes));
            setNotice(action === 'phone' ? 'Controller clock synchronized from this phone.'
                : action === 'ntp' ? 'Controller clock synchronized from an NTP server.'
                : 'Aquarium schedule offset saved.');
        } catch (e) {
            setError(e instanceof ControllerApiError ? e.message : e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    if (!controller) return <IonPage><IonContent className="ion-padding">
        <IonText color="danger">Controller context is missing.</IonText>
        <IonButton onClick={() => navigate('/home', { replace: true })}>Go to Home</IonButton>
    </IonContent></IonPage>;

    return <IonPage>
        <IonHeader><IonToolbar>
            <IonButtons slot="start"><IonBackButton defaultHref="/controller-dashboard" /></IonButtons>
            <IonTitle>Time Configuration</IonTitle>
            <IonButtons slot="end"><IonButton fill="clear" aria-label="Refresh time status" onClick={() => void loadStatus()} disabled={loading || busy}><IonIcon icon={refreshOutline} /></IonButton></IonButtons>
        </IonToolbar></IonHeader>
        <IonContent className="prakiva-home ion-padding">
            {loading ? <div className="ion-text-center ion-padding"><IonSpinner name="crescent" /></div> : <>
                <IonCard className="prakiva-card"><IonCardContent>
                    <h2><IonIcon icon={timeOutline} /> Controller clock</h2>
                    <IonList lines="none">
                        <IonItem><IonLabel><p>Current controller time</p><h2>{status?.clock_valid ? formatDate(status.unix_time) : 'Clock not synchronized'}</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>Last synchronization source</p><h2>{sourceLabel(status?.sync_source ?? 'none')}</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>Last successful synchronization</p><h2>{formatDate(status?.last_sync_unix ?? 0)}</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>DS3231 RTC</p><h2>{status?.rtc_available ? 'Detected' : 'Not detected'}</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>Wi-Fi station connection</p><h2>{status?.wifi_sta_connected ? 'Connected' : 'Not connected'}</h2></IonLabel></IonItem>
                    </IonList>
                    {!status?.rtc_available && <IonText color="warning"><p>The RTC is not detected. Phone synchronization can still set the clock, but time may be lost when the controller loses power.</p></IonText>}
                    {!status?.clock_valid && <IonText color="warning"><p>The controller clock is not yet valid. Synchronize it before relying on time-based schedules.</p></IonText>}
                </IonCardContent></IonCard>

                <IonCard className="prakiva-card"><IonCardContent>
                    <h2>Synchronize clock</h2>
                    <p>Phone synchronization uses this phone’s current Unix time. NTP requires a connected Wi-Fi station network.</p>
                    <IonButton expand="block" onClick={() => void perform('phone')} disabled={busy}>
                        {busy ? <IonSpinner name="crescent" /> : 'Sync from phone'}
                    </IonButton>
                    <IonButton expand="block" fill="outline" onClick={() => void perform('ntp')} disabled={busy || !status?.wifi_sta_connected}>
                        Sync from NTP server
                    </IonButton>
                    {!status?.wifi_sta_connected && <IonText color="medium"><p>NTP is available only when the controller is connected to a Wi-Fi network in STA mode.</p></IonText>}
                </IonCardContent></IonCard>

                <IonCard className="prakiva-card"><IonCardContent>
                    <h2>Aquarium schedule time</h2>
                    <p>This signed offset changes the time used by aquarium schedules only. It does not change the controller’s underlying system clock.</p>
                    <IonItem>
                        <IonLabel position="stacked">Offset in minutes (-720 to +720)</IonLabel>
                        <IonInput type="number" inputMode="numeric" value={offsetInput} onIonInput={e => setOffsetInput(e.detail.value ?? '')} />
                    </IonItem>
                    <IonText color="medium"><p>Examples: 330 = UTC+05:30, -300 = UTC−05:00.</p></IonText>
                    <IonButton expand="block" onClick={() => void perform('offset')} disabled={busy}>
                        Save schedule offset
                    </IonButton>
                </IonCardContent></IonCard>
            </>}
            {notice && <IonText color="success"><p>{notice}</p></IonText>}
            {error && <IonText color="danger"><p>{error}</p></IonText>}
        </IonContent>
    </IonPage>;
};

export default TimeConfiguration;
