import { ActuationMethodStore } from '../services/actuation-method-store';
import type { VirtualSensorDeclaration } from '../services/controller-api';
import { useEffect, useMemo, useState } from 'react';
import {
    IonBadge, IonButton, IonButtons, IonContent, IonGrid, IonHeader, IonIcon,
    IonPage, IonRow, IonText, IonTitle, IonToolbar, IonAlert,
} from '@ionic/react';
import {
    homeOutline, settingsOutline, syncOutline, checkmarkCircleOutline, alertCircleOutline, cogOutline, speedometerOutline,
} from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { logoutOwner, validateOwnerSession } from '../services/controller-api';
import { applyAppConfigurationToController } from '../services/controller-configuration-adapter';
import { ControllerSynchronizationStore } from '../services/controller-synchronization-store';
import { ControllerSessionStore } from '../services/controller-session-store';
import { RemoteActuatorConfigurationStore } from '../services/remote-actuator-configuration-store';
import { VirtualSensorConfigurationStore } from '../services/virtual-sensor-configuration-store';
import { ControlConfigurationStore, isControlConfigurationDocument, setControllerCapabilities } from '../services/control-configuration-store';
import {
    getConfigurationSyncStatus, getControllerSyncRecord,
    markConfigurationApplied, markConfigurationApplying, markConfigurationApplyFailed,
    markLocalConfigurationPending, markConfigurationSynchronized,
    type ControllerSyncRecord, type ConfigurationSyncStatus, type ControllerConfigurationMetadata,
} from '../services/configuration-apply';
import { type ControlPolicy, type ControllerCapability, type SensorWidgetType, channelPolicyKey } from '../config/controller-capabilities';
import ActuatorTile from '../components/controller-dashboard/ActuatorTile';
import SensorTile from '../components/controller-dashboard/SensorTile';
import ControllerClock from '../components/controller-dashboard/ControllerClock';
import ControllerMenu from '../components/controller-dashboard/ControllerMenu';
import { collectControllerAlerts } from '../services/controller-alert-archive';
import DashboardDialogs from '../components/controller-dashboard/DashboardDialogs';
import { useDashboardNavigationGuard } from '../hooks/controller-dashboard/useDashboardNavigationGuard';
import '../theme/skins/default/styles/pages/Home.css';
import '../theme/skins/default/styles/pages/ControllerDashboard.css';

interface DashboardState { controller?: SavedController }
type PolicyMap = Record<string, ControlPolicy>;
type LabelMap = Record<string, string>;
const sensorChannelKey = (capabilityId: string, channelId: string) => `${capabilityId}:${channelId}`;
const ControllerDashboard: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    // Keep the controller reference stable across ordinary dashboard renders.
    // A new router state still supplies a new controller when navigation changes.
    const controller = useMemo(
        () => (location.state as DashboardState | null)?.controller,
        [location.state],
    );
    const [checking, setChecking] = useState(true);
    const [error, setError] = useState('');
    const [sessionToken, setSessionToken] = useState('');
    const [loggingOut, setLoggingOut] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [policies, setPolicies] = useState<PolicyMap>({});
    const [methods, setMethods] = useState<Record<string, string>>({});
    const [sensorWidgets, setSensorWidgets] = useState<Record<string, SensorWidgetType>>({});
    const [virtualDeclarations, setVirtualDeclarations] = useState<VirtualSensorDeclaration[]>([]);
    const [labels, setLabels] = useState<LabelMap>({});
    const [capabilities, setCapabilities] = useState<ControllerCapability[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [applyRecord, setApplyRecord] = useState<ControllerSyncRecord | null>(() => controller ? getControllerSyncRecord(controller.deviceId) : null);
    const [controllerMetadata, setControllerMetadata] = useState<ControllerConfigurationMetadata | null>(null);
    const [syncConflictOpen, setSyncConflictOpen] = useState(false);
    const [applyBusy, setApplyBusy] = useState(false);
    const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
    const [applyResultOpen, setApplyResultOpen] = useState(false);
    const [applyResultMessage, setApplyResultMessage] = useState('');
    const [saveError, setSaveError] = useState('');



    // Best-effort polling only after login; no changes to authentication or scheduler.
    useEffect(() => {
        if (!controller || !sessionToken || checking) return;
        let running = true;
        const poll = () => { if (running) void collectControllerAlerts(controller).catch(() => {}); };
        poll();
        const timer = window.setInterval(poll, 60_000);
        return () => { running = false; window.clearInterval(timer); };
    }, [controller, sessionToken, checking]);

    useEffect(() => {
        if (!capabilities.length) return;
        const refreshDraft = () => {
            setHasUnsavedChanges(ControlConfigurationStore.hasUnsavedChanges());
            if (controller) setApplyRecord(getControllerSyncRecord(controller.deviceId));
            setPolicies(ControlConfigurationStore.getChannelPolicies());
            if (controller) setMethods(ActuationMethodStore.getAll(controller.deviceId));
            const widgets: Record<string, SensorWidgetType> = {};
            for (const capability of capabilities.filter(c => c.kind === 'sensor')) {
                const configured = ControlConfigurationStore.getControl(capability.id).sensorWidgets ?? {};
                for (const channel of capability.channels) widgets[sensorChannelKey(capability.id, channel.id)] = configured[channel.id] ?? 'none';
            }
            setSensorWidgets(widgets);
            setLabels(ControlConfigurationStore.getCapabilityLabels());
        };
        refreshDraft();
        return ControlConfigurationStore.subscribe(refreshDraft);
    }, [controller, capabilities]);

    useEffect(() => {
        const onSyncStateChanged = (event: Event) => {
            const detail = (event as CustomEvent<{ controllerId?: string }>).detail;
            if (controller && detail?.controllerId === controller.deviceId) {
                setApplyRecord(getControllerSyncRecord(controller.deviceId));
            }
        };
        window.addEventListener('prakiva:configuration-sync-state-changed', onSyncStateChanged);
        return () => window.removeEventListener('prakiva:configuration-sync-state-changed', onSyncStateChanged);
    }, [controller]);


    const {
        requestLeave,
        leaveAlertOpen,
        onLeaveAlertDismiss,
        saveAndLeave,
        discardAndLeave,
    } = useDashboardNavigationGuard({
        controller,
        hasCapabilities: capabilities.length > 0,
        navigate,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        onSaveError: setSaveError,
    });

    const applyStatus: ConfigurationSyncStatus = applyRecord
        ? getConfigurationSyncStatus(applyRecord, controllerMetadata)
        : 'not-configured';
    const applyStatusLabel = hasUnsavedChanges
        ? 'You have unsaved changes'
        : applyStatus === 'up-to-date' ? 'Settings are up to date'
            : applyStatus === 'apply-pending' ? 'Saved settings need applying'
                : applyStatus === 'applying' ? 'Sending settings…'
                    : applyStatus === 'checking' ? 'Checking your controller…'
                        : applyStatus === 'conflict' ? 'Both copies have changed'
                            : applyStatus === 'failed' ? 'Couldn’t update controller settings'
                                : 'No settings saved on controller';
    const applyStatusColor = hasUnsavedChanges || applyStatus === 'apply-pending' || applyStatus === 'not-configured' || applyStatus === 'conflict'
        ? 'warning'
        : applyStatus === 'failed' ? 'danger'
            : applyStatus === 'applying' || applyStatus === 'checking' ? 'primary' : 'success';
    const applyStatusIcon = applyStatus === 'up-to-date' && !hasUnsavedChanges
        ? checkmarkCircleOutline
        : applyStatus === 'failed' ? alertCircleOutline : syncOutline;

    const replaceLocalFromController = (document: Parameters<typeof ControlConfigurationStore.replaceWithControllerDocument>[0]) => {
        ControlConfigurationStore.replaceWithControllerDocument(document);
        setHasUnsavedChanges(false);
        setPolicies(ControlConfigurationStore.getChannelPolicies());
        setLabels(ControlConfigurationStore.getCapabilityLabels());
    };

    const beginApply = async () => {
        setApplyConfirmOpen(false);
        if (!controller) return;
        if (ControlConfigurationStore.hasUnsavedChanges()) {
            setApplyResultMessage('You have changes that haven’t been saved yet. Save or discard them before applying your settings.');
            setApplyResultOpen(true);
            return;
        }
        let document;
        try { document = ControlConfigurationStore.getSavedDocument(); }
        catch (e) {
            console.error('[Prakiva] Could not read saved settings:', e);
            setApplyResultMessage('We couldn’t read your saved settings. Please save them again and retry.');
            setApplyResultOpen(true);
            return;
        }
        setApplyBusy(true);
        setApplyRecord(markConfigurationApplying(controller.deviceId));
        try {
            const result = await applyAppConfigurationToController(controller, sessionToken, document);
            const configurationUpdatedAt = new Date(result.configurationTimestamp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
            setApplyRecord(markConfigurationApplied(controller.deviceId, configurationUpdatedAt));
            setControllerMetadata({ configuration_exists: true, configuration_updated_at: configurationUpdatedAt, clock_valid: true });
            const previousSnapshot = await ControllerSynchronizationStore.load(controller.deviceId);
            if (previousSnapshot) {
                await ControllerSynchronizationStore.save({
                    ...previousSnapshot,
                    configuration: {
                        storage: 'littlefs',
                        configuration_exists: true,
                        configuration_timestamp: result.configurationTimestamp,
                        configuration: result.configuration,
                    },
                });
            }
            setApplyResultMessage('Your settings have been saved to your controller. Equipment will respond according to the features currently available on your controller.');
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown error';
            setApplyRecord(markConfigurationApplyFailed(controller.deviceId, message));
            console.error('[Prakiva] Applying controller settings failed:', e);
            setApplyResultMessage(`We couldn’t send your settings to the controller. Check the connection and try again. Details: ${message}`);
        } finally {
            setApplyBusy(false);
            setApplyResultOpen(true);
        }
    };

    const chooseControllerConfiguration = async () => {
        if (!controller) return;
        setSyncConflictOpen(false);
        try {
            const snapshot = await ControllerSynchronizationStore.load(controller.deviceId);
            const remoteDocument = snapshot?.configuration.configuration?.app_configuration;
            if (!snapshot || !snapshot.configuration.configuration_exists || !isControlConfigurationDocument(remoteDocument)) {
                throw new Error('The controller does not have a readable saved settings document.');
            }
            replaceLocalFromController(remoteDocument);
            VirtualSensorConfigurationStore.replaceFromController(
                controller.deviceId,
                snapshot.configuration.configuration?.virtual_sensors,
            );
            ActuationMethodStore.replaceFromController(controller.deviceId, snapshot.configuration.configuration?.actuator_channels);
            RemoteActuatorConfigurationStore.replaceFromController(
                controller.deviceId,
                snapshot.configuration.configuration?.remote_actuators,
            );
            const timestamp = snapshot.configuration.configuration_timestamp;
            const controllerTimestamp = typeof timestamp === 'number' && timestamp > 0
                ? new Date(timestamp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
            const record = markConfigurationSynchronized(controller.deviceId, controllerTimestamp);
            setApplyRecord(record);
            setControllerMetadata({ configuration_exists: true, configuration_updated_at: controllerTimestamp, clock_valid: true });
            setApplyResultMessage('Your controller’s saved settings have been restored to this phone.');
        } catch (e) {
            console.error('[Prakiva] Could not restore settings from controller:', e);
            setApplyResultMessage('We couldn’t retrieve the saved settings from your controller. Please reconnect and try again.');
        }
        setApplyResultOpen(true);
    };

    const choosePhoneConfiguration = () => {
        if (!controller) return;
        setApplyRecord(markLocalConfigurationPending(controller.deviceId));
        setSyncConflictOpen(false);
        setApplyConfirmOpen(true);
    };

    const openApplyAction = () => {
        setMenuOpen(false);
        if (hasUnsavedChanges) {
            setApplyResultMessage('You have changes that haven’t been saved yet. Save or discard them before applying your settings.');
            setApplyResultOpen(true);
            return;
        }
        setApplyConfirmOpen(true);
    };

    useEffect(() => {
        if (location.pathname !== '/controller-dashboard') return;
        let active = true;
        const load = async () => {
            if (!controller) { navigate('/home', { replace: true }); return; }
            setChecking(true); setError('');
            try {
                const session = await ControllerSessionStore.load(controller.deviceId);
                if (!session) { navigate('/controller-login', { replace: true, state: { controller } }); return; }
                const valid = await validateOwnerSession(controller.address, controller.httpPort, session.sessionToken);
                if (!active) return;
                if (!valid) {
                    await ControllerSessionStore.clear(controller.deviceId);
                    navigate('/controller-login', { replace: true, state: { controller } });
                    return;
                }
                setSessionToken(session.sessionToken);
                // Capabilities and firmware configuration were fetched after login. Read the
                // stored controller snapshot for the live catalogue and controller-issued status.
                const snapshot = await ControllerSynchronizationStore.load(controller.deviceId);
                if (snapshot && active) {
                    setControllerCapabilities(snapshot.capabilities.capabilities);
                    setCapabilities(snapshot.capabilities.capabilities);
                    setVirtualDeclarations(snapshot.capabilities.virtual_sensors ?? []);
                    const exists = snapshot.configuration.configuration_exists;
                    const unixTimestamp = snapshot.configuration.configuration_timestamp;
                    const timestamp = exists && typeof unixTimestamp === 'number' && unixTimestamp > 0
                        ? new Date(unixTimestamp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
                        : null;
                    setControllerMetadata({ configuration_exists: exists, configuration_updated_at: timestamp, clock_valid: true });
                    // Returning from an editor re-enters this effect. Do not let the
                    // last-login snapshot clear a locally saved change that is waiting
                    // to be applied to the controller.
                    const currentRecord = getControllerSyncRecord(controller.deviceId);
                    if (currentRecord.applyPending || ControlConfigurationStore.hasUnsavedChanges()) {
                        setApplyRecord(currentRecord);
                    } else {
                        setApplyRecord(markConfigurationSynchronized(controller.deviceId, timestamp));
                    }
                } else {
                    setCapabilities([]);
                    setVirtualDeclarations([]);
                    setError('Your controller information isn’t available right now. Please sign in again to reconnect.');
                    setApplyRecord(getControllerSyncRecord(controller.deviceId));
                }
            } catch (e) {
                if (active) console.error('[Prakiva] Could not load the controller dashboard:', e);
                if (active) setError('We couldn’t connect to your controller. Check the connection and try again.');
            } finally { if (active) setChecking(false); }
        };
        void load();
        return () => { active = false; };
    }, [location.pathname, controller, navigate]);

    // Dashboard visibility is based on committed configuration, not a default
    // inferred from the firmware's list of supported options.
    const actuators = useMemo(() => capabilities.filter(item =>
        item.kind === 'actuator' && item.channels.some(channel => {
            const key = channelPolicyKey(item.id, channel.id);
            const policy = policies[key];
            const supportedMethods = channel.supportedActuationMethods ?? [];
            // Local-only channels need no separate method-store entry: the
            // firmware declares their sole possible transport.
            const method = methods[key] ??
                (supportedMethods.length === 1 && supportedMethods[0] === 'local' ? 'local' : undefined);
            if (!policy || !channel.supportedPolicies.includes(policy)) return false;
            if (!method || !supportedMethods.includes(method)) return false;
            if (method === 'local') return true;
            if (method !== 'http-get' && method !== 'http-post') return false;
            // Remote settings are stored by driver. A missing endpoint is not
            // an operationally configured transport.
            const draft = controller && RemoteActuatorConfigurationStore.getEntry(controller.deviceId, `${item.id}_driver`);
            return !!draft?.parameters.endpoint_uri?.trim() &&
                /^https?:\/\//i.test(draft.parameters.endpoint_uri.trim());
        })
    ), [capabilities, policies, methods, controller]);

    const sensors = useMemo(() => capabilities.filter(item =>
        item.kind === 'sensor' && item.channels.some(channel => {
            if (!sensorWidgets[sensorChannelKey(item.id, channel.id)] ||
                sensorWidgets[sensorChannelKey(item.id, channel.id)] === 'none') return false;
            const declaration = virtualDeclarations.find(d => d.capability_id === item.id);
            if (!declaration?.supported_protocols?.length) return true; // Physical/local sensor.
            const entry = controller && VirtualSensorConfigurationStore.getEntry(controller.deviceId, declaration.component_id);
            const protocol = entry?.selected_protocol;
            if (!protocol || !declaration.supported_protocols.includes(protocol)) return false;
            if (protocol === 'local') return true;
            if (protocol !== 'http-get' && protocol !== 'http-post') return false;
            const endpoint = entry?.parameters.endpoint_uri;
            return typeof endpoint === 'string' && /^https?:\/\//i.test(endpoint.trim());
        })
    ), [capabilities, sensorWidgets, virtualDeclarations, controller]);

    const logout = async () => {
        if (!controller) return;
        setMenuOpen(false); setLoggingOut(true); setError('');
        try {
            if (sessionToken) await logoutOwner(controller.address, controller.httpPort, sessionToken);
        } catch (e) {
            console.error('[Prakiva] Controller sign-out could not be confirmed:', e);
            setError('We couldn’t confirm sign-out from your controller. Please try again.');
        } finally {
            await ControllerSessionStore.clear(controller.deviceId);
            navigate('/home', { replace: true });
            setLoggingOut(false);
        }
    };

    const openPolicy = (capability: ControllerCapability) => {
        navigate(`/control-editor/${encodeURIComponent(capability.id)}`, { state: { controller, capability: { ...capability, name: displayName(capability) }, capabilities } });
    };

    const displayName = (capability: ControllerCapability) => labels[capability.id]?.trim() || capability.name;

    if (!controller) return <IonPage><IonContent className="ion-padding"><p>Controller context is missing.</p><IonButton onClick={() => navigate('/home', { replace: true })}>Go to Home</IonButton></IonContent></IonPage>;

    return <IonPage>
        <IonHeader><IonToolbar>
            <IonButtons slot="start"><IonButton fill="clear" aria-label="Home" onClick={() => requestLeave(() => navigate('/home'))}><IonIcon icon={homeOutline} /></IonButton></IonButtons>
            <IonTitle>{controller.name}</IonTitle>
            <IonButtons slot="end">
                <IonButton className="configuration-menu-button" fill="clear" aria-label={`Apply configuration: ${applyStatusLabel}`} title={`Apply configuration — ${applyStatusLabel}`} onClick={openApplyAction} disabled={applyBusy}>
                    <IonIcon icon={applyBusy ? syncOutline : applyStatusIcon} color={applyStatusColor} className={applyBusy ? 'configuration-sync-spinning' : undefined} />
                    {hasUnsavedChanges && <IonBadge color="warning" className="configuration-status-dot"> </IonBadge>}
                </IonButton>
                <IonButton id="controller-menu-trigger" fill="clear" aria-label="Controller settings" onClick={() => setMenuOpen(true)}><IonIcon icon={settingsOutline} /></IonButton>
            </IonButtons>
        </IonToolbar></IonHeader>
        <ControllerMenu
            isOpen={menuOpen}
            onDidDismiss={() => setMenuOpen(false)}
            applyBusy={applyBusy}
            applyStatusColor={applyStatusColor}
            loggingOut={loggingOut}
            onControls={() => {
                setMenuOpen(false);
                requestLeave(() => navigate('/controls-configuration', { state: { controller } }));
            }}
            onSystemTiming={() => { setMenuOpen(false); requestLeave(() => navigate('/system-timing', { state: { controller } })); }}
            onWifi={() => {
                setMenuOpen(false);
                requestLeave(() => navigate('/wifi-configuration', { state: { controller } }));
            }}
            onTime={() => {
                setMenuOpen(false);
                requestLeave(() => navigate('/time-configuration', { state: { controller } }));
            }}
            onNetworkMonitor={() => {
                setMenuOpen(false);
                requestLeave(() => navigate('/controller-network-alerts', { state: { controller } }));
            }}
            onDiagnostics={() => {
                setMenuOpen(false);
                requestLeave(() => navigate('/controller-diagnostics', { state: { controller } }));
            }}
            onControllerInfo={() => {
                setMenuOpen(false);
                requestLeave(() => navigate('/controller-info', { state: { controller } }));
            }}
            onBackupRestore={() => { setMenuOpen(false); requestLeave(() => navigate('/controller-backup-restore', { state: { controller } })); }}
            onApply={openApplyAction}
            onLogout={() => {
                setMenuOpen(false);
                requestLeave(() => { void logout(); });
            }}
        />
        <IonContent className="prakiva-home ion-padding capability-dashboard">
            {error && <IonText color="danger"><p>{error}</p></IonText>}
            {saveError && <IonText color="danger"><p>{saveError}</p></IonText>}

            <ControllerClock address={controller.address} httpPort={controller.httpPort} sessionToken={sessionToken} />
            <h2 className="capability-section-title" aria-label="Actuators" title="Actuators"><IonIcon icon={cogOutline} aria-hidden="true" /></h2>
            <IonGrid className="capability-grid">
                <IonRow>
                    {actuators.map(capability => (
                        <ActuatorTile
                            key={capability.id}
                            displayName={displayName(capability)}
                            suggestedIcon={capability.icon}
                            onSelect={() => openPolicy(capability)}
                        />
                    ))}
                </IonRow>
            </IonGrid>

            <h2 className="capability-section-title" aria-label="Sensors" title="Sensors"><IonIcon icon={speedometerOutline} aria-hidden="true" /></h2>
            <IonGrid className="capability-grid">
                <IonRow>
                    {sensors.flatMap(capability => capability.channels.filter(channel => sensorWidgets[sensorChannelKey(capability.id, channel.id)] && sensorWidgets[sensorChannelKey(capability.id, channel.id)] !== 'none').map(channel => {
                        const key = sensorChannelKey(capability.id, channel.id);
                        return (
                            <SensorTile
                                key={key}
                                displayName={displayName(capability)}
                                suggestedIcon={capability.icon}
                                onSelect={() => navigate(
                                    `/sensor-detail/${encodeURIComponent(capability.id)}/${encodeURIComponent(channel.id)}`,
                                    {
                                        state: {
                                            controller,
                                            capability: { ...capability, name: displayName(capability) },
                                            channel,
                                            capabilities,
                                        },
                                    },
                                )}
                            />
                        );
                    }))}
                </IonRow>
            </IonGrid>
            {checking && <div className="dashboard-status dashboard-status-footer"><IonText color="medium">Checking controller session…</IonText></div>}
        </IonContent>

        <DashboardDialogs
            controllerName={controller.name}
            applyConfirmOpen={applyConfirmOpen}
            onApplyConfirmDismiss={() => setApplyConfirmOpen(false)}
            onApplyConfirm={beginApply}
            syncConflictOpen={syncConflictOpen}
            onSyncConflictDismiss={() => setSyncConflictOpen(false)}
            onChooseController={chooseControllerConfiguration}
            onChoosePhone={choosePhoneConfiguration}
            applyResultOpen={applyResultOpen}
            applyResultMessage={applyResultMessage}
            onApplyResultDismiss={() => setApplyResultOpen(false)}
            leaveAlertOpen={leaveAlertOpen}
            onLeaveAlertDismiss={onLeaveAlertDismiss}
            onSaveAndLeave={saveAndLeave}
            onDiscardAndLeave={discardAndLeave}
        />

    </IonPage>;
};

export default ControllerDashboard;
