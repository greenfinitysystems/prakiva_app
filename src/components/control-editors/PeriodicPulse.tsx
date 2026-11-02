import { useEffect, useState } from 'react';
import { IonInput, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption } from '@ionic/react';
import type { InlineChannelEditorProps } from './types';

const PeriodicPulse: React.FC<InlineChannelEditorProps> = ({ value = {}, onChange }) => {
    const [interval, setInterval] = useState(Number(value.interval ?? 30));
    const [intervalUnit, setIntervalUnit] = useState(String(value.intervalUnit ?? 'minutes'));
    const [duration, setDuration] = useState(Number(value.activationDuration ?? 500));
    const [durationUnit, setDurationUnit] = useState(String(value.durationUnit ?? 'milliseconds'));
    const [activationKind, setActivationKind] = useState(String(value.activationKind ?? 'request'));

    // Profiles replace the parent-owned channel configuration. Keep this editor's
    // local input state synchronized with that restored configuration.
    useEffect(() => {
        setInterval(Number(value.interval ?? 30));
        setIntervalUnit(String(value.intervalUnit ?? 'minutes'));
        setDuration(Number(value.activationDuration ?? 500));
        setDurationUnit(String(value.durationUnit ?? 'milliseconds'));
        setActivationKind(String(value.activationKind ?? 'request'));
    }, [value]);

    const update = (patch: Record<string, unknown>) => onChange({ ...value, ...patch });

    return (
        <>
            <IonItem>
                <IonLabel position="stacked">Repeat every</IonLabel>
                <IonInput type="number" min="1" value={interval} onIonInput={event => {
                    const next = Number(event.detail.value);
                    setInterval(next);
                    update({ interval: next });
                }} />
                <IonSelect value={intervalUnit} onIonChange={event => {
                    const next = String(event.detail.value);
                    setIntervalUnit(next);
                    update({ intervalUnit: next });
                }}>
                    <IonSelectOption value="seconds">Seconds</IonSelectOption>
                    <IonSelectOption value="minutes">Minutes</IonSelectOption>
                    <IonSelectOption value="hours">Hours</IonSelectOption>
                    <IonSelectOption value="days">Days</IonSelectOption>
                </IonSelect>
            </IonItem>
            <IonItem>
                <IonLabel position="stacked">Activation duration</IonLabel>
                <IonInput type="number" min="1" value={duration} onIonInput={event => {
                    const next = Number(event.detail.value);
                    setDuration(next);
                    update({ activationDuration: next });
                }} />
                <IonSelect value={durationUnit} onIonChange={event => {
                    const next = String(event.detail.value);
                    setDurationUnit(next);
                    update({ durationUnit: next });
                }}>
                    <IonSelectOption value="milliseconds">Milliseconds</IonSelectOption>
                    <IonSelectOption value="seconds">Seconds</IonSelectOption>
                </IonSelect>
            </IonItem>
            <IonItem>
                <IonLabel position="stacked">Activation meaning</IonLabel>
                <IonSelect value={activationKind} onIonChange={event => {
                    const next = String(event.detail.value);
                    setActivationKind(next);
                    update({ activationKind: next });
                }}>
                    <IonSelectOption value="output_state">Activate output</IonSelectOption>
                    <IonSelectOption value="request">Send request</IonSelectOption>
                </IonSelect>
            </IonItem>
            <IonNote>The first activation occurs after the first complete interval. Firmware must enforce duration limits and safe recovery.</IonNote>
        </>
    );
};

export default PeriodicPulse;
