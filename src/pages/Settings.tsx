import { useEffect, useState } from 'react';
import {
    IonBackButton, IonButtons, IonCard, IonCardContent, IonContent,
    IonHeader, IonItem, IonLabel, IonPage, IonRadio, IonRadioGroup,
    IonText, IonTitle, IonToolbar,
} from '@ionic/react';
import { applyAppTheme, loadAppTheme, saveAppTheme } from '../services/theme-preferences';
import { SKINS, isSkinId, type SkinId } from '../theme/skin-registry';
import '../theme/skins/default/styles/pages/Home.css';

const Settings: React.FC = () => {
    const [theme, setTheme] = useState<SkinId>('default');
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

    const chooseTheme = async (value: SkinId) => {
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
                            const value: unknown = event.detail.value;
                            if (isSkinId(value)) void chooseTheme(value);
                        }}>
                            {SKINS.map(skin => (
                                <IonItem key={skin.id}>
                                    <IonRadio value={skin.id} justify="start" />
                                    <IonLabel className="ion-text-wrap">
                                        <h3>{skin.label}</h3>
                                        <p>{skin.description}</p>
                                    </IonLabel>
                                </IonItem>
                            ))}
                        </IonRadioGroup>
                        {error && <IonText color="danger"><p>{error}</p></IonText>}
                    </IonCardContent>
                </IonCard>
            </IonContent>
        </IonPage>
    );
};

export default Settings;
