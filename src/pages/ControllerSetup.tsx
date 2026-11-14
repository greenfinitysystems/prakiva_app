import { useEffect, useState } from 'react';
import {
    IonBackButton, IonButton, IonButtons, IonCard, IonCardContent,
    IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonPage,
    IonSpinner, IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import { checkmarkCircleOutline, hardwareChipOutline, shieldCheckmarkOutline, wifiOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { getSetupStatus } from '../services/controller-api';
import '../theme/skins/default/styles/pages/Home.css';

interface SetupLocationState { controller?: SavedController }
interface SetupStatus { device_id?: string; setup_state?: string; setup_required?: boolean }

const ControllerSetup: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const state = (location.state as SetupLocationState | null) ?? {};
    const controller = state.controller;
    const [status, setStatus] = useState<SetupStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        const checkStatus = async () => {
            if (!controller) { setLoading(false); setError('Controller details are missing. Return to your controller list and connect again.'); return; }
            setLoading(true);
            setError('');
            try {
                const result = await getSetupStatus(controller.address, controller.httpPort);
                if (!active) return;
                if (result.device_id !== controller.deviceId) throw new Error('The setup response belongs to a different controller.');
                setStatus(result as SetupStatus);
            } catch (err: unknown) {
                if (active) { console.error('[Prakiva] Could not check controller setup:', err); setError('We couldn’t check your controller. Check the connection and try again.'); }
            } finally { if (active) setLoading(false); }
        };
        void checkStatus();
        return () => { active = false; };
    }, [controller]);

    const beginClaim = () => {
        if (!controller) return;
        navigate('/controller-claim', { state: { controller } });
    };

    return (
        <IonPage>
            <IonHeader><IonToolbar>
                <IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons>
                <IonTitle>Controller setup</IonTitle>
            </IonToolbar></IonHeader>
            <IonContent className="prakiva-home ion-padding">
                <div className="prakiva-setup-hero">
                    <IonIcon icon={hardwareChipOutline} />
                    <p className="prakiva-setup-eyebrow">WELCOME TO PRAKIVA</p>
                    <h1>Let's set up your controller.</h1>
                    <p className="prakiva-muted">{controller ? controller.name : 'Your Prakiva controller'} is connected. We’ll guide you through securing ownership and configuring its network.</p>
                </div>

                <IonCard className="prakiva-card"><IonCardContent>
                    <h2 className="prakiva-subheading">Your setup journey</h2>
                    <IonItem lines="none" className="prakiva-setup-step">
                        <IonIcon slot="start" icon={shieldCheckmarkOutline} color="primary" />
                        <IonLabel className="ion-text-wrap"><h3>1. Secure your controller</h3><p>Create the owner account used to access this controller.</p></IonLabel>
                    </IonItem>
                    <IonItem lines="none" className="prakiva-setup-step">
                        <IonIcon slot="start" icon={wifiOutline} color="primary" />
                        <IonLabel className="ion-text-wrap"><h3>2. Configure connectivity</h3><p>Set up the network connection for everyday use.</p></IonLabel>
                    </IonItem>
                    <IonItem lines="none" className="prakiva-setup-step">
                        <IonIcon slot="start" icon={checkmarkCircleOutline} color="primary" />
                        <IonLabel className="ion-text-wrap"><h3>3. Finish setup</h3><p>Verify the configuration and open your controller dashboard.</p></IonLabel>
                    </IonItem>

                    {loading && <div className="prakiva-loading"><IonSpinner name="crescent" /><p className="prakiva-muted">Checking controller setup status…</p></div>}
                    {!loading && error && <IonText color="danger"><p>{error}</p></IonText>}
                    {!loading && status?.setup_state === 'claimed' && <IonText color="success"><p>This controller is already claimed. Continue to sign-in rather than claiming it again.</p></IonText>}
                    {!loading && status?.setup_state === 'unclaimed' && status.setup_required === true && <p className="prakiva-setup-status"><IonIcon icon={checkmarkCircleOutline} /> Controller verified · Initial setup required</p>}
                    {!loading && status && status.setup_state !== 'unclaimed' && status.setup_state !== 'claimed' && <IonText color="danger"><p>We couldn’t confirm the controller’s setup status. Please reconnect and try again.</p></IonText>}

                    <IonButton expand="block" onClick={beginClaim} disabled={loading || !!error || !controller || status?.setup_state !== 'unclaimed' || status.setup_required !== true}>
                        Begin owner setup
                    </IonButton>
                    <IonButton expand="block" fill="clear" color="medium" onClick={() => navigate('/home', { replace: true })}>Not now</IonButton>
                    <p className="prakiva-muted prakiva-setup-footnote">Controller: {controller?.deviceId ?? 'Unavailable'}</p>
                </IonCardContent></IonCard>
            </IonContent>
        </IonPage>
    );
};

export default ControllerSetup;
