import { ControllerBiometricVault } from '../services/controller-biometric-vault';
import { useState } from 'react';
import { IonAlert, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonLoading, IonSpinner, IonPage, IonText, IonTitle, IonToolbar } from '@ionic/react';
import { arrowBack, cloudDownloadOutline, cloudUploadOutline, powerOutline, trashOutline, refreshOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerSessionStore } from '../services/controller-session-store';
import { captureSystemBackup, decodeBackup, encodeBackup, restoreSystemBackup, type BackupDocument } from '../services/system-backup';
import { saveBackupDocument, openBackupDocument } from '../services/android-document-save';
import { controllerRequest } from '../services/controller-api';
import { ControllerSynchronizationStore } from '../services/controller-synchronization-store';

import { synchronizeControllerAfterLogin } from '../services/controller-synchronization';
import { ControlConfigurationStore, isControlConfigurationDocument } from '../services/control-configuration-store';
import { VirtualSensorConfigurationStore } from '../services/virtual-sensor-configuration-store';
import { ActuationMethodStore } from '../services/actuation-method-store';
import { RemoteActuatorConfigurationStore } from '../services/remote-actuator-configuration-store';
import { markConfigurationSynchronized } from '../services/configuration-apply';

const ControllerBackupRestore: React.FC = () => {
    const navigate = useNavigate();
    const controller = (useLocation().state as { controller?: SavedController } | null)?.controller;
    const [busy, setBusy] = useState(false);
    const [candidate, setCandidate] = useState<BackupDocument | null>(null);
    const [message, setMessage] = useState('');
    const [factoryConfirmOpen, setFactoryConfirmOpen] = useState(false);
    const [factoryBusy, setFactoryBusy] = useState(false);
    const [factoryError, setFactoryError] = useState('');
    const [rebootConfirmOpen, setRebootConfirmOpen] = useState(false);
    const [rebootBusy, setRebootBusy] = useState(false);
    const [rebootError, setRebootError] = useState('');
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
    const [resetBusy, setResetBusy] = useState(false);
    const [resetError, setResetError] = useState('');

    const resetLocalConfiguration = async () => {
        if (!controller || resetBusy) return;
        setResetConfirmOpen(false);
        setResetError('');
        setResetBusy(true);
        try {
            const session = await ControllerSessionStore.load(controller.deviceId);
            if (!session?.sessionToken) throw new Error('Sign in to the controller before resetting local settings.');
            // Obtain a fresh authenticated snapshot before modifying any local settings.
            const fresh = await synchronizeControllerAfterLogin(controller, session.sessionToken);
            const config = fresh.configuration.configuration;
            const appDocument = config?.app_configuration;
            if (!fresh.configuration.configuration_exists || !isControlConfigurationDocument(appDocument)) {
                throw new Error('The controller has no valid saved application configuration. Local settings were preserved.');
            }
            ControlConfigurationStore.replaceWithControllerDocument(appDocument);
            VirtualSensorConfigurationStore.replaceFromController(controller.deviceId, config?.virtual_sensors);
            ActuationMethodStore.replaceFromController(controller.deviceId, config?.actuator_channels);
            RemoteActuatorConfigurationStore.replaceFromController(controller.deviceId, config?.remote_actuators);
            const timestamp = fresh.configuration.configuration_timestamp;
            const iso = typeof timestamp === 'number' && timestamp > 0
                ? new Date(timestamp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
            markConfigurationSynchronized(controller.deviceId, iso);
            navigate('/controller-dashboard', { replace: true, state: { controller } });
        } catch (error) {
            setResetError(error instanceof Error ? error.message : 'Could not synchronize with controller. Local settings were preserved.');
        } finally {
            setResetBusy(false);
        }
    };

    const back = () => navigate('/controller-dashboard', { state: { controller } });
    const session = async () => {
        if (!controller) throw new Error('Controller context missing.');
        const saved = await ControllerSessionStore.load(controller.deviceId);
        if (!saved) throw new Error('Controller session unavailable. Please log in again.');
        return saved.sessionToken;
    };
        const rebootController = async () => {
        if (!controller || rebootBusy) return;
        setRebootConfirmOpen(false);
        setRebootError('');
        setRebootBusy(true);
        try {
            const session = await ControllerSessionStore.load(controller.deviceId);
            if (!session?.sessionToken) throw new Error('Sign in to the controller before rebooting.');
            // The controller acknowledges first, then schedules ESP.restart().
            // Never retry an uncertain reboot request automatically.
            await controllerRequest(controller.address, controller.httpPort, 'reboot_controller', {
                session_token: session.sessionToken,
            });
            await ControllerSessionStore.clear(controller.deviceId);
            navigate('/home', { replace: true });
        } catch (error) {
            // A transport failure is ambiguous: reboot may already be underway.
            // Clear the stale session and return to the safe controller selector.
            // Authentication failures are different: keep the user here to show the error.
            const message = error instanceof Error ? error.message : 'Reboot request failed.';
            if (/unauthenticated|invalid session|session expired|401/i.test(message)) {
                setRebootError(message);
            } else {
                try { await ControllerSessionStore.clear(controller.deviceId); } catch { /* best effort */ }
                navigate('/home', { replace: true });
            }
        } finally {
            setRebootBusy(false);
        }
    };

    const factoryResetController = async (confirmation: string) => {
        if (!controller || factoryBusy || confirmation !== 'ERASE EVERYTHING') return;
        setFactoryConfirmOpen(false);
        setFactoryError('');
        setFactoryBusy(true);
        try {
            const session = await ControllerSessionStore.load(controller.deviceId);
            if (!session?.sessionToken) throw new Error('Sign in to the controller before factory reset.');
            // Do not retry a destructive request on transport errors: its outcome may be unknown.
            const response = await controllerRequest(controller.address, controller.httpPort, 'factory_reset_controller', {
                session_token: session.sessionToken,
                confirmation,
            });
            if (response.data?.factory_reset_scheduled !== true && response.data?.reset_scheduled !== true) {
                // A successful API status is the acknowledgement; firmware versions can use
                // different optional data fields. No additional request is made.
                console.info('[Prakiva] Factory reset acknowledged by controller.');
            }
            // The controller is about to erase its credentials and stored configuration.
            // Remove device-scoped app caches; retain the saved controller record for discovery.
            await ControllerSessionStore.clear(controller.deviceId);
            await ControllerBiometricVault.remove(controller.deviceId).catch(() => { console.warn('[Prakiva] Could not clear biometric credentials after confirmed reset.'); });
            await ControllerSynchronizationStore.clear(controller.deviceId);
            const suffix = controller.deviceId;
            for (let index = localStorage.length - 1; index >= 0; index--) {
                const key = localStorage.key(index);
                if (key && key.startsWith('prakiva.') && key.endsWith(`.${suffix}`)) {
                    localStorage.removeItem(key);
                }
            }
            navigate('/home', { replace: true });
        } catch (error) {
            setFactoryError(error instanceof Error ? error.message : 'Factory reset request failed.');
        } finally {
            setFactoryBusy(false);
        }
    };

    const backup = async () => {
    if (!controller) return;
        setBusy(true);
        try {
            const document = await captureSystemBackup(controller, await session());
            const filename = `Prakiva-${controller.name.replace(/[^a-z0-9_-]/gi, '_')}-${new Date().toISOString().slice(0, 10)}.prakiva`;
            const saved = await saveBackupDocument(await encodeBackup(document), filename);
            setMessage(saved ? 'Backup saved successfully.' : 'Backup cancelled. No file was saved.');
        } catch (e) { setMessage(`Backup unsuccessful: ${e instanceof Error ? e.message : String(e)}`); }
        finally { setBusy(false); }
    };
    const chooseRestore = async () => {
        setCandidate(null);
        setBusy(true);
        try {
            const file = await openBackupDocument();
            if (!file) return; // Android picker Back/Cancel is a normal, non-destructive exit.
            setCandidate(await decodeBackup(file));
        } catch (e) { setMessage(`Cannot open backup: ${e instanceof Error ? e.message : String(e)}`); }
        finally { setBusy(false); }
    };
    const restore = async () => {
        if (!controller || !candidate) return;
        setBusy(true);
        try {
            await restoreSystemBackup(controller, await session(), candidate);
            setMessage('Restore successful. Controller configuration was written and verified by read-back.');
        } catch (e) { setMessage(`Restore unsuccessful: ${e instanceof Error ? e.message : String(e)}`); }
        finally { setBusy(false); setCandidate(null); }
    };
    if (!controller) return <IonPage><IonContent className="ion-padding">Controller context missing. <IonButton onClick={() => navigate('/home')}>Home</IonButton></IonContent></IonPage>;
    return <IonPage>
        <IonHeader><IonToolbar><IonButtons slot="start"><IonButton fill="clear" aria-label="Back to dashboard" onClick={back}><IonIcon slot="icon-only" icon={arrowBack}/></IonButton></IonButtons><IonTitle>Maintenance</IonTitle></IonToolbar></IonHeader>
        <IonContent className="ion-padding">
            <p>Backups contain the controller's successfully applied configuration, not unapplied drafts.</p>
            <IonList>
                <IonItem button disabled={busy || resetBusy || rebootBusy || factoryBusy} onClick={() => void backup()}><IonIcon slot="start" icon={cloudDownloadOutline}/><IonLabel><h2>Back Up System</h2><p>Save the applied controller configuration to a file.</p></IonLabel></IonItem>
                <IonItem button disabled={busy || resetBusy || rebootBusy || factoryBusy} onClick={() => void chooseRestore()}><IonIcon slot="start" icon={cloudUploadOutline}/><IonLabel><h2>Restore System</h2><p>Select a backup file, review its details, then confirm.</p></IonLabel></IonItem>
            </IonList>
            <IonText color="medium"><p>To cancel file selection, use Android's Back button or the file picker's Cancel/Close control. No changes are made until you confirm Restore and Verify.</p></IonText>
            <h2>Local configuration</h2>
            <IonList>
                <IonItem button disabled={resetBusy || busy || rebootBusy || factoryBusy} onClick={() => setResetConfirmOpen(true)}><IonIcon slot="start" icon={refreshOutline}/><IonLabel className="ion-text-wrap"><h2>Reset Local Configuration</h2><p>Discard local settings and resynchronize with the controller. The controller is not changed.</p></IonLabel></IonItem>
            </IonList>
            {resetBusy && <IonSpinner name="crescent" />}
            {resetError && <IonText color="danger"><p role="alert">{resetError}</p></IonText>}
            <IonAlert isOpen={resetConfirmOpen} onDidDismiss={() => setResetConfirmOpen(false)}
                header="Reset local configuration?"
                message="Discard this controller's local control, sensor and transport settings and replace them with a fresh copy from the controller? This will not change the controller. If the controller cannot be reached, local settings will be retained."
                buttons={[{ text: 'Cancel', role: 'cancel' }, { text: 'Reset and synchronize', role: 'destructive', handler: () => { void resetLocalConfiguration(); } }]} />
            <h2>Device management</h2>
            <IonList>
                <IonItem button disabled={rebootBusy || factoryBusy || busy || resetBusy} onClick={() => setRebootConfirmOpen(true)}><IonIcon slot="start" icon={powerOutline}/><IonLabel><h2>Reboot Controller</h2><p>Restart the controller without erasing its configuration.</p></IonLabel></IonItem>
                <IonItem button disabled={rebootBusy || factoryBusy || busy || resetBusy} onClick={() => { setFactoryError(''); setFactoryConfirmOpen(true); }}><IonIcon slot="start" color="danger" icon={trashOutline}/><IonLabel color="danger"><h2>Factory Reset</h2><p>Erase controller ownership and configuration.</p></IonLabel></IonItem>
            </IonList>
            {(rebootBusy || factoryBusy) && <IonSpinner name="crescent" />}
            {rebootError && <IonText color="danger"><p role="alert">{rebootError}</p></IonText>}
            {factoryError && <IonText color="danger"><p role="alert">{factoryError}</p></IonText>}
            <IonAlert isOpen={rebootConfirmOpen} onDidDismiss={() => setRebootConfirmOpen(false)}
                header="Reboot controller?"
                message="The controller will restart and its current session will expire. You will return to the controller selection screen and must sign in again after the controller reconnects."
                buttons={[{ text: 'Cancel', role: 'cancel' }, { text: 'Reboot', role: 'destructive', handler: () => { void rebootController(); } }]} />
            <IonAlert isOpen={factoryConfirmOpen} onDidDismiss={() => setFactoryConfirmOpen(false)}
                header="Factory Reset — Erase Everything"
                message="This permanently erases ownership, Wi-Fi, configuration, schedules, calibration and history from the controller. It will reboot unclaimed. Enter ERASE EVERYTHING exactly to continue."
                inputs={[{ name: 'confirmation', type: 'text', placeholder: 'ERASE EVERYTHING', attributes: { autoCapitalize: 'characters', autoComplete: 'off' } }]}
                buttons={[{ text: 'Cancel', role: 'cancel' }, {
                    text: 'Erase Everything', role: 'destructive',
                    handler: (values: { confirmation?: string }) => {
                        if (values?.confirmation !== 'ERASE EVERYTHING') {
                            setFactoryError('Confirmation must be exactly ERASE EVERYTHING.');
                            return false;
                        }
                        void factoryResetController(values.confirmation);
                    },
                }]} />
            <IonLoading isOpen={busy} message="Processing system backup…" />
            <IonAlert isOpen={candidate !== null} onDidDismiss={() => setCandidate(null)} header="Confirm System Restore"
                message={candidate ? `Validated backup\nProduct: ${candidate.product}\nFirmware: ${candidate.firmware_version}\nHardware: ${candidate.hardware_family}\nSource: ${candidate.source_device_id}\nCreated: ${candidate.created_at}\n\nThis replaces the controller's applied configuration and discards local drafts. Continue?` : ''}
                buttons={[{ text: 'Cancel', role: 'cancel' }, { text: 'Restore and Verify', role: 'confirm', handler: () => { void restore(); } }]} />
            <IonAlert isOpen={!!message} onDidDismiss={() => setMessage('')} header="Maintenance" message={message} buttons={['OK']} />
        </IonContent>
    </IonPage>;
};
export default ControllerBackupRestore;
