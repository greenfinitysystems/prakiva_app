import { useEffect, useMemo, useState } from 'react';
import { IonInput, IonItem, IonLabel, IonSelect, IonSelectOption, IonText } from '@ionic/react';
import type { InlineChannelEditorProps } from './types';

const ThresholdRules: React.FC<InlineChannelEditorProps> = ({ value = {}, onChange, capabilities }) => {
    const [sensorId, setSensorId] = useState(String(value.sensorId ?? 'water_temperature.value'));
    const [low, setLow] = useState(Number(value.lowThreshold ?? 28));
    const [high, setHigh] = useState(Number(value.highThreshold ?? 30));
    const [lowAction, setLowAction] = useState(String(value.lowAction ?? 'off'));
    const [highAction, setHighAction] = useState(String(value.highAction ?? 'on'));

    // A loaded profile updates the parent value; mirror every restored field here.
    useEffect(() => {
        setSensorId(String(value.sensorId ?? 'water_temperature.value'));
        setLow(Number(value.lowThreshold ?? 28));
        setHigh(Number(value.highThreshold ?? 30));
        setLowAction(String(value.lowAction ?? 'off'));
        setHighAction(String(value.highAction ?? 'on'));
    }, [value]);

    const sensors = useMemo(
        () => capabilities
            .filter(capability => capability.kind === 'sensor')
            .flatMap(capability => capability.channels.map(channel => ({
                id: `${capability.id}.${channel.id}`,
                label: `${channel.label}${channel.unit ? ` (${channel.unit})` : ''}`,
            }))),
        [capabilities],
    );

    // A displayed default must also exist in the parent configuration document.
    // Otherwise the editor looks configured while firmware receives sensorId="".
    useEffect(() => {
        if (value.sensorId) return;
        const preferred = sensors.find(sensor => sensor.id === 'water_temperature.value');
        const fallback = preferred ?? sensors[0];
        if (fallback) onChange({ ...value, sensorId: fallback.id,
            lowThreshold: value.lowThreshold ?? 28, highThreshold: value.highThreshold ?? 30,
            lowAction: value.lowAction ?? 'off', highAction: value.highAction ?? 'on' });
    }, [value, sensors, onChange]);

    const update = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });

    return (
        <>
            <IonItem>
                <IonLabel position="stacked">Sensor</IonLabel>
                <IonSelect value={sensorId} onIonChange={event => {
                    const next = String(event.detail.value);
                    setSensorId(next);
                    update({ sensorId: next });
                }}>
                    {sensors.map(sensor => <IonSelectOption key={sensor.id} value={sensor.id}>{sensor.label}</IonSelectOption>)}
                </IonSelect>
            </IonItem>
            <IonItem>
                <IonLabel position="stacked">Low threshold</IonLabel>
                <IonInput type="number" value={low} onIonInput={event => {
                    const next = Number(event.detail.value);
                    setLow(next);
                    update({ lowThreshold: next });
                }} />
            </IonItem>
            <IonItem>
                <IonLabel position="stacked">Action below low threshold</IonLabel>
                <IonSelect value={lowAction} onIonChange={event => {
                    const next = String(event.detail.value);
                    setLowAction(next);
                    update({ lowAction: next });
                }}>
                    <IonSelectOption value="on">Turn ON</IonSelectOption>
                    <IonSelectOption value="off">Turn OFF</IonSelectOption>
                </IonSelect>
            </IonItem>
            <IonItem>
                <IonLabel position="stacked">High threshold</IonLabel>
                <IonInput type="number" value={high} onIonInput={event => {
                    const next = Number(event.detail.value);
                    setHigh(next);
                    update({ highThreshold: next });
                }} />
            </IonItem>
            <IonItem>
                <IonLabel position="stacked">Action above high threshold</IonLabel>
                <IonSelect value={highAction} onIonChange={event => {
                    const next = String(event.detail.value);
                    setHighAction(next);
                    update({ highAction: next });
                }}>
                    <IonSelectOption value="on">Turn ON</IonSelectOption>
                    <IonSelectOption value="off">Turn OFF</IonSelectOption>
                </IonSelect>
            </IonItem>
            <IonText color={low < high ? 'medium' : 'danger'}>
                <p>{low < high ? 'Hysteresis: previous state is retained between thresholds.' : 'Low threshold must be lower than high threshold.'}</p>
            </IonText>
        </>
    );
};

export default ThresholdRules;
