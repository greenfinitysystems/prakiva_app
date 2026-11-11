import { useEffect, useState } from 'react';
import {
    IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonInput,
    IonItem, IonLabel, IonList, IonModal, IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import type { VirtualSensorDeclaration } from '../services/controller-api';
import type { VirtualSensorParameterValues } from '../services/virtual-sensor-configuration-store';

interface VirtualSensorParameterEditorProps {
    isOpen: boolean;
    declaration: VirtualSensorDeclaration;
    initialValues: VirtualSensorParameterValues;
    onDismiss: () => void;
    onSave: (values: VirtualSensorParameterValues) => void;
}

const defaultsFor = (declaration: VirtualSensorDeclaration): VirtualSensorParameterValues =>
    Object.fromEntries(Object.entries(declaration.parameters).map(([id, definition]) => [id, definition.default]));

const VirtualSensorParameterEditor: React.FC<VirtualSensorParameterEditorProps> = ({
    isOpen, declaration, initialValues, onDismiss, onSave,
}) => {
    const [values, setValues] = useState<VirtualSensorParameterValues>({});
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setValues({ ...defaultsFor(declaration), ...initialValues });
            setError('');
        }
    }, [isOpen, declaration.component_id, initialValues]);

    const updateValue = (parameterId: string, raw: string) => {
        setValues(previous => ({
            ...previous,
            [parameterId]: raw.trim() === '' ? Number.NaN : Number(raw),
        }));
        setError('');
    };

    const save = () => {
        const validated: VirtualSensorParameterValues = {};
        for (const [parameterId, definition] of Object.entries(declaration.parameters)) {
            const value = values[parameterId];
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                setError(`Enter a valid number for ${definition.label}.`);
                return;
            }
            if (definition.minimum !== undefined && value < definition.minimum) {
                setError(`${definition.label} must be at least ${definition.minimum}.`);
                return;
            }
            if (definition.maximum !== undefined && value > definition.maximum) {
                setError(`${definition.label} must not exceed ${definition.maximum}.`);
                return;
            }
            validated[parameterId] = value;
        }
        onSave(validated);
    };

    const resetDefaults = () => {
        setValues(defaultsFor(declaration));
        setError('');
    };

    return (
        <IonModal isOpen={isOpen} onDidDismiss={onDismiss}>
            <IonHeader><IonToolbar>
                <IonTitle>Virtual Sensor Parameters</IonTitle>
                <IonButtons slot="end">
                    <IonButton onClick={onDismiss}>Close</IonButton>
                </IonButtons>
            </IonToolbar></IonHeader>
            <IonContent className="ion-padding virtual-sensor-parameter-editor">
                <IonText color="medium">
                    <p>These parameters define how this virtual sensor derives its measurement. Their meaning and valid ranges are supplied by the controller.</p>
                </IonText>
                <IonList inset>
                    {Object.entries(declaration.parameters).map(([parameterId, definition]) => (
                        <IonItem key={parameterId}>
                            <IonLabel position="stacked">
                                {definition.label}
                                {definition.description && <p>{definition.description}</p>}
                            </IonLabel>
                            <IonInput
                                type="number"
                                inputMode="decimal"
                                value={Number.isFinite(values[parameterId]) ? String(values[parameterId]) : ''}
                                min={definition.minimum}
                                max={definition.maximum}
                                step={String(definition.step ?? 'any')}
                                onIonInput={event => updateValue(parameterId, event.detail.value ?? '')}
                            />
                        </IonItem>
                    ))}
                </IonList>
                {error && <IonText color="danger"><p>{error}</p></IonText>}
                <IonText color="medium">
                    <p>Defaults and limits are defined by the controller's Product Specification.</p>
                </IonText>
            </IonContent>
            <IonFooter>
                <IonToolbar>
                    <IonButtons slot="start"><IonButton fill="clear" onClick={resetDefaults}>Restore defaults</IonButton></IonButtons>
                    <IonButtons slot="end"><IonButton onClick={save}>Save locally</IonButton></IonButtons>
                </IonToolbar>
            </IonFooter>
        </IonModal>
    );
};

export default VirtualSensorParameterEditor;
