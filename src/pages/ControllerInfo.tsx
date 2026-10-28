import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/react';
import { homeOutline, arrowBackOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';

interface InfoState { controller?: SavedController; deviceInfo?: Record<string, unknown> }

const ControllerInfo: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const state = (location.state as InfoState | null) ?? {};
    const controller = state.controller;
    const deviceInfo = state.deviceInfo ?? {};
    if (!controller) return <IonPage><IonContent className="ion-padding"><p>Controller context is missing.</p><IonButton onClick={() => navigate('/home', { replace: true })}>Go to Home</IonButton></IonContent></IonPage>;
    const fields: Array<[string, unknown]> = [
        ['Controller name', controller.name],
        ['Device ID', controller.deviceId],
        ['Address', `${controller.address}:${controller.httpPort}`],
        ['Product', controller.product],
        ['Hardware family', controller.hardwareFamily],
        ['Firmware version', controller.firmwareVersion],
        ['Protocol version', deviceInfo.protocol_version ?? deviceInfo.protocolVersion ?? 'Not available in saved information'],
    ];
    return <IonPage>
        <IonHeader><IonToolbar>
            <IonButtons slot="start"><IonButton fill="clear" aria-label="Home" onClick={() => navigate('/home')}><IonIcon icon={homeOutline} /></IonButton></IonButtons>
            <IonTitle>Controller Info</IonTitle>
            <IonButtons slot="end"><IonButton fill="clear" aria-label="Back to controller" onClick={() => navigate('/controller-dashboard', { state: { controller } })}><IonIcon icon={arrowBackOutline} /></IonButton></IonButtons>
        </IonToolbar></IonHeader>
        <IonContent className="prakiva-home ion-padding">
            <IonList inset>
                {fields.map(([label, value]) => <IonItem key={label}><IonLabel className="ion-text-wrap"><p>{label}</p><h2>{value == null || value === '' ? 'Not available' : String(value)}</h2></IonLabel></IonItem>)}
            </IonList>
        </IonContent>
    </IonPage>;
};
export default ControllerInfo;
