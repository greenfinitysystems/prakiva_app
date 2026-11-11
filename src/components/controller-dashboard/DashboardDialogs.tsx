import type { FC } from 'react';
import { IonAlert } from '@ionic/react';

interface DashboardDialogsProps {
    controllerName: string;
    applyConfirmOpen: boolean;
    onApplyConfirmDismiss: () => void;
    onApplyConfirm: () => void | Promise<void>;
    syncConflictOpen: boolean;
    onSyncConflictDismiss: () => void;
    onChooseController: () => void | Promise<void>;
    onChoosePhone: () => void;
    applyResultOpen: boolean;
    applyResultMessage: string;
    onApplyResultDismiss: () => void;
    leaveAlertOpen: boolean;
    onLeaveAlertDismiss: () => void;
    onSaveAndLeave: () => boolean;
    onDiscardAndLeave: () => boolean;
}

/**
 * Dashboard confirmation and status dialogs.
 * The dashboard/hook own all operations; this component owns only alert presentation.
 */
const DashboardDialogs: FC<DashboardDialogsProps> = ({
    controllerName,
    applyConfirmOpen,
    onApplyConfirmDismiss,
    onApplyConfirm,
    syncConflictOpen,
    onSyncConflictDismiss,
    onChooseController,
    onChoosePhone,
    applyResultOpen,
    applyResultMessage,
    onApplyResultDismiss,
    leaveAlertOpen,
    onLeaveAlertDismiss,
    onSaveAndLeave,
    onDiscardAndLeave,
}) => (
    <>
        <IonAlert
            isOpen={applyConfirmOpen}
            header="Apply Configuration"
            message={`Send your saved aquarium settings to ${controllerName}?`}
            onDidDismiss={onApplyConfirmDismiss}
            buttons={[
                { text: 'Cancel', role: 'cancel' },
                { text: 'Apply', handler: () => { void onApplyConfirm(); } },
            ]}
        />
        <IonAlert
            isOpen={syncConflictOpen}
            header="Configuration conflict"
            message="This phone has saved changes, and the controller has also changed since the last synchronisation. Which copy should be retained?"
            onDidDismiss={onSyncConflictDismiss}
            buttons={[
                { text: 'Use Controller', role: 'destructive', handler: () => { void onChooseController(); } },
                { text: 'Use This Phone', handler: onChoosePhone },
                { text: 'Decide Later', role: 'cancel' },
            ]}
        />
        <IonAlert
            isOpen={applyResultOpen}
            header="Configuration status"
            message={applyResultMessage}
            onDidDismiss={onApplyResultDismiss}
            buttons={[{ text: 'OK', role: 'confirm' }]}
        />
        <IonAlert
            isOpen={leaveAlertOpen}
            header="Unsaved changes"
            message="You have changes that have not been saved. What would you like to do?"
            onDidDismiss={onLeaveAlertDismiss}
            buttons={[
                { text: 'Save and leave', handler: onSaveAndLeave },
                { text: 'Discard and leave', role: 'destructive', handler: onDiscardAndLeave },
                { text: 'Stay', role: 'cancel' },
            ]}
        />
    </>
);

export default DashboardDialogs;
