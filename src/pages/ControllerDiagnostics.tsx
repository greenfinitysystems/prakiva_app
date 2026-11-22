import { useCallback, useEffect, useState } from 'react';
import { IonAlert, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonSegment, IonSegmentButton, IonText, IonTitle, IonToolbar } from '@ionic/react';
import { trashOutline, refreshOutline, arrowBack, informationCircleOutline, warningOutline, alertCircleOutline } from 'ionicons/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SavedController } from '../models/saved-controller';
import { ControllerSessionStore } from '../services/controller-session-store';
import { controllerRequest } from '../services/controller-api';
import { collectControllerAlerts, readAlertArchive, writeAlertArchive, type AlertRecord } from '../services/controller-alert-archive';

type BootEntry = { elapsed_ms: number; level: string; stage: string; message: string };
type BootLog = { schema_version: number; start_ms: number; boot_timestamp?: number; reset_reason: string; reset_reason_code: number; outcome: string; completed: boolean; truncated: boolean; elapsed_ms?: number; entries: BootEntry[] };
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function parseBootLog(value: unknown): BootLog {
 if (!isObject(value) || !Array.isArray(value.entries) || typeof value.reset_reason !== 'string' || typeof value.outcome !== 'string' || typeof value.completed !== 'boolean' || typeof value.truncated !== 'boolean') throw new Error('Controller returned an invalid boot log.');
 const entries: BootEntry[] = value.entries.map(entry => {
  if (!isObject(entry) || typeof entry.elapsed_ms !== 'number' || typeof entry.level !== 'string' || typeof entry.stage !== 'string' || typeof entry.message !== 'string') throw new Error('Controller returned an invalid boot log entry.');
  return {elapsed_ms:entry.elapsed_ms, level:entry.level, stage:entry.stage, message:entry.message};
 });
 return { schema_version:Number(value.schema_version ?? 1), start_ms:Number(value.start_ms ?? 0), boot_timestamp:typeof value.boot_timestamp === 'number' ? value.boot_timestamp : undefined, reset_reason:value.reset_reason, reset_reason_code:Number(value.reset_reason_code ?? 0), outcome:value.outcome, completed:value.completed, truncated:value.truncated, elapsed_ms:typeof value.elapsed_ms === 'number'?value.elapsed_ms:undefined, entries };
}
const ControllerDiagnostics: React.FC = () => {
 const navigate=useNavigate();
 const controller=(useLocation().state as {controller?:SavedController}|null)?.controller;
 const [activeTab,setActiveTab]=useState<'alerts'|'boot'>('alerts');
 const [alerts,setAlerts]=useState<AlertRecord[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [deleteId,setDeleteId]=useState<number|null>(null);
 const [clearConfirm,setClearConfirm]=useState(false);
 const [bootLog,setBootLog]=useState<BootLog|null>(null);
 const [bootBusy,setBootBusy]=useState(false);
 const [bootError,setBootError]=useState('');
 const [bootLoaded,setBootLoaded]=useState(false);
 const refreshBoot=useCallback(async()=>{
  if(!controller)return;
  setBootBusy(true);setBootError('');
  try {
   const session=await ControllerSessionStore.load(controller.deviceId);
   if(!session?.sessionToken) throw new Error('Sign in before reading the boot log.');
   const response=await controllerRequest(controller.address,controller.httpPort,'get_last_boot_log',{session_token:session.sessionToken});
   if(response.data.available===false){setBootLog(null);}
   else {setBootLog(parseBootLog(response.data.boot_log));}
   setBootLoaded(true);
  } catch(e){setBootError(e instanceof Error?e.message:'Boot log retrieval failed.');}
  finally{setBootBusy(false);}
 },[controller]);
 const reload=useCallback(()=>{if(!controller)return;try{setAlerts(readAlertArchive(controller.deviceId));}catch(e){setError(e instanceof Error?e.message:'Unable to read local alerts.');}},[controller]);
 const refresh=useCallback(async()=>{
  if(!controller)return;
  setBusy(true);setError('');
  try{const count=await collectControllerAlerts(controller);reload();setNotice(`${count} new controller alert(s) retrieved.`);}
  catch(e){setError(e instanceof Error?e.message:'Alert retrieval failed.');reload();}
  finally{setBusy(false);}
 },[controller,reload]);
 useEffect(()=>{reload();void refresh();void refreshBoot();},[reload,refresh,refreshBoot]);
 const remove=(id:number|null)=>{
  if(!controller)return;
  try{const current=readAlertArchive(controller.deviceId);const next=id===null?[]:current.filter(a=>a.id!==id);writeAlertArchive(controller.deviceId,next);setAlerts(next);setError('');}
  catch(e){setError(e instanceof Error?e.message:'Delete failed.');}
  setDeleteId(null);setClearConfirm(false);
 };
 if(!controller)return <IonPage><IonContent className="ion-padding">Controller context missing. <IonButton onClick={()=>navigate('/home')}>Home</IonButton></IonContent></IonPage>;
 return <IonPage><IonHeader><IonToolbar><IonButtons slot="start"><IonButton fill="clear" aria-label="Back to dashboard" onClick={()=>navigate('/controller-dashboard',{state:{controller}})}><IonIcon slot="icon-only" icon={arrowBack}/></IonButton></IonButtons><IonTitle>Diagnostics &amp; Alerts</IonTitle></IonToolbar></IonHeader>
 <IonContent className="ion-padding">
 <IonSegment value={activeTab} onIonChange={event=>setActiveTab(event.detail.value==='boot'?'boot':'alerts')} aria-label="Diagnostics sections">
  <IonSegmentButton value="alerts"><IonLabel>Alerts</IonLabel></IonSegmentButton>
  <IonSegmentButton value="boot"><IonLabel>Boot Log</IonLabel></IonSegmentButton>
 </IonSegment>
 {activeTab==='boot'&&<>
 <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><h2>Last Boot Log</h2><IonButton fill="outline" size="small" disabled={bootBusy} onClick={()=>void refreshBoot()}><IonIcon slot="start" icon={refreshOutline}/>Refresh</IonButton></div>
 <p>The controller retains only its latest startup record. This log is read-only and is replaced on the next boot.</p>
 {bootError&&<IonText color="danger"><p role="alert">{bootError}</p></IonText>}
 {bootLog?<>
  <IonList>
   <IonItem><IonLabel>Last boot</IonLabel><IonText>{bootLog.boot_timestamp && bootLog.boot_timestamp >= 1704067200 ? new Date(bootLog.boot_timestamp*1000).toLocaleString() : 'Time unavailable (controller clock not synchronized)'}</IonText></IonItem>
   <IonItem><IonLabel>Reset reason</IonLabel><IonText>{bootLog.reset_reason.replace(/_/g,' ')} (code {bootLog.reset_reason_code})</IonText></IonItem>
   <IonItem><IonLabel>Outcome</IonLabel><IonText>{bootLog.outcome.replace(/_/g,' ')}{bootLog.completed?' · completed':' · incomplete'}</IonText></IonItem>
   <IonItem><IonLabel>Boot duration</IonLabel><IonText>{bootLog.elapsed_ms===undefined?'Not available':`${(bootLog.elapsed_ms/1000).toFixed(3)} s`}</IonText></IonItem>
  </IonList>
  {bootLog.truncated&&<IonText color="warning"><p>Boot log was truncated; some entries may be missing.</p></IonText>}
  <IonList>{bootLog.entries.map((entry,index)=><IonItem key={`${index}-${entry.elapsed_ms}`}><IonIcon slot="start" aria-label={entry.level} color={entry.level==='error'?'danger':entry.level==='warning'?'warning':'medium'} icon={entry.level==='error'?alertCircleOutline:entry.level==='warning'?warningOutline:informationCircleOutline}/><IonLabel className="ion-text-wrap"><h3>{entry.stage.replace(/_/g,' ')}</h3><p>+{(entry.elapsed_ms/1000).toFixed(3)} s — {entry.message}</p></IonLabel></IonItem>)}</IonList>
 </>:bootLoaded&&!bootError?<p>No boot log available on the controller.</p>:!bootError?<p>Loading last boot log…</p>:null}
 </>}
 {activeTab==='alerts'&&<>
 <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><h2>Operational Alerts</h2><IonButton fill="outline" size="small" disabled={busy} onClick={()=>void refresh()}><IonIcon slot="start" icon={refreshOutline}/>Refresh</IonButton></div>
 <p>Controller alerts are downloaded automatically while the dashboard is active. Refresh checks immediately. Deleting history does not resolve active faults.</p>
 {error&&<IonText color="danger"><p role="alert">{error}</p></IonText>}
 {notice&&<IonText color="success"><p>{notice}</p></IonText>}
 {alerts.length>0&&<IonButton fill="outline" color="danger" onClick={()=>setClearConfirm(true)}>Clear history</IonButton>}
 {alerts.length===0?<p>No stored alerts.</p>:<IonList>{[...alerts].reverse().map(a=><IonItem key={a.id}><IonLabel className="ion-text-wrap"><h3>{a.code}</h3><p>{a.source} · {a.timestamp>0?new Date(a.timestamp*1000).toLocaleString():'Time unavailable'}</p><p>{a.message}</p></IonLabel><IonButton slot="end" fill="clear" color="danger" aria-label={`Delete ${a.code}`} onClick={()=>setDeleteId(a.id)}><IonIcon icon={trashOutline}/></IonButton></IonItem>)}</IonList>}
 </>}
 <IonAlert isOpen={deleteId!==null} onDidDismiss={()=>setDeleteId(null)} header="Delete alert?" message="Delete this locally stored record?" buttons={[{text:'Cancel',role:'cancel'},{text:'Delete',role:'destructive',handler:()=>remove(deleteId)}]}/>
 <IonAlert isOpen={clearConfirm} onDidDismiss={()=>setClearConfirm(false)} header="Clear alert history?" message="Delete all locally stored alerts for this controller?" buttons={[{text:'Cancel',role:'cancel'},{text:'Clear',role:'destructive',handler:()=>remove(null)}]}/>
 </IonContent></IonPage>;
};
export default ControllerDiagnostics;
