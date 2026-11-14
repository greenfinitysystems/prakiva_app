import { useEffect, useState } from 'react';
import {
  IonBackButton, IonButton, IonButtons, IonCard, IonCardContent, IonCheckbox,
  IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList,
  IonNote, IonPage, IonRadio, IonRadioGroup, IonSpinner, IonText, IonTitle,
  IonToolbar, useIonViewWillEnter,
} from '@ionic/react';
import { checkmarkCircleOutline, informationCircleOutline, refreshOutline, wifiOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { getWifiStatus, setWifiConfig, type WifiStatus } from '../services/controller-api';
import { ControllerSessionStore } from '../services/controller-session-store';
import '../theme/skins/default/styles/pages/Home.css';

type Mode = 'KEEP' | 'AP' | 'STA';
interface PageState { controller?: SavedController }

const statusLabel = (status: string): string => ({
  connected: 'Connected to home Wi-Fi',
  connecting: 'Connecting to Wi-Fi',
  recovery_ap: 'Prakiva recovery Wi-Fi is active',
  configuration_error: 'Wi-Fi configuration error',
  switching_network: 'Switching networks',
  ap: 'Prakiva Wi-Fi is active',
  sta: 'Home Wi-Fi mode',
} as Record<string, string>)[status] ?? status.replaceAll('_', ' ');

const WifiConfiguration: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const controller = (location.state as PageState | null)?.controller ?? null;

  const [status, setStatus] = useState<WifiStatus | null>(null);
  const [mode, setMode] = useState<Mode>('KEEP');
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshStatus = async (target = controller) => {
    if (!target) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const session = await ControllerSessionStore.load(target.deviceId);
      if (!session) {
        navigate('/controller-login', { state: { controller: target, returnTo: '/wifi-configuration' } });
        return;
      }
      const data = await getWifiStatus(target.address, target.httpPort, session.sessionToken);
      setStatus(data);
      setMode('KEEP');
    } catch (e) {
      console.error('[Prakiva] Could not load Wi-Fi settings:', e);
      setError('We couldn’t load the network settings. Check the controller connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (controller) void refreshStatus(controller);
    // Refresh when the controller context changes. Manual refresh is provided by the button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller?.deviceId]);

  useIonViewWillEnter(() => {
    if (controller) void refreshStatus(controller);
  }, [controller?.deviceId]);

  const save = async () => {
    if (!controller) return;
    if (mode === 'KEEP') {
      setNotice('No changes made. The current Wi-Fi configuration is unchanged.');
      return;
    }
    if (!ssid.trim()) { setError('Enter the Wi-Fi network name (SSID).'); return; }
    if (mode === 'AP' && password.length > 0 && password.length < 8) {
      setError('A custom Prakiva Wi-Fi password must be empty or at least 8 characters.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const session = await ControllerSessionStore.load(controller.deviceId);
      if (!session) {
        navigate('/controller-login', { state: { controller, returnTo: '/wifi-configuration' } });
        return;
      }
      const result = await setWifiConfig(
        controller.address, controller.httpPort, session.sessionToken,
        mode, ssid, password,
      );
      setNotice(mode === 'STA'
        ? 'Credentials verified and saved. The controller is switching to your home Wi-Fi. Connect this phone to the same network, then rediscover the controller if needed.'
        : 'Prakiva Wi-Fi settings were accepted. Reconnect to the updated Prakiva Wi-Fi name if it changes.');
      setStatus({ wifi_type: result.wifi_type, wifi_status: result.wifi_status });
      setPassword('');
    } catch (e) {
      console.error('[Prakiva] Could not save Wi-Fi settings:', e);
      setError('We couldn’t save the network settings. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons>
          <IonTitle>Wi-Fi configuration</IonTitle>
          {controller && <IonButtons slot="end"><IonButton fill="clear" aria-label="Refresh Wi-Fi status" onClick={() => void refreshStatus()} disabled={busy}><IonIcon icon={refreshOutline} /></IonButton></IonButtons>}
        </IonToolbar>
      </IonHeader>
      <IonContent className="prakiva-home ion-padding">
        {!controller ? (
          <IonCard className="prakiva-card"><IonCardContent>
            <h2>No controller selected</h2>
            <p className="prakiva-muted">Open Wi-Fi configuration from the gear menu on a controller dashboard. This ensures the settings apply to the intended controller.</p>
            <IonButton expand="block" onClick={() => navigate('/home')}>Go to Home</IonButton>
          </IonCardContent></IonCard>
        ) : (
          <>
            <IonCard className="prakiva-card">
              <IonCardContent>
                <h1>Wi-Fi & recovery</h1>
                <p className="prakiva-muted">Network status and Wi-Fi settings for this controller.</p>
                <IonItem lines="none">
                  <IonIcon slot="start" icon={wifiOutline} color="primary" />
                  <IonLabel className="ion-text-wrap">
                    <h2>{controller.name}</h2>
                    <p>{controller.deviceId}</p>
                    <p>{controller.address}:{controller.httpPort}</p>
                  </IonLabel>
                </IonItem>
                {status && (
                  <IonItem lines="none">
                    <IonIcon slot="start" icon={checkmarkCircleOutline} color={status.wifi_status === 'connected' ? 'success' : 'medium'} />
                    <IonLabel className="ion-text-wrap">
                      <h3>{statusLabel(status.wifi_status)}</h3>
                      <p>Configured mode: {status.wifi_type}</p>
                    </IonLabel>
                  </IonItem>
                )}
                {busy && !status && <IonSpinner name="crescent" />}
                <IonButton fill="outline" size="small" onClick={() => void refreshStatus()} disabled={busy}>
                  {busy ? <IonSpinner name="crescent" /> : <IonIcon slot="start" icon={refreshOutline} />}
                  Refresh status
                </IonButton>
                <IonNote className="ion-text-wrap">These settings apply only to {controller.name}. Your phone must be connected to a network that can reach this controller.</IonNote>
              </IonCardContent>
            </IonCard>

            <IonCard className="prakiva-card">
              <IonCardContent>
                <h2>Choose a configuration</h2>
                <IonRadioGroup value={mode} onIonChange={e => { setMode(e.detail.value as Mode); setError(''); setNotice(''); }}>
                  <IonItem>
                    <IonRadio value="KEEP" justify="start" />
                    <IonLabel className="ion-text-wrap"><h3>Keep current Wi-Fi</h3><p>Do not change the saved Wi-Fi configuration.</p></IonLabel>
                  </IonItem>
                  <IonItem>
                    <IonRadio value="AP" justify="start" />
                    <IonLabel className="ion-text-wrap"><h3>Customize Prakiva Wi-Fi</h3><p>Keep the controller in access-point mode with your chosen SSID and password.</p></IonLabel>
                  </IonItem>
                  <IonItem>
                    <IonRadio value="STA" justify="start" />
                    <IonLabel className="ion-text-wrap"><h3>Join home Wi-Fi</h3><p>Connect the controller to your router.</p></IonLabel>
                  </IonItem>
                </IonRadioGroup>

                {mode === 'KEEP' && <IonItem lines="none">
                  <IonIcon slot="start" icon={informationCircleOutline} color="primary" />
                  <IonLabel className="ion-text-wrap"><p>No network changes will be sent to the controller.</p></IonLabel>
                </IonItem>}

                {mode !== 'KEEP' && <>
                  <IonItem>
                    <IonLabel position="stacked">Wi-Fi name (SSID)</IonLabel>
                    <IonInput value={ssid} maxlength={32} autocomplete="off" autocapitalize="off" onIonInput={e => setSsid(e.detail.value ?? '')} placeholder={mode === 'AP' ? 'Prakiva WiFi' : 'Your home Wi-Fi'} />
                  </IonItem>
                  <IonItem>
                    <IonLabel position="stacked">{mode === 'AP' ? 'Prakiva Wi-Fi password' : 'Home Wi-Fi password'}</IonLabel>
                    <IonInput type={showPassword ? 'text' : 'password'} value={password} maxlength={63} autocomplete="new-password" onIonInput={e => setPassword(e.detail.value ?? '')} placeholder="Enter password (leave blank for open Wi-Fi)" />
                  </IonItem>
                  <IonItem lines="none">
                    <IonCheckbox checked={showPassword} onIonChange={e => setShowPassword(e.detail.checked)} />
                    <IonLabel className="ion-padding-start">Show password</IonLabel>
                  </IonItem>
                  {mode === 'STA' && <IonNote className="ion-text-wrap">The controller will test these credentials first. They are saved only if the controller connects successfully. An open home network may use an empty password.</IonNote>}
                  {mode === 'AP' && <IonNote className="ion-text-wrap">Leave the password empty only if you deliberately want an open Prakiva access point. A non-empty password must contain at least 8 characters.</IonNote>}
                </>}

                {error && <IonText color="danger"><p>{error}</p></IonText>}
                {notice && <IonText color="success"><p>{notice}</p></IonText>}
                <IonButton expand="block" onClick={() => void save()} disabled={busy || mode === 'KEEP'}>
                  {busy ? <><IonSpinner name="crescent" /> Applying…</> : mode === 'STA' ? 'Verify and connect' : mode === 'AP' ? 'Save Prakiva Wi-Fi' : 'No changes'}
                </IonButton>
              </IonCardContent>
            </IonCard>

            <IonCard className="prakiva-card">
              <IonCardContent>
                <h2>Automatic failover and recovery</h2>
                <IonList lines="none">
                  <IonItem><IonLabel className="ion-text-wrap"><h3>At startup</h3><p>If home Wi-Fi cannot be reached after five attempts, Prakiva starts its recovery access point.</p></IonLabel></IonItem>
                  <IonItem><IonLabel className="ion-text-wrap"><h3>During normal operation</h3><p>A temporary Wi-Fi outage does not stop local automation. The controller keeps retrying the configured home network in the background.</p></IonLabel></IonItem>
                  <IonItem><IonLabel className="ion-text-wrap"><h3>Recovery does not erase settings</h3><p>The controller retains the last verified Wi-Fi credentials and aquarium configuration. Factory reset is a separate operation.</p></IonLabel></IonItem>
                </IonList>
              </IonCardContent>
            </IonCard>
          </>
        )}
      </IonContent>
    </IonPage>
  );
};

export default WifiConfiguration;
