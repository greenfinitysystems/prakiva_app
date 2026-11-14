import { useCallback, useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { SavedController } from '../../models/saved-controller';
import { ControlConfigurationStore } from '../../services/control-configuration-store';
import { markLocalConfigurationPending } from '../../services/configuration-apply';

interface UseDashboardNavigationGuardOptions {
    controller?: SavedController;
    hasCapabilities: boolean;
    navigate: NavigateFunction;
    pathname: string;
    search: string;
    hash: string;
    onSaveError: (message: string) => void;
}

interface UseDashboardNavigationGuardResult {
    requestLeave: (action: () => void) => void;
    leaveAlertOpen: boolean;
    onLeaveAlertDismiss: () => void;
    saveAndLeave: () => boolean;
    discardAndLeave: () => boolean;
}

/**
 * Protects the active controller dashboard from accidental navigation
 * while configuration edits are unsaved.
 *
 * Global navigation listeners are registered only while the dashboard route
 * is active because Ionic retains inactive pages in IonRouterOutlet.
 */
export const useDashboardNavigationGuard = ({
    controller,
    hasCapabilities,
    navigate,
    pathname,
    search,
    hash,
    onSaveError,
}: UseDashboardNavigationGuardOptions): UseDashboardNavigationGuardResult => {
    const [leaveAlertOpen, setLeaveAlertOpen] = useState(false);
    const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

    const requestLeave = useCallback((action: () => void) => {
        if (!ControlConfigurationStore.hasUnsavedChanges()) {
            action();
            return;
        }
        setPendingLeave(() => action);
        setLeaveAlertOpen(true);
    }, []);

    const controllerDeviceId = controller?.deviceId;

    const saveConfiguration = useCallback(() => {
        onSaveError('');
        try {
            ControlConfigurationStore.save();
            if (controllerDeviceId) {
                markLocalConfigurationPending(controllerDeviceId);
            }
            return true;
        } catch (error) {
            onSaveError(error instanceof Error ? error.message : 'Could not save configuration.');
            return false;
        }
    }, [controllerDeviceId, onSaveError]);

    const saveAndLeave = useCallback(() => {
        if (!saveConfiguration()) return false;
        setLeaveAlertOpen(false);
        pendingLeave?.();
        setPendingLeave(null);
        return true;
    }, [pendingLeave, saveConfiguration]);

    const discardAndLeave = useCallback(() => {
        try {
            ControlConfigurationStore.discard();
            setLeaveAlertOpen(false);
            pendingLeave?.();
            setPendingLeave(null);
        } catch (error) {
            onSaveError(error instanceof Error ? error.message : 'Could not discard changes.');
            return false;
        }
        return true;
    }, [onSaveError, pendingLeave]);

    const onLeaveAlertDismiss = useCallback(() => {
        setLeaveAlertOpen(false);
        setPendingLeave(null);
    }, []);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasCapabilities || !ControlConfigurationStore.hasUnsavedChanges()) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [hasCapabilities]);

    useEffect(() => {
        if (pathname !== '/controller-dashboard') return;
        const onHardwareBack = (event: Event) => {
            const backEvent = event as CustomEvent<{
                register: (priority: number, handler: () => void) => void;
            }>;
            backEvent.detail?.register(101, () => requestLeave(() => navigate(-1)));
        };
        document.addEventListener('ionBackButton', onHardwareBack);
        return () => document.removeEventListener('ionBackButton', onHardwareBack);
    }, [pathname, navigate, requestLeave]);

    useEffect(() => {
        if (pathname !== '/controller-dashboard') return;
        const onBrowserBack = (event: PopStateEvent) => {
            if (!ControlConfigurationStore.hasUnsavedChanges()) return;
            event.stopImmediatePropagation();
            window.history.pushState(
                window.history.state,
                '',
                `${pathname}${search}${hash}`,
            );
            // The attempted back and the protective push are both in history.
            requestLeave(() => navigate(-2));
        };
        window.addEventListener('popstate', onBrowserBack, true);
        return () => window.removeEventListener('popstate', onBrowserBack, true);
    }, [pathname, search, hash, navigate, requestLeave]);

    return {
        requestLeave,
        leaveAlertOpen,
        onLeaveAlertDismiss,
        saveAndLeave,
        discardAndLeave,
    };
};
