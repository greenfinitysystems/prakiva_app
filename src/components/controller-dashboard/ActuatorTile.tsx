import {
    IonCard,
    IonCardContent,
    IonCol,
    IonText,
} from '@ionic/react';
import type { ControllerCapability } from '../../config/controller-capabilities';

interface ActuatorTileProps {
    capability: ControllerCapability;
    displayName: string;
    configuredChannelCount: number;
    onSelect: () => void;
}

/**
 * Dashboard tile for an actuator capability.
 * Navigation and policy selection remain owned by the dashboard.
 */
const ActuatorTile: React.FC<ActuatorTileProps> = ({
    capability,
    displayName,
    configuredChannelCount,
    onSelect,
}) => (
    <IonCol size="6" size-sm="4" size-md="3">
        <IonCard button className="capability-tile" onClick={onSelect}>
            <IonCardContent className="capability-tile-content">
                <IonText className="capability-name">{displayName.toLocaleUpperCase()}</IonText>
                <IonText className="capability-meta">
                    {capability.channels.length} channel{capability.channels.length === 1 ? '' : 's'} · {configuredChannelCount} configured
                </IonText>
            </IonCardContent>
        </IonCard>
    </IonCol>
);

export default ActuatorTile;
