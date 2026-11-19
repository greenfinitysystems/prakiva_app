import { useEffect, useState } from 'react';
import { IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonText, IonTitle, IonToolbar, IonSegment, IonSegmentButton, IonAlert, IonSpinner } from '@ionic/react';
import { homeOutline, arrowBackOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerSynchronizationStore, type ControllerSynchronizationSnapshot } from '../services/controller-synchronization-store';
import { ControllerSessionStore } from '../services/controller-session-store';
import { controllerRequest } from '../services/controller-api';
import { synchronizeControllerAfterLogin } from '../services/controller-synchronization';
import { ControlConfigurationStore, isControlConfigurationDocument } from '../services/control-configuration-store';
import { VirtualSensorConfigurationStore } from '../services/virtual-sensor-configuration-store';
import { ActuationMethodStore } from '../services/actuation-method-store';
import { RemoteActuatorConfigurationStore } from '../services/remote-actuator-configuration-store';
import { markConfigurationSynchronized } from '../services/configuration-apply';

interface InfoState { controller?: SavedController }

const ControllerInfo: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const controller = (location.state as InfoState | null)?.controller;
    const deviceId = controller?.deviceId;
    const [snapshot, setSnapshot] = useState<ControllerSynchronizationSnapshot | null>(null);
    const [activeTab, setActiveTab] = useState<'controller' | 'application'>('controller');
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
    const [resetBusy, setResetBusy] = useState(false);
    const [resetError, setResetError] = useState('');
    const [factoryConfirmOpen, setFactoryConfirmOpen] = useState(false);
    const [factoryBusy, setFactoryBusy] = useState(false);
    const [factoryError, setFactoryError] = useState('');
    const [rebootConfirmOpen, setRebootConfirmOpen] = useState(false);
    const [rebootBusy, setRebootBusy] = useState(false);
    const [rebootError, setRebootError] = useState('');

    const rebootController = async () => {
        if (!controller || rebootBusy) return;
        setRebootConfirmOpen(false);
        setRebootError('');
        setRebootBusy(true);
        try {
            const session = await ControllerSessionStore.load(controller.deviceId);
            if (!session?.sessionToken) throw new Error('Sign in to the controller before rebooting.');
            // The controller acknowledges first, then schedules ESP.restart().
            // Never retry an uncertain reboot request automatically.
            await controllerRequest(controller.address, controller.httpPort, 'reboot_controller', {
                session_token: session.sessionToken,
            });
            await ControllerSessionStore.clear(controller.deviceId);
            navigate('/home', { replace: true });
        } catch (error) {
            // A transport failure is ambiguous: reboot may already be underway.
            // Clear the stale session and return to the safe controller selector.
            // Authentication failures are different: keep the user here to show the error.
            const message = error instanceof Error ? error.message : 'Reboot request failed.';
            if (/unauthenticated|invalid session|session expired|401/i.test(message)) {
                setRebootError(message);
            } else {
                try { await ControllerSessionStore.clear(controller.deviceId); } catch { /* best effort */ }
                navigate('/home', { replace: true });
            }
        } finally {
            setRebootBusy(false);
        }
    };

    const factoryResetController = async (confirmation: string) => {
        if (!controller || factoryBusy || confirmation !== 'ERASE EVERYTHING') return;
        setFactoryConfirmOpen(false);
        setFactoryError('');
        setFactoryBusy(true);
        try {
            const session = await ControllerSessionStore.load(controller.deviceId);
            if (!session?.sessionToken) throw new Error('Sign in to the controller before factory reset.');
            // Do not retry a destructive request on transport errors: its outcome may be unknown.
            const response = await controllerRequest(controller.address, controller.httpPort, 'factory_reset_controller', {
                session_token: session.sessionToken,
                confirmation,
            });
            if (response.data?.factory_reset_scheduled !== true && response.data?.reset_scheduled !== true) {
                // A successful API status is the acknowledgement; firmware versions can use
                // different optional data fields. No additional request is made.
                console.info('[Prakiva] Factory reset acknowledged by controller.');
            }
            // The controller is about to erase its credentials and stored configuration.
            // Remove device-scoped app caches; retain the saved controller record for discovery.
            await ControllerSessionStore.clear(controller.deviceId);
            await ControllerSynchronizationStore.clear(controller.deviceId);
            const suffix = controller.deviceId;
            for (let index = localStorage.length - 1; index >= 0; index--) {
                const key = localStorage.key(index);
                if (key && key.startsWith('prakiva.') && key.endsWith(`.${suffix}`)) {
                    localStorage.removeItem(key);
                }
            }
            navigate('/home', { replace: true });
        } catch (error) {
            setFactoryError(error instanceof Error ? error.message : 'Factory reset request failed.');
        } finally {
            setFactoryBusy(false);
        }
    };

    const resetLocalConfiguration = async () => {
        if (!controller || resetBusy) return;
        setResetConfirmOpen(false);
        setResetError('');
        setResetBusy(true);
        try {
            const session = await ControllerSessionStore.load(controller.deviceId);
            if (!session?.sessionToken) throw new Error('Sign in to the controller before resetting local settings.');
            // Obtain a fresh authenticated snapshot before modifying any local settings.
            const fresh = await synchronizeControllerAfterLogin(controller, session.sessionToken);
            const config = fresh.configuration.configuration;
            const appDocument = config?.app_configuration;
            if (!fresh.configuration.configuration_exists || !isControlConfigurationDocument(appDocument)) {
                throw new Error('The controller has no valid saved application configuration. Local settings were preserved.');
            }
            ControlConfigurationStore.replaceWithControllerDocument(appDocument);
            VirtualSensorConfigurationStore.replaceFromController(controller.deviceId, config?.virtual_sensors);
            ActuationMethodStore.replaceFromController(controller.deviceId, config?.actuator_channels);
            RemoteActuatorConfigurationStore.replaceFromController(controller.deviceId, config?.remote_actuators);
            const timestamp = fresh.configuration.configuration_timestamp;
            const iso = typeof timestamp === 'number' && timestamp > 0
                ? new Date(timestamp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
            markConfigurationSynchronized(controller.deviceId, iso);
            setSnapshot(fresh);
            navigate('/controller-dashboard', { replace: true, state: { controller } });
        } catch (error) {
            setResetError(error instanceof Error ? error.message : 'Could not synchronize with controller. Local settings were preserved.');
        } finally {
            setResetBusy(false);
        }
    };

    useEffect(() => {
        let active = true;
        if (deviceId) {
            void ControllerSynchronizationStore.load(deviceId).then(value => {
                if (active) setSnapshot(value);
            }).catch(error => console.error('[Prakiva] Could not load controller information:', error));
        }
        return () => { active = false; };
    }, [deviceId]);

    if (!controller) return <IonPage><IonContent className="ion-padding"><p>Controller details are unavailable. Return to Home and select your controller again.</p><IonButton onClick={() => navigate('/home', { replace: true })}>Go to Home</IonButton></IonContent></IonPage>;

    const fields: Array<[string, unknown]> = [
        ['Controller name', controller.name],
        ['Product', snapshot?.capabilities.controller.product ?? controller.product],
        ['Firmware version', snapshot?.capabilities.controller.firmware_version ?? controller.firmwareVersion],
        ['Hardware family', controller.hardwareFamily],
        ['API protocol version', controller.protocolVersion],
        ['Settings saved', snapshot ? (snapshot.configuration.configuration_exists ? 'Yes' : 'Not yet') : 'Sign in to check'],
        ['Device ID', controller.deviceId],
        ['IP address', controller.address],
        ['MAC address', 'Not published by controller firmware'],
    ];

    return <IonPage>
        <IonHeader><IonToolbar>
            <IonButtons slot="start"><IonButton fill="clear" aria-label="Back to controller" onClick={() => navigate('/controller-dashboard', { state: { controller } })}><IonIcon icon={arrowBackOutline} /></IonButton></IonButtons>
            <IonTitle>About</IonTitle>
            <IonButtons slot="end"><IonButton fill="clear" aria-label="Home" onClick={() => navigate('/home')}><IonIcon icon={homeOutline} /></IonButton></IonButtons>
        </IonToolbar></IonHeader>
        <IonContent className="prakiva-home ion-padding">
            <IonSegment value={activeTab} onIonChange={event => {
                const value = event.detail.value;
                if (value === 'controller' || value === 'application') setActiveTab(value);
            }}>
                <IonSegmentButton value="controller"><IonLabel>Controller</IonLabel></IonSegmentButton>
                <IonSegmentButton value="application"><IonLabel>Application</IonLabel></IonSegmentButton>
            </IonSegment>
            {activeTab === 'controller' && <IonCard>
                <IonCardHeader><IonCardTitle>Controller</IonCardTitle></IonCardHeader>
                <IonCardContent>
                    <IonList lines="inset">
                        {fields.map(([label, value]) => <IonItem key={label}><IonLabel className="ion-text-wrap"><p>{label}</p><h2>{value == null || value === '' ? 'Not available' : String(value)}</h2></IonLabel></IonItem>)}
                    </IonList>
                    <IonButton expand="block" fill="outline" disabled={rebootBusy} onClick={() => setRebootConfirmOpen(true)}>{rebootBusy ? <><IonSpinner name="crescent" /> Rebooting…</> : "Reboot"}</IonButton>
                    {rebootError && <IonText color="danger"><p role="alert">{rebootError}</p></IonText>}
                    <IonButton expand="block" fill="outline" disabled>Check for Update — Coming soon</IonButton>
                    <IonButton expand="block" fill="outline" color="danger" disabled={factoryBusy} onClick={() => { setFactoryError(''); setFactoryConfirmOpen(true); }}>{factoryBusy ? <><IonSpinner name="crescent" /> Resetting…</> : "Factory Reset"}</IonButton>
                    {factoryError && <IonText color="danger"><p role="alert">{factoryError}</p></IonText>}
                </IonCardContent>
            </IonCard>}
            {activeTab === 'application' && <IonCard>
                <IonCardHeader><IonCardTitle>Application</IonCardTitle></IonCardHeader>
                <IonCardContent>
                    <IonList lines="inset">
                        <IonItem><IonLabel><p>Application</p><h2>PRAKIVA</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>App version</p><h2>Not available in this source build</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>Platform</p><h2>Ionic / Capacitor</h2></IonLabel></IonItem>
                    </IonList>
                    <IonButton expand="block" fill="outline" disabled={resetBusy} onClick={() => setResetConfirmOpen(true)}>{resetBusy ? <><IonSpinner name="crescent" /> Synchronizing…</> : "Reset Local Configuration"}</IonButton>
                    {resetError && <IonText color="danger"><p role="alert">{resetError}</p></IonText>}
                    <IonText color="medium"><p>Local reset will clear the app's cached configuration and resynchronize with the controller. It will not factory-reset the controller.</p></IonText>
                </IonCardContent>
            </IonCard>}
            <IonAlert isOpen={rebootConfirmOpen} onDidDismiss={() => setRebootConfirmOpen(false)}
                header="Reboot controller?"
                message="The controller will restart and its current session will expire. You will return to the controller selection screen and must sign in again after the controller reconnects."
                buttons={[{ text: 'Cancel', role: 'cancel' }, { text: 'Reboot', role: 'destructive', handler: () => { void rebootController(); } }]} />
            <IonAlert isOpen={factoryConfirmOpen} onDidDismiss={() => setFactoryConfirmOpen(false)}
                header="Factory Reset — Erase Everything"
                message="This permanently erases ownership, Wi-Fi, configuration, schedules, calibration and history from the controller. It will reboot unclaimed. Enter ERASE EVERYTHING exactly to continue."
                inputs={[{ name: 'confirmation', type: 'text', placeholder: 'ERASE EVERYTHING', attributes: { autoCapitalize: 'characters', autoComplete: 'off' } }]}
                buttons={[{ text: 'Cancel', role: 'cancel' }, {
                    text: 'Erase Everything', role: 'destructive',
                    handler: (values: { confirmation?: string }) => {
                        if (values?.confirmation !== 'ERASE EVERYTHING') {
                            setFactoryError('Confirmation must be exactly ERASE EVERYTHING.');
                            return false;
                        }
                        void factoryResetController(values.confirmation);
                    },
                }]} />
            <IonAlert isOpen={resetConfirmOpen} onDidDismiss={() => setResetConfirmOpen(false)}
                header="Reset local configuration?"
                message="Discard this controller's local control, sensor and transport settings and replace them with a fresh copy from the controller? This will not change the controller. If the controller cannot be reached, local settings will be retained."
                buttons={[{ text: 'Cancel', role: 'cancel' }, { text: 'Reset and synchronize', role: 'destructive', handler: () => { void resetLocalConfiguration(); } }]} />
        </IonContent>
    </IonPage>;
};
export default ControllerInfo;
