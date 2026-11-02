import { IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonPage, IonText, IonTitle, IonToolbar } from '@ionic/react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import './Home.css';
import { claimController } from '../services/controller-api';

interface ClaimLocationState { controller?: SavedController }

const ControllerClaim: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const controller = (location.state as ClaimLocationState | null)?.controller;
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [resetPin, setResetPin] = useState('');
    const [confirmResetPin, setConfirmResetPin] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [claimed, setClaimed] = useState(false);

    const validate = async () => {
        setMessage('');

        const trimmedUserId = userId.trim();

        // Match the firmware's owner ID rules.
        if (!/^[A-Za-z0-9._-]{3,32}$/.test(trimmedUserId)) {
            setMessage(
                'User ID must be 3–32 characters using letters, numbers, dots, underscores or hyphens.',
            );
            return;
        }

        if (password.length < 8 || password.length > 64) {
            setMessage('Password must be between 8 and 64 characters.');
            return;
        }

        if (password !== confirmPassword) {
            setMessage('The passwords do not match.');
            return;
        }

        if (!/^\d{10}$/.test(resetPin)) {
            setMessage('Reset PIN must contain exactly 10 digits.');
            return;
        }

        if (resetPin !== confirmResetPin) {
            setMessage('The reset PINs do not match.');
            return;
        }

        if (!controller) return;

        setSubmitting(true);

        try {
            const result = await claimController(
                controller.address,
                controller.httpPort,
                trimmedUserId,
                password,
                resetPin,
            );

            if (
                result.device_id !== controller.deviceId ||
                result.setup_state !== 'claimed' ||
                result.setup_required !== false
            ) {
                throw new Error(
                    'The controller response did not confirm a successful claim.',
                );
            }

            setClaimed(true);
            setMessage(
                `Controller successfully claimed by ${trimmedUserId}.`,
            );

            // Do not retain the password in the form after success.
            setPassword('');
            setConfirmPassword('');
            setResetPin('');
            setConfirmResetPin('');
        } catch (error: unknown) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : String(error),
            );
        } finally {
            setSubmitting(false);
        }
    };

    if (!controller) {
        return (
            <IonPage>
                <IonHeader>
                    <IonToolbar>
                        <IonButtons slot="start">
                            <IonBackButton defaultHref="/home" />
                        </IonButtons>
                        <IonTitle>Owner account</IonTitle>
                    </IonToolbar>
                </IonHeader>
                <IonContent className="ion-padding">
                    <p>Controller details are missing. Return to your controller list and reconnect.</p>
                    <IonButton expand="block" onClick={() => navigate('/home', { replace: true })}>
                        Go to Home
                    </IonButton>
                </IonContent>
            </IonPage>
        );
    }

    return (
        <IonPage>
            <IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/controller-setup" /></IonButtons><IonTitle>Owner account</IonTitle></IonToolbar></IonHeader>
            <IonContent className="prakiva-home ion-padding">
                <h1 className="prakiva-page-heading">Make this controller yours.</h1>
                <p className="prakiva-muted">Create the owner credentials for <strong>{controller.name}</strong>. Keep them somewhere safe; they will be used to authenticate future access.</p>
                <IonCard className="prakiva-card"><IonCardContent>
                    <IonItem>
                        <IonLabel position="stacked">Owner user ID</IonLabel>
                        <IonInput value={userId} onIonInput={(e) => setUserId(e.detail.value ?? '')} disabled={submitting || claimed} autocomplete="username" maxlength={32} placeholder="Choose a user ID" />
                    </IonItem>
                    <IonItem>
                        <IonLabel position="stacked">Password</IonLabel>
                        <IonInput type="password" value={password} onIonInput={(e) => setPassword(e.detail.value ?? '')} disabled={submitting || claimed} autocomplete="new-password" maxlength={64} placeholder="At least 8 characters" />
                    </IonItem>
                    <IonItem>
                        <IonLabel position="stacked">Confirm password</IonLabel>
                        <IonInput type="password" value={confirmPassword} onIonInput={(e) => setConfirmPassword(e.detail.value ?? '')} disabled={submitting || claimed} autocomplete="new-password" maxlength={64} placeholder="Enter password again" />
                    </IonItem>
                    <IonItem>
                        <IonLabel position="stacked">Reset PIN (10 digits)</IonLabel>
                        <IonInput type="password" inputmode="numeric" value={resetPin} onIonInput={(e) => setResetPin((e.detail.value ?? '').replace(/\D/g, '').slice(0, 10))} disabled={submitting || claimed} autocomplete="off" maxlength={10} placeholder="Choose a 10-digit reset PIN" />
                    </IonItem>
                    <IonItem>
                        <IonLabel position="stacked">Confirm reset PIN</IonLabel>
                        <IonInput type="password" inputmode="numeric" value={confirmResetPin} onIonInput={(e) => setConfirmResetPin((e.detail.value ?? '').replace(/\D/g, '').slice(0, 10))} disabled={submitting || claimed} autocomplete="off" maxlength={10} placeholder="Enter reset PIN again" />
                    </IonItem>
                    {message && (<IonText color={claimed ? 'success' : 'danger'}><p>{message}</p></IonText>)}
                    <IonButton expand="block" onClick={validate} disabled={submitting || claimed}>{submitting ? 'Claiming controller…' : claimed ? 'Controller Claimed' : 'Create Owner Account'}</IonButton>
                    {claimed && <IonButton expand="block" onClick={() => navigate('/controller-login', { replace: true, state: { controller } })}>Continue to Login</IonButton>}
                    <IonButton expand="block" fill="clear" color="medium" onClick={() => navigate('/controller-setup', { state: { controller } })}>Back to setup</IonButton>
                    <p className="prakiva-muted prakiva-setup-footnote">Your password and reset PIN are sent to the controller to establish ownership. They are not saved by this screen. Keep the reset PIN safe: it is used to authorize a future factory reset.</p>
                </IonCardContent></IonCard>
            </IonContent>
        </IonPage>
    );
};

export default ControllerClaim;
