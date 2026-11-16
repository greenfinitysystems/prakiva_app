import { IonIcon } from '@ionic/react';
import {
    bulbOutline, syncOutline, thermometerOutline, waterOutline, flaskOutline,
    snowOutline, flameOutline, flashOutline, hardwareChipOutline,
    pulseOutline, speedometerOutline, settingsOutline, sunnyOutline,
    leafOutline, constructOutline, radioOutline, powerOutline,
} from 'ionicons/icons';

/** Presentation-only mapping for controller-suggested icon names. */
const icons: Record<string, string> = {
    light: bulbOutline, lighting: bulbOutline, bulb: bulbOutline, lightbulb: bulbOutline,
    fan: syncOutline, cooling: syncOutline, ventilation: syncOutline,
    temperature: thermometerOutline, thermometer: thermometerOutline, temp: thermometerOutline,
    heater: flameOutline, heat: flameOutline, flame: flameOutline,
    chiller: snowOutline, cold: snowOutline, snowflake: snowOutline,
    water: waterOutline, humidity: waterOutline, droplet: waterOutline,
    ph: flaskOutline, chemistry: flaskOutline, flask: flaskOutline,
    distance: speedometerOutline, level: speedometerOutline, gauge: speedometerOutline,
    pump: waterOutline, wavemaker: waterOutline, fountain: waterOutline,
    co2: leafOutline, solenoid: radioOutline, valve: radioOutline,
    relay: flashOutline, switch: flashOutline, power: powerOutline,
    filter: constructOutline, skimmer: constructOutline,
    sensor: pulseOutline, actuator: settingsOutline,
    virtual: hardwareChipOutline, test: hardwareChipOutline,
    sun: sunnyOutline,
};

interface Props { suggested?: string; kind: 'actuator' | 'sensor'; }
export const ComponentIcon: React.FC<Props> = ({ suggested, kind }) => {
    const key = (suggested ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const icon = icons[key] ?? icons[key.replace(/-outline$/, '')] ?? (kind === 'sensor' ? pulseOutline : settingsOutline);
    return <IonIcon className="capability-component-icon" icon={icon} aria-hidden="true" />;
};
