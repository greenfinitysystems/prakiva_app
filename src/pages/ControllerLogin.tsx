import { useEffect, useState } from 'react';
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonContent,
  IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonPage, IonSpinner, IonText,
  IonTitle, IonToolbar,
} from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import type { SavedController } from '../models/saved-controller';
import { authenticateOwner, validateOwnerSession } from '../services/controller-api';
import { ControllerSessionStore } from '../services/controller-session-store';
import { synchronizeControllerAfterLogin } from '../services/controller-synchronization';
import { ControlConfigurationStore, isControlConfigurationDocument } from '../services/control-configuration-store';
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
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingSessionToken, setPendingSessionToken] = useState('');

  const synchronizeAndContinue = async (token: string) => {
    if (!controller) throw new Error('Controller details are missing.');
    const snapshot = await synchronizeControllerAfterLogin(controller, token);
    const remoteAppConfiguration = snapshot.configuration.configuration?.app_configuration;
    if (snapshot.configuration.configuration_exists && isControlConfigurationDocument(remoteAppConfiguration)) {
      // The controller is authoritative for a previously applied app configuration.
      ControlConfigurationStore.replaceWithControllerDocument(remoteAppConfiguration);
    }
    navigate(returnTo ?? '/controller-dashboard', { replace: true, state: { controller } });
  };

  useEffect(() => {
    let active = true;
    const checkExisting = async () => {
      if (!controller) return;
      try {
        const session = await ControllerSessionStore.load(controller.deviceId);
        if (!session) return;
        const valid = await validateOwnerSession(controller.address, controller.httpPort, session.sessionToken);
        if (!active) return;
        if (!valid) {
          await ControllerSessionStore.clear(controller.deviceId);
          return;
        }
        setPendingSessionToken(session.sessionToken);
        setBusy(true);
        await synchronizeAndContinue(session.sessionToken);
      } catch (error) {
        if (active) { console.error('[Prakiva] Controller refresh failed:', error); setMessage('You’re signed in, but your controller information could not be refreshed. Check the connection and try again.'); }
      } finally {
        if (active) setBusy(false);
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
      setPendingSessionToken(token);
      setPassword('');
      await synchronizeAndContinue(token);
    } catch (error) {
      console.error('[Prakiva] Sign-in failed:', error);
      setMessage('We couldn’t sign you in. Check your details and controller connection, then try again.');
    } finally { setBusy(false); }
  };

  const retrySynchronization = async () => {
    if (!pendingSessionToken) return;
    setBusy(true);
    setMessage('');
    try { await synchronizeAndContinue(pendingSessionToken); }
    catch (error) { console.error('[Prakiva] Controller refresh failed:', error); setMessage('Your controller information could not be refreshed. Check the connection and try again.'); }
    finally { setBusy(false); }
  };

  return <IonPage>
    <IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/controller-details" /></IonButtons><IonTitle>Controller login</IonTitle></IonToolbar></IonHeader>
    <IonContent className="prakiva-home ion-padding">
      <IonCard className="prakiva-card"><IonCardContent>
        <h1>Sign in to {controller.name}</h1>
        <p className="prakiva-muted">Owner credentials for this controller.</p>
        <IonItem><IonLabel position="stacked">Owner user ID</IonLabel><IonInput value={userId} autocomplete="username" onIonInput={e => setUserId(e.detail.value ?? '')} /></IonItem>
        <IonItem><IonLabel position="stacked">Password</IonLabel><IonInput type={showPassword ? 'text' : 'password'} value={password} autocomplete="current-password" onIonInput={e => setPassword(e.detail.value ?? '')} onKeyDown={e => { if (e.key === 'Enter') void login(); }} /><IonButton slot="end" fill="clear" size="small" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}><IonIcon icon={showPassword ? eyeOffOutline : eyeOutline} /></IonButton></IonItem>
        {message && <IonText color="danger"><p>{message}</p></IonText>}
        {pendingSessionToken && !busy && <IonButton expand="block" fill="outline" onClick={() => void retrySynchronization()}>Try again</IonButton>}
        <IonButton expand="block" disabled={busy} onClick={() => void login()}>{busy ? <><IonSpinner name="crescent" /> Synchronizing…</> : 'Login'}</IonButton>
      </IonCardContent></IonCard>
    </IonContent>
  </IonPage>;
};
export default ControllerLogin;
