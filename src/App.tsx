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
import ControlEditorPage from './pages/ControlEditorPage';
import SensorDetailPage from './pages/SensorDetailPage';

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
import './theme/skins/default/variables.css';
import './theme/skins/default/prakiva-theme.css';
import './theme/skins/instrument/instrument.css';
import './theme/skins/digital/digital.css';

import { applyAppTheme, loadAppTheme } from './services/theme-preferences';


setupIonicReact();

const App: React.FC = () => {
    useEffect(() => {
        let active = true;
        const apply = () => applyAppTheme('default');
        void loadAppTheme().then(skin => {
            if (active) applyAppTheme(skin);
        }).catch(apply);

        const media = window.matchMedia?.('(prefers-color-scheme: dark)');
        media?.addEventListener?.('change', apply);
        return () => {
            active = false;
            media?.removeEventListener?.('change', apply);
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
                    <Route path="/control-editor/:capabilityId" element={<ControlEditorPage />} />
                    <Route path="/control-editor/:capabilityId/:policy" element={<ControlEditorPage />} />
                    <Route path="/sensor-detail/:capabilityId/:channelId" element={<SensorDetailPage />} />
                    <Route path="/" element={<Navigate to="/home" replace />} />
                    <Route path="*" element={<Navigate to="/home" replace />} />
                </IonRouterOutlet>
            </IonReactRouter>
        </IonApp>
    );
};

export default App;
