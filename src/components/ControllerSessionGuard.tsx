import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerSessionStore } from '../services/controller-session-store';
import { subscribeSessionInvalidation } from '../services/controller-session-events';

const protectedPaths = new Set([
    '/controller-change-password', '/controller-dashboard', '/controller-info', '/controller-network-alerts',
    '/controller-diagnostics', '/controller-backup-restore', '/wifi-configuration',
    '/time-configuration', '/system-timing', '/controls-configuration',
]);

export default function ControllerSessionGuard() {
    const location = useLocation();
    const navigate = useNavigate();
    const controller = (location.state as { controller?: SavedController } | null)?.controller;
    const protectedRoute = protectedPaths.has(location.pathname) ||
        location.pathname.startsWith('/control-editor/') || location.pathname.startsWith('/sensor-detail/');

    useEffect(() => {
        if (!controller || !protectedRoute) return;
        let active = true;
        const unsubscribe = subscribeSessionInvalidation(event => {
            if (event.address !== controller.address || event.httpPort !== controller.httpPort) return;
            void ControllerSessionStore.clearIfMatching(controller.deviceId, event.sessionToken).then(async cleared => {
                if (!cleared || !active) return;
                const current = await ControllerSessionStore.load(controller.deviceId);
                if (active && !current) navigate('/controller-login', { replace: true, state: { controller } });
            }).catch(error => console.error('[Prakiva] Session invalidation failed:', error));
        });
        return () => { active = false; unsubscribe(); };
    }, [controller, protectedRoute, navigate]);
    return null;
}
