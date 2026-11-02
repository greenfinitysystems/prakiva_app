import { useEffect, useState } from 'react';
import { IonItem, IonLabel, IonToggle } from '@ionic/react';
import type { InlineChannelEditorProps } from './types';

const ManualControl: React.FC<InlineChannelEditorProps> = ({ channelLabel, value = {}, onChange }) => {
    const [isOn, setIsOn] = useState(Boolean(value.manualOn));

    useEffect(() => {
        setIsOn(Boolean(value.manualOn));
    }, [value.manualOn]);

    const setOutputState = (next: boolean) => {
        setIsOn(next);
        onChange({ ...value, manualOn: next });
    };

    return (
        <IonItem lines="none">
            <IonLabel>
                {/* <h3>Manual output</h3> */}
                <p>{channelLabel} is {isOn ? 'On' : 'Off'}</p>
            </IonLabel>
            <IonToggle
                slot="end"
                checked={isOn}
                onIonChange={event => setOutputState(event.detail.checked)}
            />
        </IonItem>
    );
};

export default ManualControl;
