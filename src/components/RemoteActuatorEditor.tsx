import { validateHttpEndpoint } from '../services/http-endpoint-validation';
import { useEffect, useState } from 'react';
import { IonButton, IonButtons, IonCheckbox, IonContent, IonFooter, IonHeader, IonInput, IonItem, IonLabel, IonList, IonModal, IonSelect, IonSelectOption, IonTextarea, IonText, IonTitle, IonToolbar } from '@ionic/react';
import type { RemoteActuatorDraft } from '../services/remote-actuator-configuration-store';
import type { RemoteSensorRequest } from '../services/virtual-sensor-configuration-store';

interface Props {
    isOpen: boolean;
    initial: RemoteActuatorDraft;
    sensors: Array<{ component_id: string; label: string }>;
    supportedMethods: string[];
    onDismiss: () => void;
    onSave: (draft: RemoteActuatorDraft) => void;
}
const emptyRequest = (): RemoteSensorRequest => ({ include_controller_time: true, sensor_mappings: [], additional_json: {} });
const RemoteActuatorEditor: React.FC<Props> = ({ isOpen, initial, sensors, supportedMethods, onDismiss, onSave }) => {
    const [uri, setUri] = useState('');
    const [protocol, setProtocol] = useState('http-post');
    const [commandField, setCommandField] = useState('command');
    const [request, setRequest] = useState<RemoteSensorRequest>(emptyRequest);
    const [json, setJson] = useState('{}');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!isOpen) return;
        setUri(String(initial.parameters.endpoint_uri ?? ''));
        setProtocol(initial.selected_actuation_method);
        setCommandField(initial.command_field);
        const next = initial.request ?? emptyRequest();
        setRequest(next);
        setJson(JSON.stringify(next.additional_json ?? {}, null, 2));
        setError('');
    }, [isOpen, initial]);
    const updateMapping = (component_id: string, change: { include?: boolean; field?: string }) => {
        setRequest(previous => {
            const mappings = [...previous.sensor_mappings];
            const index = mappings.findIndex(m => m.component_id === component_id);
            const current = index >= 0 ? mappings[index] : { component_id, field: '', include: false };
            const updated = { ...current, ...change };
            if (index >= 0) mappings[index] = updated;
            else mappings.push(updated);
            return { ...previous, sensor_mappings: mappings };
        });
    };
    const save = () => {
        try {
            const additional: unknown = JSON.parse(json);
            if (!additional || typeof additional !== 'object' || Array.isArray(additional)) throw new Error('Static JSON must be an object.');
            const included = request.sensor_mappings.filter(m => m.include);
            if (included.some(m => !m.field.trim())) throw new Error('Every included sensor needs a field name.');
            if (new Set(included.map(m => m.field.trim())).size !== included.length) throw new Error('Sensor field names must be unique.');
            const endpoint = validateHttpEndpoint(uri);
            if (!commandField.trim()) throw new Error('Command field is required.');
            if (included.some(m => m.field.trim() === commandField.trim()) || Object.prototype.hasOwnProperty.call(additional, commandField.trim())) throw new Error('Command field must not conflict with sensor fields or static JSON.');
            onSave({
                selected_actuation_method: protocol,
                command_field: commandField.trim(),
                parameters: { endpoint_uri: endpoint },
                request: { ...request, sensor_mappings: included.map(m => ({ ...m, field: m.field.trim() })), additional_json: additional as Record<string, unknown> },
            });
        } catch (e) { setError(e instanceof Error ? e.message : 'Invalid JSON'); }
    };
    return <IonModal isOpen={isOpen} onDidDismiss={onDismiss}>
        <IonHeader><IonToolbar><IonTitle>Remote Actuator Configuration</IonTitle><IonButtons slot="end"><IonButton onClick={onDismiss}>Close</IonButton></IonButtons></IonToolbar></IonHeader>
        <IonContent className="ion-padding">
            <IonText color="medium"><p>Configure HTTP transport and the numeric command field. Save locally, then Apply Configuration from the dashboard.</p></IonText>
            <IonItem><IonLabel position="stacked">Actuation method</IonLabel><IonSelect value={protocol} disabled>{supportedMethods.map(method => <IonSelectOption key={method} value={method}>{method.toUpperCase()}</IonSelectOption>)}</IonSelect></IonItem>
            <IonItem><IonLabel position="stacked">Endpoint URI <span aria-label="required" style={{ color: 'var(--ion-color-danger)' }}>*</span></IonLabel><IonInput required type="url" value={uri} onIonInput={e => setUri(e.detail.value ?? '')}/></IonItem>
            <IonItem><IonLabel position="stacked">Command JSON field</IonLabel><IonInput value={commandField} onIonInput={e => setCommandField(e.detail.value ?? '')}/></IonItem>
            <IonItem><IonCheckbox slot="start" checked={request.include_controller_time} onIonChange={e => setRequest(r => ({ ...r, include_controller_time: e.detail.checked }))}/><IonLabel>Include controller time</IonLabel></IonItem>
            <IonText><p>Sensor collection</p></IonText>
            <IonList>{sensors.map(sensor => {
                const mapping = request.sensor_mappings.find(m => m.component_id === sensor.component_id);
                return <IonItem key={sensor.component_id}>
                    <IonCheckbox slot="start" checked={mapping?.include ?? false} onIonChange={e => updateMapping(sensor.component_id, { include: e.detail.checked })}/>
                    <IonLabel position="stacked">{sensor.label}</IonLabel>
                    <IonInput placeholder="JSON field name" value={mapping?.field ?? ''} onIonInput={e => updateMapping(sensor.component_id, { field: e.detail.value ?? '' })}/>
                </IonItem>;
            })}</IonList>
            <IonItem><IonLabel position="stacked">Additional static JSON</IonLabel><IonTextarea autoGrow value={json} onIonInput={e => setJson(e.detail.value ?? '')}/></IonItem>
            {error && <IonText color="danger"><p>{error}</p></IonText>}
        </IonContent>
        <IonFooter><IonToolbar><IonButtons slot="end"><IonButton onClick={save}>Save locally</IonButton></IonButtons></IonToolbar></IonFooter>
    </IonModal>;
};
export default RemoteActuatorEditor;
