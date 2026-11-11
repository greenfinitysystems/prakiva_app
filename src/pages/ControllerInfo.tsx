import { useEffect, useState } from 'react';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonText, IonTitle, IonToolbar } from '@ionic/react';
import { homeOutline, arrowBackOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerSynchronizationStore, type ControllerSynchronizationSnapshot } from '../services/controller-synchronization-store';

interface InfoState { controller?: SavedController }

const ControllerInfo: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const controller = (location.state as InfoState | null)?.controller;
    const [snapshot, setSnapshot] = useState<ControllerSynchronizationSnapshot | null>(null);

    useEffect(() => {
        let active = true;
        if (controller) {
            void ControllerSynchronizationStore.load(controller.deviceId).then(value => {
                if (active) setSnapshot(value);
            }).catch(error => console.error('[Prakiva] Could not load controller information:', error));
        }
        return () => { active = false; };
    }, [controller?.deviceId]);

    if (!controller) return <IonPage><IonContent className="ion-padding"><p>Controller details are unavailable. Return to Home and select your controller again.</p><IonButton onClick={() => navigate('/home', { replace: true })}>Go to Home</IonButton></IonContent></IonPage>;

    const fields: Array<[string, unknown]> = [
        ['Controller name', controller.name],
        ['Product', snapshot?.capabilities.controller.product ?? controller.product],
        ['Software version', snapshot?.capabilities.controller.firmware_version ?? controller.firmwareVersion],
        ['Settings saved', snapshot ? (snapshot.configuration.configuration_exists ? 'Yes' : 'Not yet') : 'Sign in to check'],
        ['Device ID', controller.deviceId],
    ];

    return <IonPage>
        <IonHeader><IonToolbar>
            <IonButtons slot="start"><IonButton fill="clear" aria-label="Back to controller" onClick={() => navigate('/controller-dashboard', { state: { controller } })}><IonIcon icon={arrowBackOutline} /></IonButton></IonButtons>
            <IonTitle>About your controller</IonTitle>
            <IonButtons slot="end"><IonButton fill="clear" aria-label="Home" onClick={() => navigate('/home')}><IonIcon icon={homeOutline} /></IonButton></IonButtons>
        </IonToolbar></IonHeader>
        <IonContent className="prakiva-home ion-padding">
            <IonList inset>
                {fields.map(([label, value]) => <IonItem key={label}><IonLabel className="ion-text-wrap"><p>{label}</p><h2>{value == null || value === '' ? 'Not available' : String(value)}</h2></IonLabel></IonItem>)}
            </IonList>
            <IonText color="medium"><p className="ion-padding-start">Keep the device ID handy if you need help with your controller.</p></IonText>
        </IonContent>
    </IonPage>;
};
export default ControllerInfo;
