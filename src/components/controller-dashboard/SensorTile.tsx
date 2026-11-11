import {
    IonCard,
    IonCardContent,
    IonCol,
    IonText,
} from '@ionic/react';
import type { ControllerCapability } from '../../config/controller-capabilities';
import type { SensorWidgetType } from '../../config/controller-capabilities';

type SensorChannel = ControllerCapability['channels'][number];

interface SensorTileProps {
    capability: ControllerCapability;
    channel: SensorChannel;
    displayName: string;
    widget: SensorWidgetType;
    onSelect: () => void;
}

/**
 * Dashboard tile for one sensor channel.
 * Live readings remain on the sensor detail page; this tile is navigation only.
 */
const SensorTile: React.FC<SensorTileProps> = ({
    capability,
    channel,
    displayName,
    widget,
    onSelect,
}) => {
    const title = `${displayName}${capability.channels.length > 1 ? ` · ${channel.label}` : ''}`;
    const widgetLabel = widget === 'none'
        ? 'Not configured'
        : widget === 'text' ? 'Plain Text' : 'Gauge';

    return (
        <IonCol size="6" size-sm="4" size-md="3">
            <IonCard button className="capability-tile sensor-tile" onClick={onSelect}>
                <IonCardContent className="capability-tile-content">
                    <IonText className="capability-name">{title.toLocaleUpperCase()}</IonText>
                    <IonText className="capability-meta">{widgetLabel} · Tap to open</IonText>
                </IonCardContent>
            </IonCard>
        </IonCol>
    );
};

export default SensorTile;
