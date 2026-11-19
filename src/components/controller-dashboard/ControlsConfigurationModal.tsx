import { useState } from 'react';
import { IonButton, IonCard, IonCardContent, IonContent, IonInput, IonItem, IonLabel, IonSegment, IonSegmentButton, IonSelect, IonSelectOption, IonText } from '@ionic/react';
import { POLICY_LABELS } from '../../config/control-policies';
import { type ControlPolicy, type ControllerCapability, type SensorWidgetType, channelPolicyKey } from '../../config/controller-capabilities';

type PolicyMap = Record<string, ControlPolicy>;
interface Props {
    capabilities: ControllerCapability[];
    remoteProtocols: Record<string, string[]>;
    selectedProtocols: Record<string, string>;
    onChangeRemoteProtocol: (capabilityId: string, protocol: string) => void;
    labels: Record<string, string>;
    policies: PolicyMap;
    sensorWidgets: Record<string, SensorWidgetType>;
    onSaveLabel: (capabilityId: string, value: string) => void;
    onChangePolicy: (capability: ControllerCapability, channelId: string, policy: ControlPolicy | '') => void;
    onChangeSensorWidget: (capability: ControllerCapability, channelId: string, widget: SensorWidgetType) => void;
    methods: Record<string, string>;
    onChangeMethod: (capabilityId: string, channelId: string, method: string) => void;
    onConfigureActuator: (capabilityId: string, channelId: string) => void;
    onConfigureSensor: (capabilityId: string) => void;
    virtualSensorParameters: Record<string, boolean>;
}
const ControlsConfigurationModal: React.FC<Props> = ({ capabilities, remoteProtocols, selectedProtocols, onChangeRemoteProtocol, labels, policies, sensorWidgets, onSaveLabel, onChangePolicy, onChangeSensorWidget, methods, onChangeMethod, onConfigureActuator, onConfigureSensor, virtualSensorParameters }) => {
    const [tab, setTab] = useState<'actuator' | 'sensor'>('actuator');
    const [expanded, setExpanded] = useState<string | null>(null);
    return <IonContent className="ion-padding capability-mapping">
        <IonSegment value={tab} onIonChange={e => { setTab(e.detail.value as 'actuator' | 'sensor'); setExpanded(null); }}>
            <IonSegmentButton value="actuator"><IonLabel>Actuators</IonLabel></IonSegmentButton>
            <IonSegmentButton value="sensor"><IonLabel>Sensors</IonLabel></IonSegmentButton>
        </IonSegment>
        <IonText color="medium"><p>Configure channel presentation, policies and transport. Apply Configuration from the dashboard to update the controller.</p></IonText>
        {capabilities.filter(c => c.kind === tab).map(capability => <IonCard key={capability.id} className="mapping-card">
            <IonCardContent>
                <IonButton fill="clear" expand="block" style={{ textAlign: 'left', justifyContent: 'flex-start', width: '100%', '--padding-start': '0px', '--padding-end': '0px' } as React.CSSProperties} onClick={() => setExpanded(expanded === capability.id ? null : capability.id)}>
                    <span style={{ display: 'block', width: '100%', textAlign: 'left' }}>{labels[capability.id] || capability.name} ({capability.channels.length}) {expanded === capability.id ? '▴' : '▾'}</span>
                </IonButton>
                {expanded === capability.id && <>
                    <IonText color="medium"><p>Controller ID: {capability.id}</p></IonText>
                    <IonItem><IonLabel position="stacked">Display name</IonLabel><IonInput value={labels[capability.id] ?? capability.name} onIonInput={e => onSaveLabel(capability.id, e.detail.value ?? '')}/></IonItem>
                    {capability.kind === 'sensor' && remoteProtocols[capability.id] && <IonItem>
                        <IonLabel position="stacked">Sensor protocol</IonLabel>
                        <IonSelect value={selectedProtocols[capability.id] ?? ''} onIonChange={e => onChangeRemoteProtocol(capability.id, e.detail.value ?? '')}>
                            <IonSelectOption value="">Not configured</IonSelectOption>
                            {remoteProtocols[capability.id].map(protocol => <IonSelectOption key={protocol} value={protocol}>{protocol}</IonSelectOption>)}
                        </IonSelect>
                    </IonItem>}
                    {capability.kind === 'sensor' && (virtualSensorParameters[capability.id] || remoteProtocols[capability.id]) && <IonButton size="small" fill="outline"
                        disabled={!!remoteProtocols[capability.id] && !selectedProtocols[capability.id]}
                        onClick={() => onConfigureSensor(capability.id)}>
                        {selectedProtocols[capability.id] && selectedProtocols[capability.id] !== 'local' ? 'Configure protocol' : 'Configure parameters'}
                    </IonButton>}
                    {capability.channels.map(channel => {
                        const key = channelPolicyKey(capability.id, channel.id);
                        const supported = channel.supportedActuationMethods ?? [];
                        const selected = methods[key] ?? supported[0] ?? '';
                        return <div key={channel.id} style={{ marginTop: 16, padding: 12, border: '1px solid var(--ion-color-step-200)', borderRadius: 8 }}>
                            <IonText><strong>{channel.label}</strong></IonText>
                            {capability.kind === 'actuator' ? <>
                                <IonItem><IonLabel position="stacked">Control policy</IonLabel><IonSelect value={policies[key] ?? ''} onIonChange={e => onChangePolicy(capability, channel.id, (e.detail.value ?? '') as ControlPolicy | '')}>
                                    <IonSelectOption value="">Not configured</IonSelectOption>
                                    {channel.supportedPolicies.filter(p => p !== 'periodic_pulse').map(p => <IonSelectOption key={p} value={p}>{POLICY_LABELS[p]}</IonSelectOption>)}
                                </IonSelect></IonItem>
                                <IonItem><IonLabel position="stacked">Actuation method</IonLabel><IonSelect value={selected} disabled={supported.length <= 1} onIonChange={e => onChangeMethod(capability.id, channel.id, e.detail.value)}>
                                    {supported.map(method => <IonSelectOption key={method} value={method}>{method.toUpperCase()}</IonSelectOption>)}
                                </IonSelect></IonItem>
                                {(selected === 'http-get' || selected === 'http-post') && <IonButton fill="outline" size="small" onClick={() => onConfigureActuator(capability.id, channel.id)}>Configure HTTP</IonButton>}
                            </> : <IonItem><IonLabel position="stacked">Display widget</IonLabel><IonSelect value={sensorWidgets[key] === 'text' ? 'linear' : (sensorWidgets[key] ?? 'none')} onIonChange={e => onChangeSensorWidget(capability, channel.id, (e.detail.value ?? 'none') as SensorWidgetType)}>
                                <IonSelectOption value="none">Not configured</IonSelectOption><IonSelectOption value="linear">Linear gauge</IonSelectOption><IonSelectOption value="gauge">Circular dial</IonSelectOption>
                            </IonSelect></IonItem>}
                        </div>;
                    })}
                </>}
            </IonCardContent>
        </IonCard>)}
    </IonContent>;
};
export default ControlsConfigurationModal;
