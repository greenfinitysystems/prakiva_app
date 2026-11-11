import React from 'react';
import { IonCard, IonCardContent, IonText } from '@ionic/react';
import type { SensorWidgetType } from '../../config/controller-capabilities';
import { SensorGauge, SensorText, type SensorDisplayProps } from './SensorGauge';

export interface SensorWidgetRendererProps extends SensorDisplayProps {
    widget: SensorWidgetType;
}

/** Generic presentation dispatcher. Sensor-specific logic stays in firmware. */
const SensorWidgetRenderer: React.FC<SensorWidgetRendererProps> = ({ widget, ...displayProps }) => {
    if (widget === 'gauge') return <SensorGauge {...displayProps} />;
    if (widget === 'text') return <SensorText {...displayProps} />;

    return <IonCard className="sensor-widget-card sensor-not-configured-card">
        <IonCardContent>
            <IonText className="sensor-widget-title">{displayProps.title}</IonText>
            <p>This sensor has no display configured. Choose Plain Text or Gauge in Controls.</p>
        </IonCardContent>
    </IonCard>;
};

export default SensorWidgetRenderer;
