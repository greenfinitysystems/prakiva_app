import { useRef, useState } from 'react';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonText, IonTitle, IonToolbar } from '@ionic/react';
import { arrowBack, eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { changeOwnerPassword, ControllerApiError } from '../services/controller-api';
import { ControllerSessionStore } from '../services/controller-session-store';
import { ControllerBiometricVault } from '../services/controller-biometric-vault';

export default function ControllerChangePassword() {
    const controller = (useLocation().state as { controller?: SavedController } | null)?.controller;
    const navigate = useNavigate();
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [visible, setVisible] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [finished, setFinished] = useState(false);
    const [success, setSuccess] = useState(false);
    const running = useRef(false);
    const clearFields = () => { setCurrent(''); setNext(''); setConfirmation(''); setVisible(false); };
    const login = () => navigate('/controller-login', { replace: true, state: { controller } });
    const back = () => { clearFields(); navigate('/controller-dashboard', { replace: true, state: { controller } }); };
    const submit = async () => {
        if (!controller || running.current || finished) return;
        setMessage('');
        const bytes = new TextEncoder().encode(next).length;
        if (!current || bytes < 8 || bytes > 64 || next === current || next !== confirmation || current.includes('\0') || next.includes('\0')) {
            setMessage('Enter your current password and a different new password of 8–64 UTF-8 bytes. Confirmation must match. Null characters are not allowed.');
            return;
        }
        running.current = true;
        setBusy(true);
        let attempted = false;
        let confirmed = false;
        try {
            const session = await ControllerSessionStore.load(controller.deviceId);
            if (!session) { clearFields(); running.current = false; setBusy(false); login(); return; }
            attempted = true;
            await changeOwnerPassword(controller, session.sessionToken, current, next);
            confirmed = true;
        } catch (error) {
            const code = error instanceof ControllerApiError ? error.code : undefined;
            if (!attempted || (code && ['INVALID_REQUEST', 'INVALID_CURRENT_PASSWORD', 'INVALID_NEW_PASSWORD', 'CONFIG_NOT_READY', 'CRYPTO_FAILURE', 'UNAUTHENTICATED'].includes(code))) {
                setMessage(error instanceof Error ? error.message : 'Password change failed.');
                if (code === 'UNAUTHENTICATED') { clearFields(); login(); }
                running.current = false; setBusy(false); return;
            }
        }
        if (attempted) {
            // A lost acknowledgement or storage failure may mean the password was changed.
            // Never retry; require a fresh manual login to establish the actual outcome.
            const warnings: string[] = [];
            try { await ControllerSessionStore.clear(controller.deviceId); } catch { warnings.push('Local session cleanup failed.'); }
            try { await ControllerBiometricVault.remove(controller.deviceId); } catch { warnings.push('Biometric cleanup failed; disable biometric login manually on the login screen.'); }
            clearFields();
            setSuccess(confirmed);
            setFinished(true);
            setMessage([confirmed ? 'Password changed successfully. Log in with your new password.' : 'Password change could not be confirmed. Try manual login with the new password first, then the previous password if rejected. Do not repeat the change until you have authenticated.', ...warnings].join(' '));
        }
        running.current = false;
        setBusy(false);
    };
    if (!controller) return <IonPage><IonContent className="ion-padding"><p>Controller context missing.</p><IonButton onClick={() => navigate('/home', { replace: true })}>Home</IonButton></IonContent></IonPage>;
    return <IonPage>
        <IonHeader><IonToolbar><IonButtons slot="start"><IonButton disabled={busy} aria-label="Back" onClick={finished ? login : back}><IonIcon slot="icon-only" icon={arrowBack}/></IonButton></IonButtons><IonTitle>Change Password</IonTitle></IonToolbar></IonHeader>
        <IonContent className="ion-padding">
            <p>{controller.name}</p>
            {!finished && <>
                <p>Change the owner password without changing controller configuration. You will need to sign in again and re-enable biometric login.</p>
                <IonItem><IonLabel position="stacked">Current password</IonLabel><IonInput disabled={busy} type={visible ? 'text' : 'password'} autocomplete="current-password" value={current} onIonInput={e => setCurrent(e.detail.value ?? '')}/></IonItem>
                <IonItem><IonLabel position="stacked">New password</IonLabel><IonInput disabled={busy} type={visible ? 'text' : 'password'} autocomplete="new-password" value={next} onIonInput={e => setNext(e.detail.value ?? '')}/></IonItem>
                <IonItem><IonLabel position="stacked">Confirm new password</IonLabel><IonInput disabled={busy} type={visible ? 'text' : 'password'} autocomplete="new-password" value={confirmation} onIonInput={e => setConfirmation(e.detail.value ?? '')}/></IonItem>
                <IonButton fill="clear" disabled={busy} onClick={() => setVisible(v => !v)}><IonIcon slot="start" icon={visible ? eyeOffOutline : eyeOutline}/>{visible ? 'Hide passwords' : 'Show passwords'}</IonButton>
                <p>Use 8–64 UTF-8 bytes. The new password must differ from the current password.</p>
                <IonButton expand="block" disabled={busy || !current || !next || !confirmation} onClick={() => void submit()}>{busy ? 'Changing password…' : 'Change Password'}</IonButton>
            </>}
            {message && <IonText color={success ? 'success' : 'danger'}><p>{message}</p></IonText>}
            {finished && <IonButton expand="block" onClick={login}>Go to Login</IonButton>}
        </IonContent>
    </IonPage>;
}
