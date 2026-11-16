import { ComponentIcon } from './ComponentIcon';
import { IonCard, IonCardContent, IonCol, IonText } from '@ionic/react';

interface ActuatorTileProps {
    displayName: string;
    suggestedIcon?: string;
    onSelect: () => void;
}

/** Dashboard navigation button. Presentation is selected entirely by skin CSS. */
const ActuatorTile: React.FC<ActuatorTileProps> = ({ displayName, suggestedIcon, onSelect }) => (
    <IonCol size="6" size-sm="4" size-md="3">
        <IonCard button className="capability-tile actuator-tile" onClick={onSelect}>
            <IonCardContent className="capability-tile-content">
                <ComponentIcon suggested={suggestedIcon} kind="actuator" />
                <IonText className="capability-name">{displayName.toLocaleUpperCase()}</IonText>
            </IonCardContent>
        </IonCard>
    </IonCol>
);

export default ActuatorTile;
