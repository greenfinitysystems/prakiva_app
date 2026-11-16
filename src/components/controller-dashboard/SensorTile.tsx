import { ComponentIcon } from './ComponentIcon';
import { IonCard, IonCardContent, IonCol, IonText } from '@ionic/react';

interface SensorTileProps {
    displayName: string;
    suggestedIcon?: string;
    onSelect: () => void;
}

/** Sensor navigation button; readings and widget configuration live on detail pages. */
const SensorTile: React.FC<SensorTileProps> = ({ displayName, suggestedIcon, onSelect }) => (
    <IonCol size="6" size-sm="4" size-md="3">
        <IonCard button className="capability-tile sensor-tile" onClick={onSelect}>
            <IonCardContent className="capability-tile-content">
                <ComponentIcon suggested={suggestedIcon} kind="sensor" />
                <IonText className="capability-name">{displayName.toLocaleUpperCase()}</IonText>
            </IonCardContent>
        </IonCard>
    </IonCol>
);

export default SensorTile;
