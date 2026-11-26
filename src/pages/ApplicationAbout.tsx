import { IonBackButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonItem, IonLabel, IonList, IonPage, IonTitle, IonToolbar } from '@ionic/react';

const ApplicationAbout: React.FC = () => (
    <IonPage>
        <IonHeader><IonToolbar><IonButtons slot="start"><IonBackButton defaultHref="/home" /></IonButtons><IonTitle>About Application</IonTitle></IonToolbar></IonHeader>
        <IonContent className="prakiva-home ion-padding">
            <IonCard><IonCardContent>
                    <IonList lines="inset">
                        <IonItem><IonLabel><p>Application</p><h2>PRAKIVA</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>App version</p><h2>0.1.0</h2></IonLabel></IonItem>
                        <IonItem><IonLabel><p>Platform</p><h2>Ionic / Capacitor</h2></IonLabel></IonItem>
                    </IonList>
            </IonCardContent></IonCard>
        </IonContent>
    </IonPage>
);
export default ApplicationAbout;
