import { useEffect, useState } from 'react';
import {
    IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader,
    IonIcon, IonItem, IonLabel, IonList, IonPage, IonPopover, IonSpinner,
    IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import { homeOutline, logOutOutline, settingsOutline, informationCircleOutline, timeOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { helloWorld, logoutOwner, validateOwnerSession } from '../services/controller-api';
import { ControllerSessionStore } from '../services/controller-session-store';
import './Home.css';

interface DashboardState { controller?: SavedController }
const ControllerDashboard: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const controller = (location.state as DashboardState | null)?.controller;
    const [checking, setChecking] = useState(true);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [sessionToken, setSessionToken] = useState('');
    const [loggingOut, setLoggingOut] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        if (location.pathname !== '/controller-dashboard') return;
        let active = true;
        const load = async () => {
            if (!controller) { navigate('/home', { replace: true }); return; }
            setChecking(true); setError('');
            try {
                const session = await ControllerSessionStore.load(controller.deviceId);
                if (!session) { navigate('/controller-login', { replace: true, state: { controller } }); return; }
                const valid = await validateOwnerSession(controller.address, controller.httpPort, session.sessionToken);
                if (!active) return;
                if (!valid) {
                    await ControllerSessionStore.clear(controller.deviceId);
                    navigate('/controller-login', { replace: true, state: { controller } });
                    return;
                }
                setSessionToken(session.sessionToken);
                setMessage(await helloWorld(controller.address, controller.httpPort, session.sessionToken));
            } catch (e) {
                if (active) setError(e instanceof Error ? e.message : String(e));
            } finally { if (active) setChecking(false); }
        };
        void load();
        return () => { active = false; };
    }, [location.pathname, controller?.deviceId, controller?.address, controller?.httpPort, navigate]);

    const logout = async () => {
        if (!controller) return;
        setMenuOpen(false); setLoggingOut(true); setError('');
        try {
            if (sessionToken) await logoutOwner(controller.address, controller.httpPort, sessionToken);
        } catch (e) {
            setError(`Controller logout could not be confirmed: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
            await ControllerSessionStore.clear(controller.deviceId);
            navigate('/home', { replace: true });
            setLoggingOut(false);
        }
    };

    if (!controller) return <IonPage><IonContent className="ion-padding"><p>Controller context is missing.</p><IonButton onClick={() => navigate('/home', { replace: true })}>Go to Home</IonButton></IonContent></IonPage>;

    return <IonPage>
        <IonHeader><IonToolbar>
            <IonButtons slot="start"><IonButton fill="clear" aria-label="Home" onClick={() => navigate('/home')}><IonIcon icon={homeOutline} /></IonButton></IonButtons>
            <IonTitle>{controller.name}</IonTitle>
            <IonButtons slot="end"><IonButton id="controller-menu-trigger" fill="clear" aria-label="Controller menu" onClick={() => setMenuOpen(true)}><IonIcon icon={settingsOutline} /></IonButton></IonButtons>
        </IonToolbar></IonHeader>
        <IonPopover trigger="controller-menu-trigger" isOpen={menuOpen} onDidDismiss={() => setMenuOpen(false)} side="bottom" alignment="end">
            <IonList lines="none">
                <IonItem button onClick={() => { setMenuOpen(false); navigate('/wifi-configuration', { state: { controller } }); }}>
                    <IonIcon slot="start" icon={settingsOutline} /><IonLabel>Wi-Fi</IonLabel>
                </IonItem>
                <IonItem button onClick={() => { setMenuOpen(false); navigate('/time-configuration', { state: { controller } }); }}>
                    <IonIcon slot="start" icon={timeOutline} /><IonLabel>Time</IonLabel>
                </IonItem>
                <IonItem button onClick={() => { setMenuOpen(false); navigate('/controller-info', { state: { controller } }); }}>
                    <IonIcon slot="start" icon={informationCircleOutline} /><IonLabel>Info</IonLabel>
                </IonItem>
                <IonItem button disabled={loggingOut} onClick={() => void logout()}>
                    <IonIcon slot="start" icon={logOutOutline} /><IonLabel>{loggingOut ? 'Logging out…' : 'Logout'}</IonLabel>
                </IonItem>
            </IonList>
        </IonPopover>
        <IonContent className="prakiva-home ion-padding">
            <IonCard className="prakiva-card"><IonCardContent>
                <h2>Controller response</h2>
                {checking && <IonSpinner name="crescent" />}
                {message && <IonText color="success"><p>{message}</p></IonText>}
                {error && <IonText color="danger"><p>{error}</p></IonText>}
                <IonItem lines="none"><IonLabel><h2>Operations</h2><p>Sensor readings, lighting, pumps and schedules will appear here.</p></IonLabel></IonItem>
            </IonCardContent></IonCard>
        </IonContent>
    </IonPage>;
};
export default ControllerDashboard;
