import { IonButton, IonIcon, IonInput, IonItem, IonLabel, IonNote } from '@ionic/react';
import { useState } from 'react';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import type { InlineChannelEditorProps } from './types';

/** Slave authorization belongs to the receiving channel, not to HTTP sender settings. */
const SlavePolicyEditor: React.FC<InlineChannelEditorProps> = ({ value, onChange }) => {
    const [visible, setVisible] = useState(false);
    const secret = typeof value?.secretKey === 'string' ? value.secretKey : '';
    return <>
        <IonItem><IonLabel position="stacked">Slave secret key</IonLabel>
            <IonInput type={visible ? "text" : "password"} autocomplete="off" value={secret} placeholder="Enter secret key"
                onIonInput={event => onChange({ ...value, secretKey: String(event.detail.value ?? '') })} />
            <IonButton slot="end" fill="clear" aria-label={visible ? "Hide secret key" : "Show secret key"} onClick={() => setVisible(!visible)}><IonIcon slot="icon-only" icon={visible ? eyeOffOutline : eyeOutline}/></IonButton>
        </IonItem>
        <IonNote>Required for incoming set_slave_actuator requests. Share this key only with authorized HTTP senders through their Static JSON configuration.</IonNote>
    </>;
};
export default SlavePolicyEditor;
