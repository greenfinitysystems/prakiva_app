import {
    IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader,
    IonInput, IonItem, IonLabel, IonModal, IonSelect, IonSelectOption,
    IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import { POLICY_LABELS } from '../../config/control-policies';
import {
    type ControlPolicy, type ControllerCapability, type SensorWidgetType,
    channelPolicyKey,
} from '../../config/controller-capabilities';

type PolicyMap = Record<string, ControlPolicy>;
type LabelMap = Record<string, string>;
type SensorWidgetMap = Record<string, SensorWidgetType>;

interface ControlsConfigurationModalProps {
    isOpen: boolean;
    capabilities: ControllerCapability[];
    labels: LabelMap;
    policies: PolicyMap;
    sensorWidgets: SensorWidgetMap;
    onDismiss: () => void;
    onDone: () => void;
    onSaveLabel: (capabilityId: string, value: string) => void;
    onChangePolicy: (
        capability: ControllerCapability,
        channelId: string,
        policy: ControlPolicy | '',
    ) => void;
    onChangeSensorWidget: (
        capability: ControllerCapability,
        channelId: string,
        widget: SensorWidgetType,
    ) => void;
}

/**
 * App-local presentation and editing preferences for controller capabilities.
 * This component deliberately does not apply configuration to the controller.
 */
const ControlsConfigurationModal: React.FC<ControlsConfigurationModalProps> = ({
    isOpen,
    capabilities,
    labels,
    policies,
    sensorWidgets,
    onDismiss,
    onDone,
    onSaveLabel,
    onChangePolicy,
    onChangeSensorWidget,
}) => (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss}>
        <IonHeader><IonToolbar>
            <IonTitle>Controls</IonTitle>
            <IonButtons slot="end">
                <IonButton onClick={onDone}>Done</IonButton>
            </IonButtons>
        </IonToolbar></IonHeader>
        <IonContent className="ion-padding capability-mapping">
            <IonText color="medium"><p>Choose how each channel is presented and edited in this app. These selections are saved locally on this device; they do not change the controller's hardware behaviour. Use Apply Configuration only after changing an actuator's actual operating settings.</p></IonText>
            {capabilities.map(capability => (
                <IonCard key={capability.id} className="mapping-card"><IonCardContent>
                    <IonText className="mapping-id">Controller ID: {capability.id}</IonText>
                    <IonItem lines="none">
                        <IonLabel position="stacked">Control name</IonLabel>
                        <IonInput
                            value={labels[capability.id] ?? capability.name}
                            onIonInput={e => onSaveLabel(capability.id, e.detail.value ?? '')}
                            placeholder={capability.id}
                        />
                    </IonItem>
                    {capability.channels.map(channel => <IonItem key={channel.id} lines="none">
                        <IonLabel position="stacked">
                            {channel.label} · {channel.valueType === 'analog' ? `Analogue${channel.unit ? ` (${channel.unit})` : ''}` : channel.valueType === 'trigger' ? 'Operation trigger' : 'Binary'}
                        </IonLabel>
                        {capability.kind === 'actuator' ? (
                            <IonSelect
                                value={policies[channelPolicyKey(capability.id, channel.id)] ?? ''}
                                placeholder="Not configured"
                                onIonChange={e => onChangePolicy(
                                    capability,
                                    channel.id,
                                    (e.detail.value ?? '') as ControlPolicy | '',
                                )}
                            >
                                <IonSelectOption value="">Not configured</IonSelectOption>
                                {channel.supportedPolicies.filter(policy => policy !== 'periodic_pulse').map(policy => (
                                    <IonSelectOption key={policy} value={policy}>
                                        {POLICY_LABELS[policy]}
                                    </IonSelectOption>
                                ))}
                            </IonSelect>
                        ) : (
                            <IonSelect
                                value={sensorWidgets[`${capability.id}:${channel.id}`] ?? 'none'}
                                placeholder="Not configured"
                                onIonChange={e => onChangeSensorWidget(
                                    capability,
                                    channel.id,
                                    (e.detail.value ?? 'none') as SensorWidgetType,
                                )}
                            >
                                <IonSelectOption value="none">Not Configured</IonSelectOption>
                                <IonSelectOption value="text">Plain Text</IonSelectOption>
                                <IonSelectOption value="gauge">Gauge</IonSelectOption>
                            </IonSelect>
                        )}
                    </IonItem>)}
                </IonCardContent></IonCard>
            ))}
        </IonContent>
    </IonModal>
);

export default ControlsConfigurationModal;
