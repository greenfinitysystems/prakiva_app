import { useEffect, useMemo, useState } from 'react';
import {
    IonActionSheet, IonAlert, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCol, IonContent,
    IonGrid, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonModal, IonPage, IonPopover,
    IonRow, IonSelect, IonSelectOption, IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import {
    homeOutline, logOutOutline, settingsOutline, informationCircleOutline, timeOutline, wifiOutline,
    syncOutline, checkmarkCircleOutline, alertCircleOutline, archiveOutline, cloudUploadOutline,
} from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { logoutOwner, validateOwnerSession } from '../services/controller-api';
import { applyAppConfigurationToController } from '../services/controller-configuration-adapter';
import { ControllerSynchronizationStore } from '../services/controller-synchronization-store';
import { ControllerSessionStore } from '../services/controller-session-store';
import { ControlConfigurationStore, isControlConfigurationDocument, setControllerCapabilities } from '../services/control-configuration-store';
import {
    getConfigurationSyncStatus, getControllerSyncRecord,
    markConfigurationApplied, markConfigurationApplying, markConfigurationApplyFailed,
    markLocalConfigurationPending, markConfigurationSynchronized,
    type ControllerSyncRecord, type ConfigurationSyncStatus, type ControllerConfigurationMetadata,
} from '../services/configuration-apply';
import { DEFAULT_CONTROL_POLICIES, POLICY_LABELS } from '../config/control-policies';
import { type ControlPolicy, type ControllerCapability, channelPolicyKey } from '../config/controller-capabilities';
import './Home.css';
import './ControllerDashboard.css';

interface DashboardState { controller?: SavedController }
type PolicyMap = Record<string, ControlPolicy>;
type LabelMap = Record<string, string>;
const ControllerDashboard: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const controller = (location.state as DashboardState | null)?.controller;
    const [checking, setChecking] = useState(true);
    const [error, setError] = useState('');
    const [sessionToken, setSessionToken] = useState('');
    const [loggingOut, setLoggingOut] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [policies, setPolicies] = useState<PolicyMap>({});
    const [labels, setLabels] = useState<LabelMap>({});
    const [capabilities, setCapabilities] = useState<ControllerCapability[]>([]);
    const [mappingOpen, setMappingOpen] = useState(false);
    const [sensorDetail, setSensorDetail] = useState<ControllerCapability | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [applyRecord, setApplyRecord] = useState<ControllerSyncRecord | null>(() => controller ? getControllerSyncRecord(controller.deviceId) : null);
    const [controllerMetadata, setControllerMetadata] = useState<ControllerConfigurationMetadata | null>(null);
    const [syncConflictOpen, setSyncConflictOpen] = useState(false);
    const [applyBusy, setApplyBusy] = useState(false);
    const [applyConfirmOpen, setApplyConfirmOpen] = useState(false);
    const [applyResultOpen, setApplyResultOpen] = useState(false);
    const [applyResultMessage, setApplyResultMessage] = useState('');
    const [saveError, setSaveError] = useState('');
    const [leaveAlertOpen, setLeaveAlertOpen] = useState(false);
    const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

    useEffect(() => {
        if (!capabilities.length) return;
        const refreshDraft = () => {
            setHasUnsavedChanges(ControlConfigurationStore.hasUnsavedChanges());
            if (controller) setApplyRecord(getControllerSyncRecord(controller.deviceId));
            setPolicies({ ...DEFAULT_CONTROL_POLICIES, ...ControlConfigurationStore.getChannelPolicies() });
            setLabels(ControlConfigurationStore.getCapabilityLabels());
        };
        refreshDraft();
        return ControlConfigurationStore.subscribe(refreshDraft);
    }, [controller?.deviceId, capabilities]);

    useEffect(() => {
        const onSyncStateChanged = (event: Event) => {
            const detail = (event as CustomEvent<{ controllerId?: string }>).detail;
            if (controller && detail?.controllerId === controller.deviceId) {
                setApplyRecord(getControllerSyncRecord(controller.deviceId));
            }
        };
        window.addEventListener('prakiva:configuration-sync-state-changed', onSyncStateChanged);
        return () => window.removeEventListener('prakiva:configuration-sync-state-changed', onSyncStateChanged);
    }, [controller?.deviceId]);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!capabilities.length || !ControlConfigurationStore.hasUnsavedChanges()) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [capabilities.length]);

    // Ionic keeps previous routes mounted. Register global navigation handlers
    // only while the Dashboard is the active route.
    useEffect(() => {
        if (location.pathname !== '/controller-dashboard') return;
        const onHardwareBack = (event: Event) => {
            const backEvent = event as CustomEvent<{ register: (priority: number, handler: () => void) => void }>;
            backEvent.detail?.register(101, () => requestLeave(() => navigate(-1)));
        };
        document.addEventListener('ionBackButton', onHardwareBack);
        return () => document.removeEventListener('ionBackButton', onHardwareBack);
    }, [location.pathname, navigate]);

    useEffect(() => {
        if (location.pathname !== '/controller-dashboard') return;
        const onBrowserBack = (event: PopStateEvent) => {
            if (!ControlConfigurationStore.hasUnsavedChanges()) return;
            event.stopImmediatePropagation();
            window.history.pushState(window.history.state, '', `${location.pathname}${location.search}${location.hash}`);
            // The attempted back and the protective push are both in history.
            requestLeave(() => navigate(-2));
        };
        window.addEventListener('popstate', onBrowserBack, true);
        return () => window.removeEventListener('popstate', onBrowserBack, true);
    }, [location.pathname, location.search, location.hash, navigate]);

    const saveConfiguration = () => {
        setSaveError('');
        try {
            ControlConfigurationStore.save();
            if (controller) setApplyRecord(markLocalConfigurationPending(controller.deviceId));
            setHasUnsavedChanges(false);
            return true;
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : 'Could not save configuration.');
            return false;
        }
    };

    const requestLeave = (action: () => void) => {
        if (!ControlConfigurationStore.hasUnsavedChanges()) { action(); return; }
        setPendingLeave(() => action);
        setLeaveAlertOpen(true);
    };
    const saveAndLeave = () => {
        if (!saveConfiguration()) return false;
        setLeaveAlertOpen(false); pendingLeave?.(); setPendingLeave(null);
        return true;
    };
    const discardAndLeave = () => {
        try { ControlConfigurationStore.discard(); setLeaveAlertOpen(false); pendingLeave?.(); setPendingLeave(null); }
        catch (e) { setSaveError(e instanceof Error ? e.message : 'Could not discard changes.'); return false; }
        return true;
    };

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
        setPolicies({ ...DEFAULT_CONTROL_POLICIES, ...ControlConfigurationStore.getChannelPolicies() });
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
            setApplyResultMessage('We couldn’t send your settings to the controller. Check the connection and try again.');
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
    }, [location.pathname, controller?.deviceId, controller?.address, controller?.httpPort, navigate]);

    // Only expose actuators after the user has assigned a compatible control policy.
    const actuators = useMemo(() => capabilities.filter(item => item.kind === 'actuator' && item.channels.some(ch => !!policies[channelPolicyKey(item.id,ch.id)])), [capabilities, policies]);
    const sensors = useMemo(() => capabilities.filter(item => item.kind === 'sensor'), [capabilities]);

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

    const saveLabel = (id: string, value: string) => {
        const next = { ...labels, [id]: value }; setLabels(next);
        ControlConfigurationStore.setCapabilityLabel(id, value);
    };

    const changePolicy = (capability: ControllerCapability, channelId: string, policy: ControlPolicy | '') => {
        const next = { ...policies }; const key = channelPolicyKey(capability.id, channelId);
        const channel = capability.channels.find(ch => ch.id === channelId);
        if (policy && channel?.supportedPolicies.includes(policy)) next[key] = policy;
        else delete next[key];
        setPolicies(next);
        ControlConfigurationStore.setChannelPolicy(capability.id, channelId, policy || undefined);
    };

    const openCapability = (capability: ControllerCapability) => {
        if (capability.kind === 'sensor') { setSensorDetail(capability); return; }
        openPolicy(capability);
    };

    const renderCapability = (capability: ControllerCapability) => {
        const isSensor = capability.kind === 'sensor';
        const configured = capability.channels.filter(ch => !!policies[channelPolicyKey(capability.id,ch.id)]).length;
        return (
            <IonCol size="6" size-sm="4" size-md="3" key={capability.id}>
                <IonCard button className={`capability-tile ${isSensor ? 'sensor-tile' : ''}`} onClick={() => requestLeave(() => openCapability(capability))}>
                    <IonCardContent className="capability-tile-content">
                        <IonText className="capability-name">{displayName(capability).toLocaleUpperCase()}</IonText>
                        <IonText className="capability-meta">
                            {isSensor ? `Sensor · ${capability.channels.map(ch=>ch.unit).filter(Boolean).join(', ')}` : `${capability.channels.length} channel${capability.channels.length===1?'':'s'} · ${configured} configured`}
                        </IonText>
                    </IonCardContent>
                </IonCard>
            </IonCol>
        );
    };

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
        <IonPopover trigger="controller-menu-trigger" isOpen={menuOpen} onDidDismiss={() => setMenuOpen(false)} side="bottom" alignment="end">
            <IonList lines="none">
                <IonItem button onClick={() => { setMenuOpen(false); setMappingOpen(true); }}>
                    <IonIcon slot="start" icon={settingsOutline} /><IonLabel>Controls</IonLabel>
                </IonItem>
                <IonItem button onClick={() => { setMenuOpen(false); requestLeave(() => navigate('/wifi-configuration', { state: { controller } })); }}>
                    <IonIcon slot="start" icon={wifiOutline} /><IonLabel>Wi-Fi</IonLabel>
                </IonItem>
                <IonItem button onClick={() => { setMenuOpen(false); requestLeave(() => navigate('/time-configuration', { state: { controller } })); }}>
                    <IonIcon slot="start" icon={timeOutline} /><IonLabel>Time</IonLabel>
                </IonItem>
                <IonItem button onClick={() => { setMenuOpen(false); requestLeave(() => navigate('/controller-info', { state: { controller } })); }}>
                    <IonIcon slot="start" icon={informationCircleOutline} /><IonLabel>Controller</IonLabel>
                </IonItem>
                <IonItem button disabled>
                    <IonIcon slot="start" icon={archiveOutline} /><IonLabel>
                        <h2>Backup &amp; Restore</h2>
                        <p>Available in the next phase</p>
                    </IonLabel>
                </IonItem>
                <IonItem button disabled={applyBusy} onClick={openApplyAction}>
                    <IonIcon slot="start" icon={cloudUploadOutline} color={applyStatusColor} />
                    <IonLabel>
                        <h2>Apply Configuration</h2>
                        <p>{applyStatusLabel}</p>
                    </IonLabel>
                </IonItem>
                <IonItem button disabled={loggingOut} onClick={() => requestLeave(() => { void logout(); })}>
                    <IonIcon slot="start" icon={logOutOutline} /><IonLabel>{loggingOut ? 'Logging out…' : 'Logout'}</IonLabel>
                </IonItem>
            </IonList>
        </IonPopover>
        <IonModal isOpen={mappingOpen} onDidDismiss={() => setMappingOpen(false)}>
            <IonHeader><IonToolbar>
                <IonTitle>Controls</IonTitle>
                <IonButtons slot="end"><IonButton onClick={() => setMappingOpen(false)}>Done</IonButton></IonButtons>
            </IonToolbar></IonHeader>
            <IonContent className="ion-padding capability-mapping">
                <IonText color="medium"><p>The controller advertises each channel and its physical type. Name the logical control and assign a policy independently to each channel.</p></IonText>
                {capabilities.map(capability => (
                    <IonCard key={capability.id} className="mapping-card"><IonCardContent>
                        <IonText className="mapping-id">Controller ID: {capability.id}</IonText>
                        <IonItem lines="none">
                            <IonLabel position="stacked">Control name</IonLabel>
                            <IonInput value={labels[capability.id] ?? capability.name} onIonInput={e => saveLabel(capability.id, e.detail.value ?? '')} placeholder={capability.id} />
                        </IonItem>
                        {capability.channels.map(channel => <IonItem key={channel.id} lines="none">
                            <IonLabel position="stacked">{channel.label} · {channel.valueType === 'analog' ? `Analogue${channel.unit ? ` (${channel.unit})` : ''}` : 'Binary'} </IonLabel>
                            {capability.kind === 'actuator' ? <IonSelect value={policies[channelPolicyKey(capability.id,channel.id)] ?? ''} placeholder="Not configured" onIonChange={e => changePolicy(capability, channel.id, (e.detail.value ?? '') as ControlPolicy | '')}>
                                <IonSelectOption value="">Not configured</IonSelectOption>
                                {channel.supportedPolicies.map(policy => <IonSelectOption key={policy} value={policy}>{POLICY_LABELS[policy]}</IonSelectOption>)}
                            </IonSelect> : <IonText color="medium">Monitoring channel</IonText>}
                        </IonItem>)}
                    </IonCardContent></IonCard>
                ))}
            </IonContent>
        </IonModal>

        <IonContent className="prakiva-home ion-padding capability-dashboard">
            {checking && <div className="dashboard-status"><IonText color="medium">Checking controller session…</IonText></div>}
            {error && <IonText color="danger"><p>{error}</p></IonText>}
            {saveError && <IonText color="danger"><p>{saveError}</p></IonText>}

            <h2 className="capability-section-title">Actuators</h2>
            <IonGrid className="capability-grid"><IonRow>{actuators.map(renderCapability)}</IonRow></IonGrid>

            <h2 className="capability-section-title">Sensors</h2>
            <IonGrid className="capability-grid"><IonRow>{sensors.map(renderCapability)}</IonRow></IonGrid>
            <p className="capability-dashboard-note">Your controller provides the available equipment and sensor options. Save your settings, then apply them to your controller.</p>
        </IonContent>

        <IonAlert isOpen={applyConfirmOpen} header="Apply Configuration" message={`Send your saved aquarium settings to ${controller.name}?`} onDidDismiss={() => setApplyConfirmOpen(false)} buttons={[
            { text: 'Cancel', role: 'cancel' },
            { text: 'Apply', handler: () => { void beginApply(); } },
        ]} />
        <IonAlert isOpen={syncConflictOpen} header="Configuration conflict" message="This phone has saved changes, and the controller has also changed since the last synchronisation. Which copy should be retained?" onDidDismiss={() => setSyncConflictOpen(false)} buttons={[
            { text: 'Use Controller', role: 'destructive', handler: () => { void chooseControllerConfiguration(); } },
            { text: 'Use This Phone', handler: choosePhoneConfiguration },
            { text: 'Decide Later', role: 'cancel' },
        ]} />
        <IonAlert isOpen={applyResultOpen} header="Configuration status" message={applyResultMessage} onDidDismiss={() => setApplyResultOpen(false)} buttons={[{ text: 'OK', role: 'confirm' }]} />

        <IonAlert isOpen={leaveAlertOpen} header="Unsaved changes" message="You have changes that have not been saved. What would you like to do?" onDidDismiss={() => { setLeaveAlertOpen(false); setPendingLeave(null); }} buttons={[
            { text: 'Save and leave', handler: saveAndLeave },
            { text: 'Discard and leave', role: 'destructive', handler: discardAndLeave },
            { text: 'Stay', role: 'cancel' },
        ]} />

        <IonActionSheet
            isOpen={!!sensorDetail}
            header={sensorDetail?.name ?? 'Sensor'}
            subHeader={sensorDetail ? `Advertised capability: ${sensorDetail.id} · ${sensorDetail.channels.map(ch => `${ch.label}: ${ch.valueType}${ch.unit ? ` ${ch.unit}` : ''}`).join(' · ')}` : undefined}
            onDidDismiss={() => setSensorDetail(null)}
            buttons={[{ text: 'Close', role: 'cancel' }]}
        />
    </IonPage>;
};

export default ControllerDashboard;
