import { useEffect } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';

import Home from './pages/Home';
import Settings from './pages/Settings';
import ControllerInfo from './pages/ControllerInfo';
import WifiConfiguration from './pages/WifiConfiguration';
import TimeConfiguration from './pages/TimeConfiguration';
import ControllerDiscovery from './pages/ControllerDiscovery';
import ControllerDetails from './pages/ControllerDetails';
import ControllerSetup from './pages/ControllerSetup';
import ControllerClaim from './pages/ControllerClaim';
import ControllerLogin from './pages/ControllerLogin';
import ControllerDashboard from './pages/ControllerDashboard';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';
import '@ionic/react/css/palettes/dark.class.css';
import './theme/variables.css';
import './theme/prakiva-theme.css';

import { applyAppTheme, loadAppTheme } from './services/theme-preferences';

setupIonicReact();

const App: React.FC = () => {
    useEffect(() => {
        let active = true;
        let theme: 'system' | 'light' | 'dark' = 'system';

        const apply = () => applyAppTheme(theme);
        void loadAppTheme().then(saved => {
            if (!active) return;
            theme = saved;
            apply();
        }).catch(() => apply());

        const media = window.matchMedia?.('(prefers-color-scheme: dark)');
        const onSystemChange = () => {
            if (theme === 'system') apply();
        };
        media?.addEventListener?.('change', onSystemChange);

        return () => {
            active = false;
            media?.removeEventListener?.('change', onSystemChange);
        };
    }, []);

    return (
        <IonApp>
            <IonReactRouter>
                <IonRouterOutlet>
                    <Route path="/home" element={<Home />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/controller-info" element={<ControllerInfo />} />
                    <Route path="/wifi-configuration" element={<WifiConfiguration />} />
                    <Route path="/time-configuration" element={<TimeConfiguration />} />
                    <Route path="/discovery" element={<ControllerDiscovery />} />
                    <Route path="/controller-details" element={<ControllerDetails />} />
                    <Route path="/controller-setup" element={<ControllerSetup />} />
                    <Route path="/controller-claim" element={<ControllerClaim />} />
                    <Route path="/controller-login" element={<ControllerLogin />} />
                    <Route path="/controller-dashboard" element={<ControllerDashboard />} />
                    <Route path="/" element={<Navigate to="/home" replace />} />
                    <Route path="*" element={<Navigate to="/home" replace />} />
                </IonRouterOutlet>
            </IonReactRouter>
        </IonApp>
    );
};

export default App;
