import type { FC } from 'react';
import {
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonPopover,
} from '@ionic/react';
import {
    archiveOutline,
    cloudUploadOutline,
    informationCircleOutline,
    logOutOutline,
    settingsOutline,
    timeOutline,
    wifiOutline,
} from 'ionicons/icons';

interface ControllerMenuProps {
    isOpen: boolean;
    onDidDismiss: () => void;
    applyBusy: boolean;
    applyStatusColor: string;
    applyStatusLabel: string;
    loggingOut: boolean;
    onControls: () => void;
    onWifi: () => void;
    onTime: () => void;
    onControllerInfo: () => void;
    onApply: () => void;
    onLogout: () => void;
}

/**
 * Controller settings popover.
 * The dashboard owns navigation, unsaved-change protection, and Apply behaviour.
 */
const ControllerMenu: FC<ControllerMenuProps> = ({
    isOpen,
    onDidDismiss,
    applyBusy,
    applyStatusColor,
    applyStatusLabel,
    loggingOut,
    onControls,
    onWifi,
    onTime,
    onControllerInfo,
    onApply,
    onLogout,
}) => (
    <IonPopover
        trigger="controller-menu-trigger"
        isOpen={isOpen}
        onDidDismiss={onDidDismiss}
        side="bottom"
        alignment="end"
    >
        <IonList lines="none">
            <IonItem button onClick={onControls}>
                <IonIcon slot="start" icon={settingsOutline} />
                <IonLabel>Controls</IonLabel>
            </IonItem>
            <IonItem button onClick={onWifi}>
                <IonIcon slot="start" icon={wifiOutline} />
                <IonLabel>Wi-Fi</IonLabel>
            </IonItem>
            <IonItem button onClick={onTime}>
                <IonIcon slot="start" icon={timeOutline} />
                <IonLabel>Time</IonLabel>
            </IonItem>
            <IonItem button onClick={onControllerInfo}>
                <IonIcon slot="start" icon={informationCircleOutline} />
                <IonLabel>Controller</IonLabel>
            </IonItem>
            <IonItem button disabled>
                <IonIcon slot="start" icon={archiveOutline} />
                <IonLabel>
                    <h2>Backup &amp; Restore</h2>
                    <p>Available in the next phase</p>
                </IonLabel>
            </IonItem>
            <IonItem button disabled={applyBusy} onClick={onApply}>
                <IonIcon slot="start" icon={cloudUploadOutline} color={applyStatusColor} />
                <IonLabel>
                    <h2>Apply Configuration</h2>
                    <p>{applyStatusLabel}</p>
                </IonLabel>
            </IonItem>
            <IonItem button disabled={loggingOut} onClick={onLogout}>
                <IonIcon slot="start" icon={logOutOutline} />
                <IonLabel>{loggingOut ? 'Logging out…' : 'Logout'}</IonLabel>
            </IonItem>
        </IonList>
    </IonPopover>
);

export default ControllerMenu;
