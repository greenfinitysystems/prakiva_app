import { useEffect, useState } from 'react';
import { IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import { homeOutline, arrowBackOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerSynchronizationStore, type ControllerSynchronizationSnapshot } from '../services/controller-synchronization-store';
interface InfoState { controller?: SavedController }

const ControllerInfo: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const controller = (location.state as InfoState | null)?.controller;
    const deviceId = controller?.deviceId;
    const [snapshot, setSnapshot] = useState<ControllerSynchronizationSnapshot | null>(null);
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
            <IonTitle>Controller Information</IonTitle>
            <IonButtons slot="end"><IonButton fill="clear" aria-label="Home" onClick={() => navigate('/home')}><IonIcon icon={homeOutline} /></IonButton></IonButtons>
        </IonToolbar></IonHeader>
        <IonContent className="prakiva-home ion-padding">
            <IonCard>
                <IonCardHeader><IonCardTitle>Controller</IonCardTitle></IonCardHeader>
                <IonCardContent>
                    <IonList lines="inset">
                        {fields.map(([label, value]) => <IonItem key={label}><IonLabel className="ion-text-wrap"><p>{label}</p><h2>{value == null || value === '' ? 'Not available' : String(value)}</h2></IonLabel></IonItem>)}
                    </IonList>
                    <IonButton expand="block" fill="outline" disabled>Check for Update — Coming soon</IonButton>
                </IonCardContent>
            </IonCard>
        </IonContent>
    </IonPage>;
};
export default ControllerInfo;
