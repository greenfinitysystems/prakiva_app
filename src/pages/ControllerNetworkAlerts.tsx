import { arrowBack } from 'ionicons/icons';
import { useCallback, useEffect, useState } from 'react';
import { IonButton, IonButtons, IonContent, IonHeader, IonInput, IonItem, IonLabel, IonList, IonPage, IonSelect, IonSelectOption, IonSpinner, IonText, IonTitle, IonToggle, IonToolbar, IonIcon } from '@ionic/react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerSessionStore } from '../services/controller-session-store';
import { controllerRequest } from '../services/controller-api';

type MonitorStatus = { enabled: boolean; target_mode: 'gateway' | 'custom'; monitor_address: string; interval_cycles: number; interval_seconds: number; controller_cycle_seconds: number; failure_threshold: number; consecutive_failures: number; alert_active: boolean; effective_target: string; monitoring_active: boolean };
const ControllerNetworkAlerts: React.FC = () => {
    const navigate = useNavigate();
    const controller = (useLocation().state as { controller?: SavedController } | null)?.controller;
    const [monitor, setMonitor] = useState<MonitorStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const request = useCallback(async (operation: string, fields: Record<string, unknown> = {}) => {
        if (!controller) throw new Error('Controller is unavailable.');
        const session = await ControllerSessionStore.load(controller.deviceId);
        if (!session?.sessionToken) throw new Error('Sign in before accessing controller settings.');
        return controllerRequest(controller.address, controller.httpPort, operation, { session_token: session.sessionToken, ...fields });
    }, [controller]);
    const loadMonitor = useCallback(async () => {
        const result = await request('get_network_monitor');
        setMonitor(result.data as unknown as MonitorStatus);
    }, [request]);
    useEffect(() => { if (!controller) return; void loadMonitor().catch(e => setError(e instanceof Error ? e.message : 'Monitor read failed.')); }, [controller, loadMonitor]);
    const saveMonitor = async () => {
        if (!monitor || busy) return;
        if (monitor.target_mode === 'custom' && !/^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/.test(monitor.monitor_address)) { setError('Enter a valid IPv4 monitor address.'); return; }
        setBusy(true); setError(''); setNotice('');
        try { await request('set_network_monitor', { enabled: monitor.enabled, target_mode: monitor.target_mode, monitor_address: monitor.target_mode === 'custom' ? monitor.monitor_address : '', interval_cycles: monitor.interval_cycles }); await loadMonitor(); setNotice('Monitor settings saved to controller.'); }
        catch (e) { setError(e instanceof Error ? e.message : 'Monitor save failed.'); } finally { setBusy(false); }
    };
    if (!controller) return <IonPage><IonContent className="ion-padding">Controller context missing. <IonButton onClick={() => navigate('/home')}>Home</IonButton></IonContent></IonPage>;
    return <IonPage><IonHeader><IonToolbar><IonButtons slot="start"><IonButton fill="clear" aria-label="Back to dashboard" onClick={() => navigate('/controller-dashboard', { state: { controller } })}><IonIcon slot="icon-only" icon={arrowBack} /></IonButton></IonButtons><IonTitle>Network Monitor</IonTitle></IonToolbar></IonHeader>
        <IonContent className="ion-padding">
            <h2>Network monitor</h2>
            {monitor ? <IonList>
                <IonItem><IonLabel>Enable in STA mode</IonLabel><IonToggle slot="end" checked={monitor.enabled} onIonChange={e => setMonitor({ ...monitor, enabled: e.detail.checked })} /></IonItem>
                <IonItem><IonLabel>Target</IonLabel><IonSelect value={monitor.target_mode} onIonChange={e => setMonitor({ ...monitor, target_mode: e.detail.value })}><IonSelectOption value="gateway">DHCP gateway</IonSelectOption><IonSelectOption value="custom">Custom IPv4</IonSelectOption></IonSelect></IonItem>
                {monitor.target_mode === 'custom' && <IonItem><IonLabel position="stacked">Monitor IP</IonLabel><IonInput value={monitor.monitor_address} onIonInput={e => setMonitor({ ...monitor, monitor_address: String(e.detail.value ?? '') })} /></IonItem>}
                <IonItem><IonLabel position="stacked">Interval (controller cycles)</IonLabel><IonInput type="number" min="1" value={monitor.interval_cycles} onIonInput={e => setMonitor({ ...monitor, interval_cycles: Number(e.detail.value) })} /></IonItem>
                <IonItem><IonLabel>Effective interval</IonLabel><IonText>{monitor.interval_cycles * monitor.controller_cycle_seconds} seconds</IonText></IonItem>
                <IonItem><IonLabel>Effective target</IonLabel><IonText>{monitor.effective_target || 'Not available'}</IonText></IonItem>
                <IonItem><IonLabel>Current status</IonLabel><IonText>{monitor.alert_active ? 'Failure detected' : monitor.monitoring_active ? 'Monitoring' : 'Inactive'}</IonText></IonItem>
                <IonButton expand="block" disabled={busy || !Number.isInteger(monitor.interval_cycles) || monitor.interval_cycles < 1 || monitor.interval_cycles > 3600} onClick={() => void saveMonitor()}>Save monitor settings</IonButton>
            </IonList> : <IonSpinner />}
            {notice && <IonText color="success"><p>{notice}</p></IonText>}
            {error && <IonText color="danger"><p role="alert">{error}</p></IonText>}
        </IonContent></IonPage>;
};
export default ControllerNetworkAlerts;
