import { IonItem, IonLabel, IonNote } from '@ionic/react';
import type { InlineChannelEditorProps } from './types';

/** Trigger policies are recognised for capability compatibility; scheduling UI is implemented in the Scheduler phase. */
const TriggerPolicyNotice: React.FC<InlineChannelEditorProps> = ({ channelLabel }) => (
    <IonItem lines="none">
        <IonLabel>
            <h3>{channelLabel}</h3>
            <IonNote color="medium">Trigger scheduling will be available in the Scheduler phase.</IonNote>
        </IonLabel>
    </IonItem>
);

export default TriggerPolicyNotice;
