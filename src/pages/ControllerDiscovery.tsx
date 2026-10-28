import { useCallback, useRef, useState } from 'react';
import {
    IonAlert, IonBackButton, IonButton, IonButtons, IonCard, IonCardContent,
    IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage,
    IonSpinner, IonText, IonTitle, IonToolbar, useIonViewWillEnter,
} from '@ionic/react';
import { radioOutline, hardwareChipOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerStore } from '../services/controller-store';
import { getDeviceInfo, savedControllerFromDevice } from '../services/controller-api';
import { discoverControllers, type DiscoveredController } from '../services/controller-discovery';
import './Home.css';

interface RouteState { targetDeviceId?: string }
const ControllerDiscovery: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const targetDeviceId = (location.state as RouteState | null)?.targetDeviceId;
    const [devices, setDevices] = useState<Record<string, DiscoveredController>>({});
    const [scanning, setScanning] = useState(false);
    const [connectingId, setConnectingId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [namePrompt, setNamePrompt] = useState<{ device: DiscoveredController; suggested: string } | null>(null);
    const scanRef = useRef(false);
    const foundCountRef = useRef(0);

    const scan = useCallback(async () => {
        if (scanRef.current) return;
        scanRef.current = true;
        foundCountRef.current = 0;
        setScanning(true); setDevices({}); setMessage(null);
        try {
            await discoverControllers((device) => {
                foundCountRef.current += 1;
                setDevices((current) => ({ ...current, [device.deviceId]: device }));
            }, (diagnostic) => console.debug(`[Prakiva discovery] ${diagnostic}`));
            if (foundCountRef.current === 0) setMessage('No controllers found. Connect to Prakiva Wi-Fi or the same home network as your controller, then scan again.');
        } catch (err) { setMessage(`Network scan failed: ${String(err)}`); }
        finally { scanRef.current = false; setScanning(false); }
    }, []);

    // Ionic may keep this page mounted in IonRouterOutlet. Re-scan every time
    // the user returns to Discovery, not only on the component's first mount.
    useIonViewWillEnter(() => { void scan(); }, [scan]);

    const selectDevice = async (device: DiscoveredController) => {
        if (connectingId) return;
        setConnectingId(device.deviceId); setMessage('Verifying controller identity…');
        try {
            if (targetDeviceId && targetDeviceId !== device.deviceId) throw new Error('This is not the saved controller you are trying to reconnect to.');
            const info = await getDeviceInfo(device.address, device.httpPort);
            if (info.device_id !== device.deviceId) throw new Error('Device identity mismatch: HTTP response does not match UDP ID.');
            const existingControllers = await ControllerStore.loadAll();
            const existing = existingControllers.find((item) => item.deviceId === device.deviceId);
            if (targetDeviceId) {
                if (!existing) throw new Error('The saved controller record no longer exists.');
                const updated = savedControllerFromDevice(device, info, existing.name);
                await ControllerStore.save(updated);
                navigate('/home', { replace: true, state: { refresh: Date.now() } });
                return;
            }
            setNamePrompt({ device, suggested: existing?.name ?? `${typeof info.product === 'string' ? info.product : 'Prakiva'} controller` });
            setMessage(null);
        } catch (err) { setMessage(`Could not verify controller: ${String(err)}`); }
        finally { setConnectingId(null); }
    };

    const saveNamedController = async (name: string) => {
        const pending = namePrompt;
        setNamePrompt(null);
        if (!pending) return;
        const trimmed = name.trim();
        if (!trimmed) { setMessage('Please enter a controller name.'); return; }
        setConnectingId(pending.device.deviceId);
        try {
            // Re-fetch and re-verify immediately before persistence.
            const info = await getDeviceInfo(pending.device.address, pending.device.httpPort);
            const saved: SavedController = savedControllerFromDevice(pending.device, info, trimmed);
            await ControllerStore.save(saved);
            navigate('/controller-details', { state: { controller: saved, deviceInfo: info } });
        } catch (err) { setMessage(`Could not save controller: ${String(err)}`); }
        finally { setConnectingId(null); }
    };

    return (
        <IonPage>
            <IonHeader><IonToolbar>
                <IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons>
                <IonTitle>{targetDeviceId ? 'Find saved controller' : 'Add controller'}</IonTitle>
            </IonToolbar></IonHeader>
            <IonContent className="prakiva-home ion-padding">
                <h1 className="prakiva-page-heading">{targetDeviceId ? 'Reconnect to your saved controller' : 'Find your Prakiva controller'}</h1>
                <p className="prakiva-muted">{targetDeviceId ? `Searching for the controller with ID ${targetDeviceId}. Other controllers will not be accepted as a replacement.` : 'Connect your phone to Prakiva Wi-Fi or the same home network as your controller.'}</p>
                <IonButton expand="block" onClick={() => void scan()} disabled={scanning || connectingId !== null}>
                    {scanning ? <IonSpinner name="crescent" slot="start" /> : <IonIcon icon={radioOutline} slot="start" />}
                    {scanning ? 'Scanning network…' : 'Scan again'}
                </IonButton>
                {message && <IonText color={message.startsWith('No controllers') ? 'medium' : 'danger'}><p>{message}</p></IonText>}
                {connectingId && <IonItem lines="none"><IonSpinner slot="start" /><IonLabel>Verifying controller identity…</IonLabel></IonItem>}
                <h2 className="prakiva-subheading">Available controllers</h2>
                {Object.keys(devices).length === 0 && !scanning ? <IonCard className="prakiva-card"><IonCardContent><IonItem lines="none"><IonIcon slot="start" icon={hardwareChipOutline} color="medium" /><IonLabel className="ion-text-wrap"><h3>No Prakiva controllers found yet</h3><p>The app lists controllers that respond to the network discovery request.</p></IonLabel></IonItem></IonCardContent></IonCard> : null}
                <IonList className="prakiva-controller-list">
                    {Object.values(devices).filter((device) => !targetDeviceId || device.deviceId === targetDeviceId).map((device) => (
                        <IonItem key={device.deviceId} button detail onClick={() => void selectDevice(device)} disabled={connectingId !== null}>
                            <IonIcon slot="start" icon={hardwareChipOutline} color="primary" />
                            <IonLabel className="ion-text-wrap"><h3>Prakiva controller</h3><p>Device ID: {device.deviceId}</p><p>Address: {device.address}:{device.httpPort}</p><p>Protocol: {device.protocolVersion}</p></IonLabel>
                        </IonItem>
                    ))}
                </IonList>
            </IonContent>
            <IonAlert
                isOpen={namePrompt !== null}
                header="Name this controller"
                inputs={[{ name: 'controllerName', type: 'text', placeholder: 'e.g. Living Room Aquarium', value: namePrompt?.suggested ?? '', attributes: { maxlength: 40 } }]}
                buttons={[{ text: 'Cancel', role: 'cancel', handler: () => setNamePrompt(null) }, { text: 'Save', handler: (values) => { void saveNamedController(String(values.controllerName ?? '')); return false; } }]}
                onDidDismiss={() => setNamePrompt(null)}
            />
        </IonPage>
    );
};

export default ControllerDiscovery;
