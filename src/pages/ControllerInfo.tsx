import { useEffect, useState } from 'react';
import { IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonText, IonTitle, IonToolbar, IonSegment, IonSegmentButton, IonAlert, IonSpinner } from '@ionic/react';
import { homeOutline, arrowBackOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerSynchronizationStore, type ControllerSynchronizationSnapshot } from '../services/controller-synchronization-store';
import { ControllerSessionStore } from '../services/controller-session-store';
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
                    <IonButton expand="block" fill="outline" disabled>Check for Update — Coming soon</IonButton>
                </IonCardContent>
            </IonCard>}
            {activeTab === 'application' && <IonCard>
                <IonCardHeader><IonCardTitle>Application</IonCardTitle></IonCardHeader>
                <IonCardContent>
                    <IonList lines="inset">
                        <IonItem><IonLabel><p>Application</p><h2>PRAKIVA</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>App version</p><h2>0.1.0</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>Platform</p><h2>Ionic / Capacitor</h2></IonLabel></IonItem>
                    </IonList>
                    <IonButton expand="block" fill="outline" disabled={resetBusy} onClick={() => setResetConfirmOpen(true)}>{resetBusy ? <><IonSpinner name="crescent" /> Synchronizing…</> : "Reset Local Configuration"}</IonButton>
                    {resetError && <IonText color="danger"><p role="alert">{resetError}</p></IonText>}
                    <IonText color="medium"><p>Local reset will clear the app's cached configuration and resynchronize with the controller. It will not factory-reset the controller.</p></IonText>
                </IonCardContent>
            </IonCard>}
            <IonAlert isOpen={resetConfirmOpen} onDidDismiss={() => setResetConfirmOpen(false)}
                header="Reset local configuration?"
                message="Discard this controller's local control, sensor and transport settings and replace them with a fresh copy from the controller? This will not change the controller. If the controller cannot be reached, local settings will be retained."
                buttons={[{ text: 'Cancel', role: 'cancel' }, { text: 'Reset and synchronize', role: 'destructive', handler: () => { void resetLocalConfiguration(); } }]} />
        </IonContent>
    </IonPage>;
};
export default ControllerInfo;
