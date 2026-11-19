import { useEffect, useRef, useState } from 'react';
import { IonAlert, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonText, IonTitle, IonToolbar, useIonViewDidEnter } from '@ionic/react';
import { arrowBack } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import type { ControlPolicy, ControllerCapability, SensorWidgetType } from '../config/controller-capabilities';
import { channelPolicyKey } from '../config/controller-capabilities';
import { ControlConfigurationStore, setControllerCapabilities } from '../services/control-configuration-store';
import { ControllerSynchronizationStore } from '../services/controller-synchronization-store';
import { VirtualSensorConfigurationStore, type VirtualSensorDraft } from '../services/virtual-sensor-configuration-store';
import { markLocalConfigurationPending } from '../services/configuration-apply';
import { ActuationMethodStore } from '../services/actuation-method-store';
import { RemoteActuatorConfigurationStore, type RemoteActuatorDraft } from '../services/remote-actuator-configuration-store';
import RemoteActuatorEditor from '../components/RemoteActuatorEditor';
import RemoteVirtualSensorEditor from '../components/RemoteVirtualSensorEditor';
import VirtualSensorParameterEditor from '../components/VirtualSensorParameterEditor';
import type { VirtualSensorDeclaration } from '../services/controller-api';
import ControlsConfigurationModal from '../components/controller-dashboard/ControlsConfigurationModal';
import '../theme/skins/default/styles/pages/Home.css';

interface PageState { controller?: SavedController }
type PolicyMap = Record<string, ControlPolicy>;
type WidgetMap = Record<string, SensorWidgetType>;
const ControlsConfigurationPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const controller = (location.state as PageState | null)?.controller;
    const [capabilities, setCapabilities] = useState<ControllerCapability[]>([]);
    const [policies, setPolicies] = useState<PolicyMap>({});
    const [labels, setLabels] = useState<Record<string, string>>({});
    const [sensorWidgets, setSensorWidgets] = useState<WidgetMap>({});
    const [remoteProtocols, setRemoteProtocols] = useState<Record<string, string[]>>({});
    const [selectedProtocols, setSelectedProtocols] = useState<Record<string, string>>({});
    const [error, setError] = useState('');
    const [methods, setMethods] = useState<Record<string, string>>({});
    const [actuatorEditor, setActuatorEditor] = useState<{ capabilityId: string; channelId: string } | null>(null);
    const [sensorEditor, setSensorEditor] = useState<VirtualSensorDeclaration | null>(null);
    const [localSensorEditor, setLocalSensorEditor] = useState<VirtualSensorDeclaration | null>(null);
    const [virtualDeclarations, setVirtualDeclarations] = useState<VirtualSensorDeclaration[]>([]);
    const [sensorSources, setSensorSources] = useState<Array<{ component_id: string; label: string }>>([]);
    const [remoteDrafts, setRemoteDrafts] = useState<Record<string, RemoteActuatorDraft>>({});
    const [sensorDrafts, setSensorDrafts] = useState<Record<string, Partial<VirtualSensorDraft>>>({});
    const [showLeaveAlert, setShowLeaveAlert] = useState(false);
    const [ready, setReady] = useState(false);
    const [entryRevision, setEntryRevision] = useState(0);
    // Ionic retains routed pages. Refresh their drafts on each entry rather than
    // treating a cached React component as a fresh configuration session.
    useIonViewDidEnter(() => {
        // A routed Ionic page may stay mounted between visits. Treat each entry
        // as a new editing transaction and reload from the committed stores.
        setReady(false);
        setEntryRevision(previous => previous + 1);
    });
    // A page-local transaction. The persistent stores are not changed by controls.
    const baseline = useRef('');
    const draftFingerprint = () => JSON.stringify({ policies, labels, sensorWidgets, methods, selectedProtocols, remoteDrafts, sensorDrafts });
    const isDirty = ready && draftFingerprint() !== baseline.current;


    useEffect(() => {
        if (!controller) return;
        let active = true;
        void ControllerSynchronizationStore.load(controller.deviceId).then(snapshot => {
            if (!active) return;
            if (!snapshot) { setError('Controller capabilities are unavailable. Return to the dashboard and reconnect.'); return; }
            const catalogue = snapshot.capabilities.capabilities;
            setControllerCapabilities(catalogue);
            setCapabilities(catalogue);
            setMethods(ActuationMethodStore.getAll(controller.deviceId));
            setVirtualDeclarations(snapshot.capabilities.virtual_sensors ?? []);
            const known = new Map((snapshot.capabilities.virtual_sensors ?? []).map(d => [d.capability_id, d.component_id]));
            setSensorSources(catalogue.filter(c => c.kind === 'sensor').map(c => ({ component_id: known.get(c.id) ?? `${c.id}_sensor_driver`, label: c.name })));
            setRemoteDrafts(RemoteActuatorConfigurationStore.getAll(controller.deviceId));
            const initialPolicies = ControlConfigurationStore.getChannelPolicies();
            setPolicies(initialPolicies);
            setLabels(ControlConfigurationStore.getCapabilityLabels());
            const widgets: WidgetMap = {};
            for (const capability of catalogue.filter(item => item.kind === 'sensor')) {
                const configured = ControlConfigurationStore.getControl(capability.id).sensorWidgets ?? {};
                for (const channel of capability.channels) widgets[`${capability.id}:${channel.id}`] = configured[channel.id] ?? 'none';
            }
            setSensorWidgets(widgets);
            const supported: Record<string, string[]> = {};
            const selected: Record<string, string> = {};
            for (const declaration of snapshot.capabilities.virtual_sensors ?? []) {
                if (!declaration.supported_protocols?.length) continue;
                supported[declaration.capability_id] = declaration.supported_protocols;
                const entry = VirtualSensorConfigurationStore.getEntry(controller.deviceId, declaration.component_id);
                const remote = (snapshot.configuration?.configuration?.virtual_sensors as Record<string, { selected_protocol?: string }> | undefined)?.[declaration.component_id];
                selected[declaration.capability_id] = entry?.selected_protocol ?? remote?.selected_protocol ?? '';
            }
            setRemoteProtocols(supported);
            setSelectedProtocols(selected);
            baseline.current = JSON.stringify({
                policies: initialPolicies,
                labels: ControlConfigurationStore.getCapabilityLabels(),
                sensorWidgets: widgets,
                methods: ActuationMethodStore.getAll(controller.deviceId),
                selectedProtocols: selected,
                remoteDrafts: RemoteActuatorConfigurationStore.getAll(controller.deviceId),
                sensorDrafts: {},
            });
            setReady(true);
        }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load controller configuration.'); });
        return () => { active = false; };
    }, [controller?.deviceId, entryRevision]);

    const discard = () => {
        // Restore the page-local draft before leaving: Ionic may keep this page
        // mounted, so navigation alone does not discard React state.
        const original = baseline.current;
        if (original) {
            const snapshot = JSON.parse(original) as {
                policies: PolicyMap;
                labels: Record<string, string>;
                sensorWidgets: WidgetMap;
                methods: Record<string, string>;
                selectedProtocols: Record<string, string>;
                remoteDrafts: Record<string, RemoteActuatorDraft>;
                sensorDrafts: Record<string, Partial<VirtualSensorDraft>>;
            };
            setPolicies(snapshot.policies);
            setLabels(snapshot.labels);
            setSensorWidgets(snapshot.sensorWidgets);
            setMethods(snapshot.methods);
            setSelectedProtocols(snapshot.selectedProtocols);
            setRemoteDrafts(snapshot.remoteDrafts);
            setSensorDrafts(snapshot.sensorDrafts);
        }
        setActuatorEditor(null);
        setSensorEditor(null);
        setLocalSensorEditor(null);
        setShowLeaveAlert(false);
        // Discard must terminate this editing transaction even if Ionic caches
        // the page. The next entry will rehydrate from committed stores.
        setReady(false);
        close();
    };
    const close = () => navigate('/controller-dashboard', { state: { controller } });
    const requestClose = () => { if (isDirty) setShowLeaveAlert(true); else close(); };
    const save = () => {
        if (!controller || !ready) return;
        try {
            // Commit the complete draft only after explicit Save.
            const oldPolicies = ControlConfigurationStore.getChannelPolicies();
            for (const capability of capabilities) {
                for (const channel of capability.channels) {
                    if (capability.kind === 'actuator') {
                        const key = channelPolicyKey(capability.id, channel.id);
                        if ((oldPolicies[key] ?? '') !== (policies[key] ?? '')) {
                            ControlConfigurationStore.setChannelPolicy(capability.id, channel.id, policies[key]);
                        }
                    } else {
                        const key = `${capability.id}:${channel.id}`;
                        const existingWidget = ControlConfigurationStore.getControl(capability.id).sensorWidgets?.[channel.id] ?? 'none';
                        if (existingWidget !== (sensorWidgets[key] ?? 'none')) {
                            ControlConfigurationStore.setSensorWidget(capability.id, channel.id, sensorWidgets[key] ?? 'none');
                        }
                    }
                }
                const existingLabel = ControlConfigurationStore.getCapabilityLabels()[capability.id] ?? '';
                if (existingLabel !== (labels[capability.id] ?? '')) {
                    ControlConfigurationStore.setCapabilityLabel(capability.id, labels[capability.id] ?? '');
                }
            }
            const originalMethods = ActuationMethodStore.getAll(controller.deviceId);
            for (const [key, method] of Object.entries(methods)) {
                if (originalMethods[key] === method) continue;
                const separator = key.indexOf(':');
                if (separator < 0) continue;
                ActuationMethodStore.set(controller.deviceId, key.slice(0, separator), key.slice(separator + 1), method);
            }
            for (const declaration of virtualDeclarations) {
                const original = VirtualSensorConfigurationStore.getEntry(controller.deviceId, declaration.component_id);
                const selected = selectedProtocols[declaration.capability_id];
                const patch = sensorDrafts[declaration.component_id];
                if (patch || (selected !== undefined && selected !== (original?.selected_protocol ?? ''))) {
                    VirtualSensorConfigurationStore.setRemote(controller.deviceId, declaration.component_id, {
                        ...patch, ...(selected !== undefined ? { selected_protocol: selected } : {}),
                    });
                }
            }
            const originalRemote = RemoteActuatorConfigurationStore.getAll(controller.deviceId);
            for (const [driverId, draft] of Object.entries(remoteDrafts)) {
                if (JSON.stringify(originalRemote[driverId]) !== JSON.stringify(draft)) {
                    RemoteActuatorConfigurationStore.setEntry(controller.deviceId, driverId, draft);
                }
            }
            ControlConfigurationStore.save();
            baseline.current = draftFingerprint();
            if (isDirty) markLocalConfigurationPending(controller.deviceId);
            close();
        } catch (e) { setError(e instanceof Error ? e.message : 'Could not save controls.'); }
    };
    return <IonPage>
        <IonHeader><IonToolbar>
            <IonButtons slot="start"><IonButton fill="clear" onClick={requestClose} aria-label="Back to dashboard"><IonIcon slot="icon-only" icon={arrowBack} /></IonButton></IonButtons>
            <IonTitle>Controls</IonTitle>
            <IonButtons slot="end"><IonButton onClick={save} disabled={!controller || !ready}>Save</IonButton></IonButtons>
        </IonToolbar></IonHeader>
        {!controller ? <IonContent className="ion-padding"><IonText color="danger">Controller context is missing.</IonText><IonButton onClick={() => navigate('/home', { replace: true })}>Home</IonButton></IonContent> :
        <>
            {error && <IonText color="danger"><p className="ion-padding">{error}</p></IonText>}
            {ready && <ControlsConfigurationModal
                key={entryRevision}
                methods={methods}
                onChangeMethod={(capabilityId, channelId, method) => {
                    setMethods(previous => ({ ...previous, [`${capabilityId}:${channelId}`]: method }));
                }}
                onConfigureActuator={(capabilityId, channelId) => setActuatorEditor({ capabilityId, channelId })}
                onConfigureSensor={capabilityId => {
                    const declaration = virtualDeclarations.find(d => d.capability_id === capabilityId);
                    if (!declaration) return;
                    if ((selectedProtocols[capabilityId] ?? 'local') === 'local') setLocalSensorEditor(declaration);
                    else setSensorEditor(declaration);
                }}
                virtualSensorParameters={Object.fromEntries(virtualDeclarations.map(d => [d.capability_id, Object.keys(d.parameters ?? {}).length > 0]))}
                capabilities={capabilities} remoteProtocols={remoteProtocols} selectedProtocols={selectedProtocols}
                onChangeRemoteProtocol={(capabilityId, protocol) => {
                    const componentId = virtualDeclarations.find(d => d.capability_id === capabilityId)?.component_id;
                    if (!componentId) return;
                    setSelectedProtocols(previous => ({ ...previous, [capabilityId]: protocol }));
                }}
                labels={labels} policies={policies} sensorWidgets={sensorWidgets}
                onSaveLabel={(id, value) => { setLabels(previous => ({ ...previous, [id]: value })); }}
                onChangePolicy={(capability, channelId, policy) => {
                    const key = channelPolicyKey(capability.id, channelId);
                    setPolicies(previous => { const next = { ...previous }; if (policy) next[key] = policy; else delete next[key]; return next; });

                }}
                onChangeSensorWidget={(capability, channelId, widget) => {
                    setSensorWidgets(previous => ({ ...previous, [`${capability.id}:${channelId}`]: widget }));
                }}
            />}
            {actuatorEditor && (() => {
                const cap = capabilities.find(c => c.id === actuatorEditor.capabilityId);
                const channel = cap?.channels.find(c => c.id === actuatorEditor.channelId);
                const driverId = `${actuatorEditor.capabilityId}_driver`;
                const selected = methods[`${actuatorEditor.capabilityId}:${actuatorEditor.channelId}`] ?? channel?.supportedActuationMethods?.[0] ?? '';
                const initial = remoteDrafts[driverId] ?? { selected_actuation_method: selected, parameters: { endpoint_uri: '' }, command_field: 'command', request: { include_controller_time: true, sensor_mappings: [], additional_json: {} } };
                return <RemoteActuatorEditor isOpen={true} initial={{ ...initial, selected_actuation_method: selected }} sensors={sensorSources} supportedMethods={channel?.supportedActuationMethods ?? []}
                    onDismiss={() => setActuatorEditor(null)} onSave={draft => {
                        setRemoteDrafts(previous => ({ ...previous, [driverId]: draft }));
                        setActuatorEditor(null);
                    }}/>
            })()}
            {localSensorEditor && <VirtualSensorParameterEditor
                isOpen={true}
                declaration={localSensorEditor}
                initialValues={{
                    ...(VirtualSensorConfigurationStore.getEntry(controller.deviceId, localSensorEditor.component_id)?.parameters ?? {}),
                    ...(sensorDrafts[localSensorEditor.component_id]?.parameters ?? {}),
                }}
                onDismiss={() => setLocalSensorEditor(null)}
                onSave={parameters => {
                    setSensorDrafts(previous => ({
                        ...previous,
                        [localSensorEditor.component_id]: {
                            ...previous[localSensorEditor.component_id], parameters,
                        },
                    }));
                    setLocalSensorEditor(null);
                }}
            />}
            {sensorEditor && <RemoteVirtualSensorEditor isOpen={true} declaration={sensorEditor}
                initial={{ ...(VirtualSensorConfigurationStore.getEntry(controller.deviceId, sensorEditor.component_id) ?? { parameters: {} }), ...sensorDrafts[sensorEditor.component_id], selected_protocol: selectedProtocols[sensorEditor.capability_id] ?? '' }}
                sensors={sensorSources} onDismiss={() => setSensorEditor(null)} onSave={patch => {
                    setSensorDrafts(previous => ({ ...previous, [sensorEditor.component_id]: { ...previous[sensorEditor.component_id], ...patch } }));
                    setSensorEditor(null);
                }}/>
            }
            <IonAlert isOpen={showLeaveAlert} onDidDismiss={() => setShowLeaveAlert(false)}
                header="Unsaved configuration"
                message="Save your changes before leaving Controls?"
                buttons={[
                    { text: 'Save and Leave', handler: save },
                    { text: 'Discard and Leave', role: 'destructive', handler: discard },
                    { text: 'Stay', role: 'cancel' },
                ]}/>
        </>}
    </IonPage>;
};
export default ControlsConfigurationPage;
