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
    getTimeStatus, setScheduleOffset,
    syncTimeFromNtp, syncTimeFromPhone, validateOwnerSession,
    type TimeStatus,
} from '../services/controller-api';
import { ControllerSessionStore } from '../services/controller-session-store';
import '../theme/skins/default/styles/pages/Home.css';

interface PageState { controller?: SavedController }

function formatDate(unixSeconds: number): string {
    if (!unixSeconds || !Number.isFinite(unixSeconds)) return 'Not available';
    return new Date(unixSeconds * 1000).toLocaleString();
}

function sourceLabel(source: string): string {
    if (source === 'phone') return 'Phone';
    if (source === 'ntp') return 'Internet time';
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
            console.error('[Prakiva] Could not load controller time settings:', e);
            setError('We couldn’t load the time settings. Check the controller connection and try again.');
        } finally {
            if (showSpinner) setLoading(false);
        }
    }, [controller, navigate]);

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
                : action === 'ntp' ? 'Controller clock synchronized using internet time.'
                : 'Aquarium schedule offset saved.');
        } catch (e) {
            console.error('[Prakiva] Could not update controller time:', e);
            setError('We couldn’t update the controller time. Check the connection and try again.');
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
                        <IonItem><IonLabel><p>Backup clock</p><h2>{status?.rtc_available ? 'Detected' : 'Not detected'}</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>Wi-Fi station connection</p><h2>{status?.wifi_sta_connected ? 'Connected' : 'Not connected'}</h2></IonLabel></IonItem>
                    </IonList>
                    {!status?.rtc_available && <IonText color="warning"><p>The backup clock is unavailable. You can still set the time from your phone, but the clock may need to be set again after a power interruption.</p></IonText>}
                    {!status?.clock_valid && <IonText color="warning"><p>The controller clock is not yet valid. Synchronize it before relying on time-based schedules.</p></IonText>}
                </IonCardContent></IonCard>

                <IonCard className="prakiva-card"><IonCardContent>
                    <h2>Synchronize clock</h2>
                    <p>You can set the controller clock using your phone or the internet. Internet time requires the controller to be connected to your home Wi-Fi.</p>
                    <IonButton expand="block" onClick={() => void perform('phone')} disabled={busy}>
                        {busy ? <IonSpinner name="crescent" /> : 'Sync from phone'}
                    </IonButton>
                    <IonButton expand="block" fill="outline" onClick={() => void perform('ntp')} disabled={busy || !status?.wifi_sta_connected}>
                        Sync from internet
                    </IonButton>
                    {!status?.wifi_sta_connected && <IonText color="medium"><p>Internet time is available when your controller is connected to your home Wi-Fi.</p></IonText>}
                </IonCardContent></IonCard>

                <IonCard className="prakiva-card"><IonCardContent>
                    <h2>Aquarium schedule time</h2>
                    <p>Adjust the time used by your aquarium schedules without changing the controller’s main clock.</p>
                    <IonItem>
                        <IonLabel position="stacked">Time adjustment in minutes (-720 to +720)</IonLabel>
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
