import { useEffect, useState } from 'react';
import {
    IonBackButton, IonButtons, IonCard, IonCardContent, IonContent,
    IonHeader, IonItem, IonLabel, IonPage, IonRadio, IonRadioGroup,
    IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { applyAppTheme, loadAppTheme, saveAppTheme, type AppTheme } from '../services/theme-preferences';
import './Home.css';

const Settings: React.FC = () => {
    const navigate = useNavigate();
    const [theme, setTheme] = useState<AppTheme>('system');
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        void loadAppTheme().then(value => {
            if (!active) return;
            setTheme(value);
            applyAppTheme(value);
        }).catch(err => {
            if (active) { console.error('[Prakiva] Could not load app appearance preference:', err); setError('We couldn’t load your appearance preference.'); }
        });
        return () => { active = false; };
    }, []);

    const chooseTheme = async (value: AppTheme) => {
        setTheme(value);
        setError('');
        try {
            await saveAppTheme(value);
        } catch (err) {
            console.error('[Prakiva] Could not save app appearance preference:', err);
            setError('We couldn’t save your appearance preference. Please try again.');
        }
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons>
                    <IonTitle>App Settings</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent className="prakiva-home ion-padding">
                <IonCard className="prakiva-card">
                    <IonCardContent>
                        <h1>App Settings</h1>
                        <p className="prakiva-muted">These preferences affect Prakiva on this phone, not the controller.</p>
                        <h2 className="prakiva-subheading">Appearance</h2>
                        <IonRadioGroup value={theme} onIonChange={event => {
                            const value = event.detail.value as AppTheme;
                            if (value === 'system' || value === 'light' || value === 'dark') void chooseTheme(value);
                        }}>
                            <IonItem>
                                <IonRadio value="system" justify="start" />
                                <IonLabel className="ion-text-wrap">
                                    <h3>System / Auto</h3>
                                    <p>Follow the phone's light or dark appearance.</p>
                                </IonLabel>
                            </IonItem>
                            <IonItem>
                                <IonRadio value="light" justify="start" />
                                <IonLabel className="ion-text-wrap">
                                    <h3>Light</h3>
                                    <p>Always use the light appearance.</p>
                                </IonLabel>
                            </IonItem>
                            <IonItem>
                                <IonRadio value="dark" justify="start" />
                                <IonLabel className="ion-text-wrap">
                                    <h3>Dark</h3>
                                    <p>Always use the dark appearance.</p>
                                </IonLabel>
                            </IonItem>
                        </IonRadioGroup>
                        {error && <IonText color="danger"><p>{error}</p></IonText>}
                    </IonCardContent>
                </IonCard>
            </IonContent>
        </IonPage>
    );
};

export default Settings;
