import { useCallback, useEffect, useState } from 'react';
import {
    IonAlert, IonButton, IonCard, IonCardContent, IonContent, IonHeader,
    IonIcon, IonItem, IonLabel, IonList, IonPage, IonSpinner, IonText,
    IonTitle, IonToolbar, IonPopover, useIonViewWillEnter,
} from '@ionic/react';
import {
    add, settingsOutline, hardwareChipOutline, trashOutline, logOutOutline,
} from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerStore } from '../services/controller-store';
import { getDeviceInfo, validateOwnerSession } from '../services/controller-api';
import { ControllerSessionStore } from '../services/controller-session-store';
import '../theme/skins/default/styles/pages/Home.css';

import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

type AuthState = 'checking' | 'ready' | 'action';

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
        promise,
        new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('Controller request timed out')), ms)),
    ]);

const Home: React.FC = () => {
    const navigate = useNavigate();
    const [controllers, setControllers] = useState<SavedController[]>([]);
    const [authState, setAuthState] = useState<Record<string, AuthState>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [removeTarget, setRemoveTarget] = useState<SavedController | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
    const [settingsMenuEvent, setSettingsMenuEvent] = useState<Event | undefined>();
    const [exitAlertOpen, setExitAlertOpen] = useState(false);

    const isAndroid = Capacitor.getPlatform() === 'android';

    const refreshStatus = useCallback(async (saved: SavedController[]) => {
        // Status is deliberately independent from the saved list. A network outage must
        // never hide a controller or keep the Home page in its loading state.
        for (const controller of saved) {
            setAuthState(previous => ({ ...previous, [controller.deviceId]: 'checking' }));
            let status: AuthState = 'action';
            try {
                const session = await withTimeout(ControllerSessionStore.load(controller.deviceId), 2500);
                if (session) {
                    const info = await withTimeout(getDeviceInfo(controller.address, controller.httpPort), 3500);
                    if (info.device_id === controller.deviceId) {
                        const valid = await withTimeout(
                            validateOwnerSession(controller.address, controller.httpPort, session.sessionToken), 3500,
                        );
                        status = valid ? 'ready' : 'action';
                        if (!valid) await ControllerSessionStore.clear(controller.deviceId);
                    }
                }
            } catch {
                status = 'action';
            }
            setAuthState(previous => ({ ...previous, [controller.deviceId]: status }));
        }
    }, []);

    const loadControllers = useCallback(async () => {
        setError(null);
        setLoading(true);
        try {
            const saved = await ControllerStore.loadAll();
            setControllers(saved);
            setAuthState(previous => {
                const next = { ...previous };
                for (const controller of saved) next[controller.deviceId] ??= 'checking';
                return next;
            });
            setLoading(false);
            void refreshStatus(saved);
        } catch (err) {
            console.error('[Prakiva] Could not load saved controllers:', err);
            setError('We couldn’t load your saved controllers. Please close and reopen the app.');
            setLoading(false);
        }
    }, [refreshStatus]);

    useEffect(() => { void loadControllers(); }, [loadControllers]);
    useIonViewWillEnter(() => { void loadControllers(); }, [loadControllers]);

    const connect = async (controller: SavedController) => {
        setBusyId(controller.deviceId);
        try {
            const data = await withTimeout(getDeviceInfo(controller.address, controller.httpPort), 4000);
            if (data.device_id !== controller.deviceId) throw new Error('The device at this address has a different permanent identity.');
            const session = await ControllerSessionStore.load(controller.deviceId);
            if (session) {
                try {
                    const valid = await withTimeout(validateOwnerSession(controller.address, controller.httpPort, session.sessionToken), 3500);
                    if (valid) {
                        navigate('/controller-dashboard', { state: { controller } });
                        return;
                    }
                    await ControllerSessionStore.clear(controller.deviceId);
                } catch {
                    // Keep the saved controller. On click, offer discovery/recovery for reachability.
                }
            }
            navigate('/controller-details', { state: { controller, deviceInfo: data } });
        } catch {
            // A failed connection never deletes the saved controller.
            navigate('/discovery', { state: { targetDeviceId: controller.deviceId } });
        } finally { setBusyId(null); }
    };

    const remove = async () => {
        if (!removeTarget) return;
        try { await ControllerStore.remove(removeTarget.deviceId); await loadControllers(); }
        catch (err) { console.error('[Prakiva] Could not remove controller:', err); setError('We couldn’t remove this controller. Please try again.'); }
        finally { setRemoveTarget(null); }
    };

    const exitApplication = async () => {
        if (!isAndroid) return;

        try {
            await CapacitorApp.exitApp();
        } catch (err) {
            console.error('[Prakiva] Could not close the app:', err);
            setError('The app could not be closed. You can close it from your device.');
        }
    };

    return (
        <IonPage>
            <IonHeader><IonToolbar>
                <IonTitle className="prakiva-toolbar-title">Prakiva</IonTitle>
                <IonButton
                    slot="end"
                    fill="clear"
                    color="medium"
                    aria-label="Application menu"
                    aria-haspopup="dialog"
                    onClick={event => {
                        setSettingsMenuEvent(event.nativeEvent);
                        setSettingsMenuOpen(true);
                    }}
                >
                    <IonIcon icon={settingsOutline} />
                </IonButton>
            </IonToolbar></IonHeader>
            <IonContent fullscreen className="prakiva-home ion-padding">
                <section className="prakiva-hero">
                    <img
                        src="/assets/prakiva_logo.png"
                        alt="Prakiva"
                        className="prakiva-home-logo"
                    />
                    <h1>Your world, in balance.</h1>
                    <p>Connect with your world through intelligent control.</p>
                </section>
                <p className="prakiva-controller-summary">Controllers · {controllers.length} saved</p>

                {loading && <div className="prakiva-loading"><IonSpinner name="crescent" /></div>}
                {error && <IonText color="danger"><p>{error}</p></IonText>}
                {!loading && !error && controllers.length === 0 && (
                    <IonCard className="prakiva-card"><IonCardContent>
                        <IonItem lines="none" className="prakiva-empty">
                            <IonIcon slot="start" icon={hardwareChipOutline} color="medium" />
                            <IonLabel className="ion-text-wrap"><h3>No saved controllers</h3><p>Add a controller to discover and save it on this phone.</p></IonLabel>
                        </IonItem>
                        <IonButton expand="block" onClick={() => navigate('/discovery')}><IonIcon slot="start" icon={add} />Add controller</IonButton>
                    </IonCardContent></IonCard>
                )}
                {controllers.length > 0 && (
                    <IonList className="prakiva-controller-list">
                        {controllers.map(controller => {
                            const status = authState[controller.deviceId] ?? 'checking';
                            return <IonItem key={controller.deviceId} button detail onClick={() => void connect(controller)} className="prakiva-controller-item">
                                <span slot="start"
                                    className={`prakiva-controller-status ${status === 'ready' ? 'is-ready' : status === 'checking' ? 'is-checking' : 'needs-action'}`}
                                    role="img"
                                    aria-label={status === 'ready' ? 'Authenticated and ready' : status === 'checking' ? 'Checking status' : 'Login or connection attention required'}
                                    title={status === 'ready' ? 'Good to go' : status === 'checking' ? 'Checking status' : 'Login or connection attention required'} />
                                <IonIcon slot="start" icon={hardwareChipOutline} color="primary" />
                                <IonLabel className="ion-text-wrap">
                                    <h2>{controller.name}</h2>
                                    <p>{controller.product} · {controller.hardwareFamily}</p>
                                    <p>{controller.address}:{controller.httpPort}</p>
                                    <p>Software version {controller.firmwareVersion}</p>
                                    {busyId === controller.deviceId && <p>Connecting…</p>}
                                </IonLabel>
                                <IonButton slot="end" fill="clear" color="medium" aria-label={`Remove ${controller.name}`}
                                    onClick={event => { event.stopPropagation(); setRemoveTarget(controller); }}>
                                    <IonIcon icon={trashOutline} />
                                </IonButton>
                            </IonItem>;
                        })}
                    </IonList>
                )}
                {controllers.length > 0 && <IonButton expand="block" onClick={() => navigate('/discovery')}><IonIcon slot="start" icon={add} />Add controller</IonButton>}
                <p className="prakiva-footer">Designed for connected environments.</p>
            </IonContent>
            <IonAlert isOpen={removeTarget !== null} header="Remove controller?"
                message={removeTarget ? `Remove “${removeTarget.name}” from this phone? Your controller and its settings will not be changed.` : ''}
                buttons={[{ text: 'Cancel', role: 'cancel', handler: () => setRemoveTarget(null) }, { text: 'Remove', role: 'destructive', handler: () => { void remove(); } }]}
                onDidDismiss={() => setRemoveTarget(null)} />

            <IonPopover
                isOpen={settingsMenuOpen}
                event={settingsMenuEvent}
                onDidDismiss={() => setSettingsMenuOpen(false)}
            >
                <IonList>
                    <IonItem
                        button
                        detail={false}
                        onClick={() => {
                            setSettingsMenuOpen(false);
                            navigate('/settings');
                        }}
                    >
                        <IonIcon slot="start" icon={settingsOutline} />
                        <IonLabel>Themes</IonLabel>
                    </IonItem>

                    {isAndroid && (
                        <IonItem
                            button
                            detail={false}
                            lines="none"
                            color="danger"
                            onClick={() => {
                                setSettingsMenuOpen(false);
                                setExitAlertOpen(true);
                            }}
                        >
                            <IonIcon slot="start" icon={logOutOutline} />
                            <IonLabel>Exit Application</IonLabel>
                        </IonItem>
                    )}
                </IonList>
            </IonPopover>

            <IonAlert
                isOpen={exitAlertOpen}
                header="Exit Prakiva?"
                message="Are you sure you want to exit the application?"
                buttons={[
                    {
                        text: 'Cancel',
                        role: 'cancel',
                    },
                    {
                        text: 'Exit',
                        role: 'destructive',
                        handler: () => {
                            void exitApplication();
                        },
                    },
                ]}
                onDidDismiss={() => setExitAlertOpen(false)}
            />

        </IonPage>
    );
};
export default Home;
