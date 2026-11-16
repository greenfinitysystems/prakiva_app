import React from 'react';
import { IonCard, IonCardContent, IonText } from '@ionic/react';
import type { SensorWidgetType } from '../../config/controller-capabilities';
import type { SensorDisplayProps } from './SensorDisplayProps';
import { SensorLinearGauge } from './SensorLinearGauge';
import { VintageSensorGauge } from './VintageSensorGauge';
import { PanelFasteners } from './PanelFasteners';

export interface SensorWidgetRendererProps extends SensorDisplayProps {
    widget: SensorWidgetType;
}

/** Generic presentation dispatcher. Sensor-specific logic stays in firmware. */
const SensorWidgetRenderer: React.FC<SensorWidgetRendererProps> = ({ widget, ...displayProps }) => {
    if (widget === 'gauge') {
        return <div className="sensor-widget-card sensor-gauge-card sensor-fastened-panel prakiva-vintage-gauge">
            <PanelFasteners />
            <VintageSensorGauge {...displayProps} />
        </div>;
    }
    if (widget === 'linear' || widget === 'text') return <SensorLinearGauge {...displayProps} />;

    return <IonCard className="sensor-widget-card sensor-not-configured-card">
        <IonCardContent>
            <IonText className="sensor-widget-title">{displayProps.title}</IonText>
            <p>This sensor has no display configured. Choose Circular Dial or Linear Gauge in Controls.</p>
        </IonCardContent>
    </IonCard>;
};

export default SensorWidgetRenderer;
