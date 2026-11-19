import { validateHttpEndpoint } from '../services/http-endpoint-validation';
import { useEffect, useState } from 'react';
import { IonButton, IonButtons, IonCheckbox, IonContent, IonFooter, IonHeader, IonInput, IonItem, IonLabel, IonList, IonModal, IonTextarea, IonText, IonTitle, IonToolbar } from '@ionic/react';
import type { VirtualSensorDeclaration } from '../services/controller-api';
import type { RemoteSensorRequest, VirtualSensorDraft } from '../services/virtual-sensor-configuration-store';

interface Props {
    isOpen: boolean;
    declaration: VirtualSensorDeclaration;
    initial: VirtualSensorDraft;
    sensors: Array<{ component_id: string; label: string }>;
    onDismiss: () => void;
    onSave: (patch: Partial<VirtualSensorDraft>) => void;
}
const emptyRequest = (): RemoteSensorRequest => ({ include_controller_time: true, sensor_mappings: [], additional_json: {} });
const RemoteVirtualSensorEditor: React.FC<Props> = ({ isOpen, declaration, initial, sensors, onDismiss, onSave }) => {
    const [uri, setUri] = useState('');
    const [request, setRequest] = useState<RemoteSensorRequest>(emptyRequest);
    const [json, setJson] = useState('{}');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!isOpen) return;
        setUri(String(initial.parameters.endpoint_uri ?? ''));
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
            onSave({
                parameters: { ...initial.parameters, endpoint_uri: endpoint },
                request: { ...request, sensor_mappings: request.sensor_mappings.map(m => ({ ...m, field: m.field.trim() })), additional_json: additional as Record<string, unknown> },
            });
        } catch (e) { setError(e instanceof Error ? e.message : 'Invalid JSON'); }
    };
    return <IonModal isOpen={isOpen} onDidDismiss={onDismiss}>
        <IonHeader><IonToolbar><IonTitle>Remote Sensor Configuration</IonTitle><IonButtons slot="end"><IonButton onClick={onDismiss}>Close</IonButton></IonButtons></IonToolbar></IonHeader>
        <IonContent className="ion-padding">
            <IonText color="medium"><p>Protocol is selected in Controls Configuration. Configure the destination and request data here.</p></IonText>
            <IonItem><IonLabel position="stacked">{declaration.parameters.endpoint_uri?.label ?? 'URI'} <span aria-label="required" style={{ color: 'var(--ion-color-danger)' }}>*</span></IonLabel><IonInput required type="url" value={uri} onIonInput={e => setUri(e.detail.value ?? '')}/></IonItem>
            <IonItem><IonCheckbox slot="start" checked={request.include_controller_time} onIonChange={e => setRequest(r => ({ ...r, include_controller_time: e.detail.checked }))}/><IonLabel>Include controller time</IonLabel></IonItem>
            <IonText><p>Sensor collection</p></IonText>
            <IonList>{sensors.filter(s => s.component_id !== declaration.component_id).map(sensor => {
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
export default RemoteVirtualSensorEditor;
