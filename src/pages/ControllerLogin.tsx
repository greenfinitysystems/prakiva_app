import { useEffect, useState } from 'react';
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonContent,
  IonHeader, IonInput, IonItem, IonLabel, IonPage, IonSpinner, IonText,
  IonTitle, IonToolbar,
} from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { authenticateOwner, validateOwnerSession } from '../services/controller-api';
import { ControllerSessionStore } from '../services/controller-session-store';
import './Home.css';

interface LoginState { controller?: SavedController; returnTo?: string }
const ControllerLogin: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const loginState = location.state as LoginState | null;
  const controller = loginState?.controller;
  const returnTo = loginState?.returnTo;
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    const checkExisting = async () => {
      if (!controller) return;
      try {
        const session = await ControllerSessionStore.load(controller.deviceId);
        if (!session) return;
        const valid = await validateOwnerSession(controller.address, controller.httpPort, session.sessionToken);
        if (!active) return;
        if (valid) navigate(returnTo ?? '/controller-dashboard', { replace: true, state: { controller } });
        else await ControllerSessionStore.clear(controller.deviceId);
      } catch {
        // A network failure is not proof that the token is invalid; leave the login form available.
      }
    };
    void checkExisting();
    return () => { active = false; };
  }, [controller?.deviceId, controller?.address, controller?.httpPort, navigate]);

  if (!controller) {
    return <IonPage><IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons><IonTitle>Controller login</IonTitle></IonToolbar></IonHeader><IonContent className="ion-padding"><p>Controller details were not supplied. Return to Home and select the controller again.</p><IonButton expand="block" onClick={() => navigate('/home', { replace: true })}>Go to Home</IonButton></IonContent></IonPage>;
  }

  const login = async () => {
    setMessage('');
    if (!userId.trim() || !password) { setMessage('Enter your owner user ID and password.'); return; }
    setBusy(true);
    try {
      const result = await authenticateOwner(controller.address, controller.httpPort, userId.trim(), password);
      const token = result.session_token;
      if (typeof token !== 'string' || token.length !== 64 || result.device_id !== controller.deviceId) {
        throw new Error('The controller returned an invalid session or unexpected device identity.');
      }
      await ControllerSessionStore.save({ deviceId: controller.deviceId, sessionToken: token, ownerUserId: userId.trim() });
      setPassword('');
      navigate(returnTo ?? '/controller-dashboard', { replace: true, state: { controller } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  };

  return <IonPage>
    <IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/controller-details" /></IonButtons><IonTitle>Controller login</IonTitle></IonToolbar></IonHeader>
    <IonContent className="prakiva-home ion-padding">
      <IonCard className="prakiva-card"><IonCardContent>
        <h1>Sign in to {controller.name}</h1>
        <p className="prakiva-muted">Owner credentials for this controller.</p>
        <IonItem><IonLabel position="stacked">Owner user ID</IonLabel><IonInput value={userId} autocomplete="username" onIonInput={e => setUserId(e.detail.value ?? '')} /></IonItem>
        <IonItem><IonLabel position="stacked">Password</IonLabel><IonInput type="password" value={password} autocomplete="current-password" onIonInput={e => setPassword(e.detail.value ?? '')} onKeyDown={e => { if (e.key === 'Enter') void login(); }} /></IonItem>
        {message && <IonText color="danger"><p>{message}</p></IonText>}
        <IonButton expand="block" disabled={busy} onClick={() => void login()}>{busy ? <><IonSpinner name="crescent" /> Signing in…</> : 'Login'}</IonButton>
      </IonCardContent></IonCard>
    </IonContent>
  </IonPage>;
};
export default ControllerLogin;
