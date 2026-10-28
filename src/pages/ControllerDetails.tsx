import { useEffect, useState } from 'react';
import {
    IonBackButton, IonButton, IonButtons, IonCard, IonCardContent,
    IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList,
    IonPage, IonSpinner, IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import { checkmarkCircleOutline, hardwareChipOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { getSetupStatus } from '../services/controller-api';
import './Home.css';

interface DetailsState {
    controller?: SavedController;
    deviceInfo?: Record<string, unknown>;
}

interface SetupStatus {
    device_id?: string;
    setup_state?: string;
    setup_required?: boolean;
}

const ControllerDetails: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const state = (location.state as DetailsState | null) ?? {};
    const controller = state.controller;
    const info = state.deviceInfo ?? {};

    const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
    const [setupError, setSetupError] = useState('');
    const [setupLoading, setSetupLoading] = useState(true);

    useEffect(() => {
        let active = true;

        const checkSetupStatus = async () => {
            if (!controller) {
                setSetupLoading(false);
                return;
            }

            setSetupLoading(true);
            setSetupError('');
            setSetupStatus(null);

            try {
                const result = await getSetupStatus(
                    controller.address,
                    controller.httpPort,
                );

                if (!active) return;

                if (result.device_id !== controller.deviceId) {
                    throw new Error(
                        'The setup response belongs to a different controller.',
                    );
                }

                setSetupStatus(result as SetupStatus);
            } catch (error: unknown) {
                if (active) {
                    setSetupError(
                        error instanceof Error ? error.message : String(error),
                    );
                }
            } finally {
                if (active) setSetupLoading(false);
            }
        };

        void checkSetupStatus();

        return () => {
            active = false;
        };
    }, [controller?.deviceId, controller?.address, controller?.httpPort]);

    const openNextStep = () => {
        if (!controller || !setupStatus) return;

        if (
            setupStatus.setup_state === 'unclaimed' &&
            setupStatus.setup_required === true
        ) {
            navigate('/controller-setup', { state: { controller } });
            return;
        }

        if (
            setupStatus.setup_state === 'claimed' &&
            setupStatus.setup_required === false
        ) {
            navigate('/controller-login', { state: { controller } });
            return;
        }

        setSetupError(
            'The controller returned an unrecognized setup state. Please check the firmware response.',
        );
    };

    if (!controller) {
        return (
            <IonPage>
                <IonHeader>
                    <IonToolbar>
                        <IonButtons slot="start">
                            <IonBackButton defaultHref="/home" />
                        </IonButtons>
                        <IonTitle>Controller details</IonTitle>
                    </IonToolbar>
                </IonHeader>
                <IonContent className="ion-padding">
                    <p>Controller details are not available. Return to your controllers and reconnect.</p>
                    <IonButton
                        expand="block"
                        onClick={() => navigate('/home', { replace: true })}
                    >
                        Go to Home
                    </IonButton>
                </IonContent>
            </IonPage>
        );
    }

    const details = {
        device_id: controller.deviceId,
        product: controller.product,
        firmware_version: controller.firmwareVersion,
        hardware_family: controller.hardwareFamily,
        protocol_version: controller.protocolVersion,
        ...info,
    };

    const actionLabel =
        setupStatus?.setup_state === 'claimed' &&
        setupStatus.setup_required === false
            ? 'Login'
            : 'Begin Setup';

    const knownStatus =
        (setupStatus?.setup_state === 'unclaimed' &&
            setupStatus.setup_required === true) ||
        (setupStatus?.setup_state === 'claimed' &&
            setupStatus.setup_required === false);

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/home" />
                    </IonButtons>
                    <IonTitle>Controller details</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent className="prakiva-home ion-padding">
                <IonCard className="prakiva-card">
                    <IonCardContent>
                        <div className="prakiva-details-success">
                            <IonIcon icon={checkmarkCircleOutline} />
                            <h1>Controller saved</h1>
                        </div>

                        <IonList lines="none">
                            <IonItem>
                                <IonIcon slot="start" icon={hardwareChipOutline} color="primary" />
                                <IonLabel>
                                    <p>Name</p>
                                    <h2>{controller.name}</h2>
                                </IonLabel>
                            </IonItem>
                            <IonItem>
                                <IonLabel className="ion-text-wrap">
                                    <p>Permanent device ID</p>
                                    <h3>{controller.deviceId}</h3>
                                </IonLabel>
                            </IonItem>
                            <IonItem>
                                <IonLabel>
                                    <p>Network address</p>
                                    <h3>{controller.address}:{controller.httpPort}</h3>
                                </IonLabel>
                            </IonItem>
                        </IonList>

                        <h2 className="prakiva-subheading">Device information</h2>
                        <pre className="prakiva-json">{JSON.stringify(details, null, 2)}</pre>

                        <h2 className="prakiva-subheading">Controller status</h2>
                        {setupLoading && (
                            <div className="prakiva-loading">
                                <IonSpinner name="crescent" />
                                <p className="prakiva-muted">Checking controller setup status…</p>
                            </div>
                        )}
                        {!setupLoading && setupError && (
                            <IonText color="danger"><p>{setupError}</p></IonText>
                        )}
                        {!setupLoading && !setupError && setupStatus && (
                            <p className="prakiva-muted">
                                {setupStatus.setup_state === 'claimed'
                                    ? 'Controller is claimed. Sign in to continue.'
                                    : setupStatus.setup_state === 'unclaimed'
                                        ? 'Controller has not been claimed. Initial setup is required.'
                                        : 'Controller status is unknown.'}
                            </p>
                        )}

                        <p className="prakiva-muted">
                            The controller is saved locally on this phone. Its permanent device ID is its identity; the IP address is only the last known network address. Login credentials are not stored.
                        </p>

                        <IonButton
                            expand="block"
                            onClick={openNextStep}
                            disabled={setupLoading || !!setupError || !knownStatus}
                        >
                            {setupLoading ? 'Checking controller…' : actionLabel}
                        </IonButton>

                        <IonButton
                            expand="block"
                            color="danger"
                            fill="outline"
                            onClick={() => navigate('/controller-reset', { state: { controller } })}
                        >
                            Reset Controller
                        </IonButton>

                        <IonButton
                            expand="block"
                            fill="clear"
                            color="medium"
                            onClick={() => navigate('/home', {
                                replace: true,
                                state: { refresh: Date.now() },
                            })}
                        >
                            Done
                        </IonButton>
                    </IonCardContent>
                </IonCard>
            </IonContent>
        </IonPage>
    );
};

export default ControllerDetails;
