import { useEffect, useMemo, useState } from 'react';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonText, IonTitle, IonToolbar } from '@ionic/react';
import { arrowBack, settingsOutline, optionsOutline } from 'ionicons/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import type { ControllerCapability, CapabilityChannel, SensorWidgetType } from '../config/controller-capabilities';
import { ControlConfigurationStore } from '../services/control-configuration-store';
import { ControllerSynchronizationStore } from '../services/controller-synchronization-store';
import { markLocalConfigurationPending } from '../services/configuration-apply';
import type { VirtualSensorDeclaration } from '../services/controller-api';
import { VirtualSensorConfigurationStore, type VirtualSensorParameterValues } from '../services/virtual-sensor-configuration-store';
import VirtualSensorParameterEditor from '../components/VirtualSensorParameterEditor';
import '../theme/skins/default/styles/pages/SensorDetailPage.css';
import { ControllerSessionStore } from '../services/controller-session-store';
import { getCapability, getSensorHistory, type CapabilityReadResult, type SensorHistoryPoint } from '../services/capability-operations';
import SensorWidgetRenderer from '../components/sensor-widgets/SensorWidgetRenderer';
import SensorHistoryChart from '../components/sensor-widgets/SensorHistoryChart';
import SensorCalibrationEditor from '../components/SensorCalibrationEditor';
import { getSensorCalibration } from '../services/sensor-calibration';

interface SensorRouteState {
    controller?: SavedController;
    capability?: ControllerCapability;
    channel?: CapabilityChannel;
    capabilities?: ControllerCapability[];
}

interface SensorReadingState {
    result?: CapabilityReadResult;
    receivedAt?: number;
    error?: string;
}

const POLL_INTERVAL_MS = 2000;
const STALE_AFTER_SECONDS = 15;
const HISTORY_REFRESH_INTERVAL_MS = 30000;
const HISTORY_POINT_LIMIT = 288;

const SensorDetailPage: React.FC = () => {
    const { capabilityId = '', channelId = '' } = useParams<{ capabilityId: string; channelId: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const route = location.state as SensorRouteState | null;
    const expectedPath = `/sensor-detail/${encodeURIComponent(capabilityId)}/${encodeURIComponent(channelId)}`;
    const isActiveSensorRoute = location.pathname === expectedPath;
    // Router state is stable during ordinary sensor updates; retain the
    // associated objects rather than recreating references on each render.
    const controller = useMemo(() => route?.controller, [route?.controller]);
    const capability = useMemo(
        () => route?.capability ?? route?.capabilities?.find(item => item.id === capabilityId),
        [route?.capability, route?.capabilities, capabilityId],
    );
    const channel = useMemo(
        () => route?.channel ?? capability?.channels.find(item => item.id === channelId),
        [route?.channel, capability, channelId],
    );
    const [sessionToken, setSessionToken] = useState('');
    const [reading, setReading] = useState<SensorReadingState | null>(null);
    const [historyPoints, setHistoryPoints] = useState<SensorHistoryPoint[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [pageError, setPageError] = useState('');
    const [virtualSensorDeclaration, setVirtualSensorDeclaration] = useState<VirtualSensorDeclaration | null>(null);
    const [virtualSensorParameters, setVirtualSensorParameters] = useState<VirtualSensorParameterValues>({});
    const [parameterEditorOpen, setParameterEditorOpen] = useState(false);
    const [configurationNotice, setConfigurationNotice] = useState('');
    const [calibrationEditorOpen, setCalibrationEditorOpen] = useState(false);
    const [calibrationReadings, setCalibrationReadings] = useState<{ raw: number; corrected: number } | null>(null);

    const widget: SensorWidgetType = useMemo(() => {
        if (!capability || !channel) return 'none';
        return ControlConfigurationStore.getControl(capability.id).sensorWidgets?.[channel.id] ?? 'none';
    }, [capability, channel]);

    const displayName = useMemo(() => {
        if (!capability) return 'Sensor';
        const labels = ControlConfigurationStore.getCapabilityLabels();
        return labels[capability.id]?.trim() || capability.name;
    }, [capability]);

    useEffect(() => {
        if (!location.pathname.startsWith('/sensor-detail/')) return;
        let active = true;
        const loadSession = async () => {
            if (!controller) {
                setPageError('Controller context is missing. Return to the dashboard and select the sensor again.');
                return;
            }
            try {
                const session = await ControllerSessionStore.load(controller.deviceId);
                if (!active) return;
                if (!session) {
                    setPageError('Your controller session has expired. Please sign in again.');
                    return;
                }
                setSessionToken(session.sessionToken);
            } catch (error) {
                if (active) setPageError(error instanceof Error ? error.message : 'Could not load the controller session.');
            }
        };
        void loadSession();
        return () => { active = false; };
    }, [location.pathname, controller]);

    useEffect(() => {
        if (!controller || !capability || !channel) return;
        let active = true;
        const loadVirtualSensorDefinition = async () => {
            try {
                const snapshot = await ControllerSynchronizationStore.load(controller.deviceId);
                const declaration = snapshot?.capabilities.virtual_sensors?.find(item =>
                    item.capability_id === capability.id && item.channel_id === channel.id);
                if (!active) return;
                setVirtualSensorDeclaration(declaration ?? null);
                if (!declaration) return;

                const defaults = Object.fromEntries(
                    Object.entries(declaration.parameters).map(([id, definition]) => [id, definition.default]),
                ) as VirtualSensorParameterValues;
                const remoteConfiguration = snapshot?.configuration.configuration;
                const remoteVirtualSensors = remoteConfiguration &&
                    typeof remoteConfiguration.virtual_sensors === 'object' &&
                    remoteConfiguration.virtual_sensors !== null &&
                    !Array.isArray(remoteConfiguration.virtual_sensors)
                    ? remoteConfiguration.virtual_sensors as Record<string, unknown>
                    : {};
                const remoteEntry = remoteVirtualSensors[declaration.component_id];
                const remoteParameters = remoteEntry && typeof remoteEntry === 'object' &&
                    !Array.isArray(remoteEntry) &&
                    typeof (remoteEntry as Record<string, unknown>).parameters === 'object' &&
                    (remoteEntry as Record<string, unknown>).parameters !== null
                    ? (remoteEntry as Record<string, unknown>).parameters as Record<string, unknown>
                    : {};
                const validRemote: VirtualSensorParameterValues = {};
                for (const [id, definition] of Object.entries(declaration.parameters)) {
                    const value = remoteParameters[id];
                    if (typeof value === 'number' && Number.isFinite(value)) validRemote[id] = value;
                    else validRemote[id] = definition.default;
                }
                const local = VirtualSensorConfigurationStore.getParameters(
                    controller.deviceId, declaration.component_id,
                );
                setVirtualSensorParameters({ ...defaults, ...validRemote, ...(local ?? {}) });
            } catch (error) {
                if (active) console.error('[Prakiva] Could not load virtual sensor parameters:', error);
            }
        };
        void loadVirtualSensorDefinition();
        return () => { active = false; };
    }, [controller, capability, channel]);

    const saveVirtualSensorParameters = (values: VirtualSensorParameterValues) => {
        if (!controller || !virtualSensorDeclaration) return;
        VirtualSensorConfigurationStore.setParameters(
            controller.deviceId, virtualSensorDeclaration.component_id, values,
        );
        markLocalConfigurationPending(controller.deviceId);
        setVirtualSensorParameters(values);
        setParameterEditorOpen(false);
        setConfigurationNotice('Parameters saved on this phone. Return to the controller dashboard and choose Apply Configuration to send them to the controller.');
    };

    useEffect(() => {
        if (location.pathname !== `/sensor-detail/${encodeURIComponent(capabilityId)}/${encodeURIComponent(channelId)}` ||
            !controller || !capability || !channel || !sessionToken || widget === 'none') return;

        let active = true;
        let inFlight = false;
        const poll = async () => {
            if (!active || inFlight) return;
            inFlight = true;
            try {
                const result = await getCapability(
                    controller.address,
                    controller.httpPort,
                    sessionToken,
                    capability.id,
                    channel.id,
                );
                // The calibration endpoint returns raw and corrected values from the
                // controller's acquisition snapshot. Do not infer raw from corrected.
                // On older firmware / unsupported sensors, retain the original gauge.
                let pair: { raw: number; corrected: number } | null = null;
                if (capability.kind === 'sensor') {
                    try {
                        const calibration = await getSensorCalibration(
                            controller.address, controller.httpPort, sessionToken,
                            capability.id, channel.id,
                        );
                        if (calibration.rawValue !== undefined && calibration.calibratedValue !== undefined) {
                            pair = { raw: calibration.rawValue, corrected: calibration.calibratedValue };
                        }
                    } catch {
                        // Calibration is optional; never break normal sensor polling.
                    }
                }
                if (active) {
                    setCalibrationReadings(pair);
                    setReading({ result, receivedAt: Date.now() });
                    setPageError('');
                }
            } catch (error) {
                if (active) {
                    setReading(previous => previous?.result
                        ? { ...previous, error: error instanceof Error ? error.message : 'Sensor read failed.' }
                        : { error: error instanceof Error ? error.message : 'Sensor read failed.' });
                }
            } finally {
                inFlight = false;
            }
        };

        setReading(null);
        setCalibrationReadings(null);
        void poll();
        const timer = window.setInterval(() => { void poll(); }, POLL_INTERVAL_MS);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [location.pathname, capabilityId, channelId, controller, capability, channel, sessionToken, widget]);

    useEffect(() => {
        if (location.pathname !== `/sensor-detail/${encodeURIComponent(capabilityId)}/${encodeURIComponent(channelId)}` ||
            !controller || !capability || !channel || !sessionToken || widget === 'none') return;

        let active = true;
        let inFlight = false;
        const loadHistory = async () => {
            if (!active || inFlight) return;
            inFlight = true;
            setHistoryLoading(true);
            try {
                const result = await getSensorHistory(
                    controller.address,
                    controller.httpPort,
                    sessionToken,
                    capability.id,
                    channel.id,
                    HISTORY_POINT_LIMIT,
                );
                if (active) {
                    setHistoryPoints(result.points);
                    setHistoryError('');
                }
            } catch (error) {
                if (active) setHistoryError(error instanceof Error ? error.message : 'Could not load sensor history.');
            } finally {
                inFlight = false;
                if (active) setHistoryLoading(false);
            }
        };

        setHistoryPoints([]);
        setHistoryError('');
        void loadHistory();
        const timer = window.setInterval(() => { void loadHistory(); }, HISTORY_REFRESH_INTERVAL_MS);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [location.pathname, capabilityId, channelId, controller, capability, channel, sessionToken, widget]);

    // IonRouterOutlet retains inactive pages during transitions. Do not render
    // a missing-context error when this page is no longer the active route.
    if (!isActiveSensorRoute) return <IonPage />;

    if (!controller || !capability || !channel) {
        return <IonPage>
            <IonHeader><IonToolbar>
                <IonButtons slot="start"><IonButton fill="clear" onClick={() => navigate('/controller-dashboard')} aria-label="Back to dashboard"><IonIcon slot="icon-only" icon={arrowBack} /></IonButton></IonButtons>
                <IonTitle>Sensor</IonTitle>
            </IonToolbar></IonHeader>
            <IonContent className="ion-padding"><IonText color="danger">Sensor context is unavailable. Return to the dashboard and select the sensor again.</IonText></IonContent>
        </IonPage>;
    }

    const capabilityValue = reading?.result?.value ? Number(reading.result.value.numericValue) : undefined;
    const numericValue = capabilityValue !== undefined && Number.isFinite(capabilityValue) ? capabilityValue : undefined;
    const available = reading?.result?.available === true;
    const measurementValid = reading?.result?.measurementValid === true && numericValue !== undefined;
    const timestamp = reading?.result?.timestamp && reading.result.timestamp > 0
        ? reading.result.timestamp * 1000
        : reading?.receivedAt;
    const ageSeconds = timestamp ? Math.max(0, (Date.now() - timestamp) / 1000) : undefined;
    const stale = Boolean(reading?.error) || (ageSeconds !== undefined && ageSeconds > STALE_AFTER_SECONDS);
    const status: SensorDisplayStatus = !reading
        ? 'loading'
        : reading.error && !reading.result
            ? 'error'
            : !available
                ? 'unavailable'
                : !measurementValid
                    ? 'invalid'
                    : stale ? 'stale' : 'valid';

    return <IonPage>
        <IonHeader><IonToolbar>
            <IonButtons slot="start"><IonButton fill="clear" onClick={() => navigate(-1)} aria-label="Back to dashboard"><IonIcon slot="icon-only" icon={arrowBack} /></IonButton></IonButtons>
            <IonTitle>{displayName}{capability.channels.length > 1 ? ` · ${channel.label}` : ''}</IonTitle>
            <IonButtons slot="end">
                {capability.kind === 'sensor' && <IonButton fill="clear" aria-label="Calibrate sensor" onClick={() => setCalibrationEditorOpen(true)} disabled={!sessionToken}>
                    <IonIcon icon={optionsOutline} />
                </IonButton>}
                {virtualSensorDeclaration && <>
                <IonButton fill="clear" aria-label="Configure virtual sensor" onClick={() => setParameterEditorOpen(true)}>
                    <IonIcon icon={settingsOutline} />
                </IonButton>
                </>}
            </IonButtons>
        </IonToolbar></IonHeader>
        <IonContent className="ion-padding sensor-detail-page">
            {pageError && <IonText color="danger"><p>{pageError}</p></IonText>}
            {configurationNotice && <IonText color="success"><p className="virtual-sensor-configuration-notice">{configurationNotice}</p></IonText>}
            <SensorWidgetRenderer
                widget={widget}
                title={`${displayName}${capability.channels.length > 1 ? ` · ${channel.label}` : ''}`}
                value={measurementValid && !stale ? (calibrationReadings?.corrected ?? numericValue) : undefined}
                rawValue={measurementValid && !stale && calibrationReadings ? calibrationReadings.raw : undefined}
                unit={channel.unit ?? reading?.result?.unit ?? ''}
                min={channel.min}
                max={channel.max}
                precision={1}
                status={status}
                statusText={reading?.error && reading.result ? 'Refresh failed' : undefined}
                updatedAt={timestamp}
            />
            {widget !== 'none' && <SensorHistoryChart
                title={displayName}
                unit={channel.unit ?? reading?.result?.unit ?? ''}
                points={historyPoints}
                loading={historyLoading}
                error={historyError}
                min={channel.min}
                max={channel.max}
            />}
            <SensorCalibrationEditor
                isOpen={calibrationEditorOpen}
                onDismiss={() => setCalibrationEditorOpen(false)}
                address={controller.address}
                port={controller.httpPort}
                token={sessionToken}
                capabilityId={capability.id}
                channelId={channel.id}
                title={displayName}
                unit={channel.unit}
            />
            {virtualSensorDeclaration && <VirtualSensorParameterEditor
                isOpen={parameterEditorOpen}
                declaration={virtualSensorDeclaration}
                initialValues={virtualSensorParameters}
                onDismiss={() => setParameterEditorOpen(false)}
                onSave={saveVirtualSensorParameters}
            />}
        </IonContent>
    </IonPage>;
};

type SensorDisplayStatus = 'loading' | 'valid' | 'invalid' | 'unavailable' | 'stale' | 'error';

export default SensorDetailPage;
