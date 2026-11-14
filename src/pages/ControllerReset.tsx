import { useState } from 'react';
import {
    IonAlert, IonBackButton, IonButton, IonButtons, IonCard, IonCardContent,
    IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage,
    IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import { warningOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { getSetupStatus, resetController } from '../services/controller-api';
import { ControllerSessionStore } from '../services/controller-session-store';
import '../theme/skins/default/styles/pages/Home.css';

interface ResetLocationState { controller?: SavedController }

const ControllerReset: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const controller = (location.state as ResetLocationState | null)?.controller;
    const [pin, setPin] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const performReset = async () => {
        if (!controller) return;
        setWorking(true);
        setError('');
        try {
            // Establish the starting state so an already-unclaimed controller cannot
            // be mistaken for a successful reset if the reset response is lost.
            const before = await getSetupStatus(controller.address, controller.httpPort);
            if (before.device_id !== controller.deviceId) {
                throw new Error('The setup response belongs to a different controller.');
            }
            if (before.setup_state !== 'claimed' || before.setup_required !== false) {
                throw new Error('This controller is not currently claimed. No reset was attempted; return to Controller Details to continue setup.');
            }

            try {
                await resetController(controller.address, controller.httpPort, pin);
            } catch (resetError) {
                // The controller may have reset successfully even if its response was lost.
                // Only report success if a follow-up status request confirms the factory state.
                const status = await getSetupStatus(controller.address, controller.httpPort);
                if (
                    status.device_id !== controller.deviceId ||
                    status.setup_state !== 'unclaimed' ||
                    status.setup_required !== true
                ) {
                    throw resetError;
                }
            }

            await ControllerSessionStore.clear(controller.deviceId);
            setSuccess(true);
            setPin('');
        } catch (e) {
            console.error('[Prakiva] Factory reset could not be confirmed:', e);
            setError('We couldn’t confirm the reset. Reconnect to your controller and check its status before trying again.');
        } finally {
            setWorking(false);
            setConfirmOpen(false);
        }
    };

    if (!controller) {
        return (
            <IonPage>
                <IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons><IonTitle>Reset controller</IonTitle></IonToolbar></IonHeader>
                <IonContent className="ion-padding">
                    <p>Controller details are missing. Return Home and select the controller again.</p>
                    <IonButton expand="block" onClick={() => navigate('/home', { replace: true })}>Go to Home</IonButton>
                </IonContent>
            </IonPage>
        );
    }

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start"><IonBackButton defaultHref="/controller-details" /></IonButtons>
                    <IonTitle>Reset controller</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent className="prakiva-home ion-padding">
                <IonCard className="prakiva-card">
                    <IonCardContent>
                        <div className="prakiva-details-success">
                            <IonIcon icon={warningOutline} color="danger" />
                            <h1>Factory reset</h1>
                        </div>
                        <p className="prakiva-muted">
                            Controller: <strong>{controller.name}</strong>
                        </p>
                        <p>This permanently clears the controller's claim, owner account, and provisioning state. After reset, it will return to the initial setup flow and must be claimed again.</p>
                        <IonItem>
                            <IonLabel position="stacked">Reset PIN (10 digits)</IonLabel>
                            <IonInput
                                type="tel"
                                inputmode="numeric"
                                autocomplete="off"
                                maxlength={10}
                                value={pin}
                                disabled={working || success}
                                placeholder="Enter reset PIN"
                                onIonInput={(event) => setPin((event.detail.value ?? '').replace(/\D/g, '').slice(0, 10))}
                            />
                        </IonItem>
                        {error && <IonText color="danger"><p>{error}</p></IonText>}
                        {success && (
                            <>
                                <IonText color="success"><p>Reset confirmed. The controller is now unclaimed, and its saved session has been cleared from this phone.</p></IonText>
                                <IonButton expand="block" onClick={() => navigate('/controller-details', { replace: true, state: { controller } })}>
                                    Continue to setup
                                </IonButton>
                            </>
                        )}
                        {!success && (
                            <IonButton
                                expand="block"
                                color="danger"
                                disabled={working || pin.length !== 10}
                                onClick={() => setConfirmOpen(true)}
                            >
                                {working ? 'Resetting…' : 'Reset Controller'}
                            </IonButton>
                        )}
                        <IonButton expand="block" fill="clear" color="medium" disabled={working} onClick={() => navigate('/controller-details', { replace: true, state: { controller } })}>
                            Cancel
                        </IonButton>
                    </IonCardContent>
                </IonCard>
            </IonContent>
            <IonAlert
                isOpen={confirmOpen}
                header="Factory reset this controller?"
                message={`This will erase the claim and owner account on ${controller.name}. This action cannot be undone.`}
                buttons={[
                    { text: 'Cancel', role: 'cancel', handler: () => setConfirmOpen(false) },
                    { text: 'Reset permanently', role: 'destructive', handler: () => { void performReset(); } },
                ]}
                onDidDismiss={() => setConfirmOpen(false)}
            />
        </IonPage>
    );
};

export default ControllerReset;
