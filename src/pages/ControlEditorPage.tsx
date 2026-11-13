import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { arrowBack } from 'ionicons/icons';
import { IonAlert, IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonNote, IonPage, IonSelect, IonSelectOption, IonText, IonTitle, IonToolbar } from '@ionic/react';
import CurveEditor, { type CurveAxis, type CurveDefinition } from '../components/CurveEditor';
import { DEFAULT_CONTROL_POLICIES, POLICY_LABELS } from '../config/control-policies';
import { type ControlPolicy, type ControllerCapability, channelPolicyKey } from '../config/controller-capabilities';
import { ControlConfigurationStore } from '../services/control-configuration-store';
import { ControlProfileStore } from '../services/control-profile-store';
import { markLocalConfigurationPending } from '../services/configuration-apply';
import { getTimeStatus, invokeVirtualActuator, getActuatorExecutionState } from '../services/controller-api';
import { ControllerSessionStore } from '../services/controller-session-store';
import type { SavedController } from '../models/saved-controller';
import type { ControlProfile } from '../models/control-profile';
import InlineChannelEditor from '../components/control-editors/InlineChannelEditor';
import { validateTriggerRangeConfiguration } from '../config/trigger-validation';
import { validateThresholdConfigurations } from '../config/threshold-validation';
import './ControlEditorPage.css';
interface RouteState { controller?: SavedController; capabilities?: ControllerCapability[]; capability?: ControllerCapability; policy?: ControlPolicy; channel?: { id: string; label: string; valueType: 'binary' | 'analog' | 'trigger'; unit?: string; min?: number; max?: number; supportedPolicies: ControlPolicy[] } }
const palette = ['#d1d5db', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#06b6d4', '#f97316'];
const cloneCurves = (items: CurveDefinition[]) => items.map(curve => ({ ...curve, points: curve.points.map(point => ({ ...point })) }));
const BINARY_AXIS: CurveAxis = { label: 'Output state', min: 0, max: 1, ticks: [0, 1], formatTick: value => value >= 0.5 ? 'ON' : 'OFF' };
const X_AXIS: CurveAxis = { label: 'Time of day', min: 0, max: 24, unit: 'hours', ticks: [0, 3, 6, 9, 12, 15, 18, 21, 24], formatTick: v => `${String(v === 24 ? 0 : v).padStart(2, '0')}:00` };
const ControlEditorPage: React.FC = () => {
    const { capabilityId } = useParams<{ capabilityId: string }>(); const location = useLocation(); const navigate = useNavigate(); const [search] = useSearchParams();
    const route = location.state as RouteState | null;
    const controller = route?.controller;
    const [aquariumTime, setAquariumTime] = useState<Date | null>(null);

    // Use the controller's schedule-adjusted clock for the curve NOW marker.
    // Anchor the controller timestamp to the phone's monotonic passage of time between refreshes.
    useEffect(() => {
        let active = true;
        let baseScheduleUnix = 0;
        let basePhoneMillis = 0;
        const refresh = async () => {
            if (!controller) { setAquariumTime(null); return; }
            try {
                const session = await ControllerSessionStore.load(controller.deviceId);
                if (!session) return;
                const status = await getTimeStatus(controller.address, controller.httpPort, session.sessionToken);
                if (!active || !status.clock_valid) return;
                baseScheduleUnix = status.schedule_unix_time;
                basePhoneMillis = Date.now();
                setAquariumTime(new Date(baseScheduleUnix * 1000));
            } catch (error) {
                console.warn('[Prakiva] Could not refresh aquarium clock for curve editor:', error);
            }
        };
        void refresh();
        const refreshTimer = window.setInterval(() => { void refresh(); }, 60_000);
        const tickTimer = window.setInterval(() => {
            if (!active || !baseScheduleUnix) return;
            setAquariumTime(new Date((baseScheduleUnix + (Date.now() - basePhoneMillis) / 1000) * 1000));
        }, 5_000);
        return () => { active = false; window.clearInterval(refreshTimer); window.clearInterval(tickTimer); };
    }, [controller?.deviceId, controller?.address, controller?.httpPort]);
    const invokeManualOperation = async (capabilityId: string, channelId: string) => {
        if (!controller) throw new Error('Controller connection is unavailable.');
        const session = await ControllerSessionStore.load(controller.deviceId);
        if (!session) throw new Error('Controller session is unavailable. Please log in again.');
        await invokeVirtualActuator(controller.address, controller.httpPort, session.sessionToken, capabilityId, channelId);
    };
    const readExecutionState = async (capabilityId: string, channelId: string): Promise<'IDLE' | 'RUNNING'> => {
        if (!controller) throw new Error('Controller connection is unavailable.');
        const session = await ControllerSessionStore.load(controller.deviceId);
        if (!session) throw new Error('Controller session is unavailable. Please log in again.');
        return getActuatorExecutionState(controller.address, controller.httpPort, session.sessionToken, capabilityId, channelId);
    };
    const availableCapabilities = route?.capabilities ?? (route?.capability ? [route.capability] : []);
    const parent = availableCapabilities.find(c => c.id === capabilityId);
    const channelId = search.get('channel');
    const selectedChannel = route?.channel ?? parent?.channels.find(c => c.id === channelId);
    const capability = channelId && parent && selectedChannel
        ? { ...parent, id: `${parent.id}.${selectedChannel.id}`, name: selectedChannel.label, channels: [selectedChannel] }
        : (route && route.capability?.id === capabilityId ? route.capability : parent);
    // Snapshot this editor's own configuration when its route becomes active.
    // Other pending changes (such as sensor widget selections) are outside this scope.
    const editorBaseline = useMemo(
        () => capability ? ControlConfigurationStore.getControlEditorSnapshot(capability.id) : null,
        [capability?.id, location.pathname],
    );
    const hasEditorChanges = () => {
        if (!capability || !editorBaseline) return false;
        return JSON.stringify(ControlConfigurationStore.getControlEditorSnapshot(capability.id)) !== JSON.stringify(editorBaseline);
    };
    const [policies, setPolicies] = useState<Record<string, ControlPolicy>>(() => ({ ...DEFAULT_CONTROL_POLICIES, ...ControlConfigurationStore.getChannelPolicies() }));
    const [colors, setColors] = useState<Record<string, string>>(() => ControlConfigurationStore.getChannelColors());
    const [curves, setCurves] = useState<CurveDefinition[]>(() => {
        if (!capability) return [];
        try {
            const saved = ControlConfigurationStore.getControl(capability.id).curves;
            if (Array.isArray(saved) && saved.length) return saved as CurveDefinition[];
        } catch { /* The store reports malformed data; retain safe editor defaults. */ }
        return capability.channels.filter(c => c.valueType === 'analog' && (policies[channelPolicyKey(capability.id, c.id)] ?? c.supportedPolicies[0]) === 'analog_curve').map((c, i) => ({ id: c.id, label: c.label, color: colors[channelPolicyKey(capability.id, c.id)] ?? palette[i % palette.length], points: [{ x: 0, y: c.min ?? 0 }, { x: 7, y: c.min ?? 0 }, { x: 10, y: c.max ?? 100 }, { x: 16, y: c.max ?? 100 }, { x: 20, y: c.min ?? 0 }, { x: 24, y: c.min ?? 0 }] }));
    });
    const [selectedAnalogChannel, setSelectedAnalogChannel] = useState<string>(() => capability?.channels.find(c => c.valueType === 'analog')?.id ?? '');
    const [selectedBinaryChannel, setSelectedBinaryChannel] = useState<string>(() => capability?.channels.find(c => c.valueType === 'binary')?.id ?? '');
    const controlId = capability ? `control_${capability.id}` : '';
    const [customProfiles, setCustomProfiles] = useState<ControlProfile[]>(() => capability
        ? ControlProfileStore.getCustomProfiles(controlId, capability.id, capability.channels)
        : []);
    const [inlineConfigs, setInlineConfigs] = useState<Record<string, Record<string, unknown>>>(() => capability ? ControlConfigurationStore.getControl(capability.id).inlineConfigurations : {});
    const [selectedProfile, setSelectedProfile] = useState('');
    const [profileName, setProfileName] = useState('');
    const [profileNotice, setProfileNotice] = useState("Profiles are part of this control configuration and are included when you save this editor.");
    const [leaveAlertOpen, setLeaveAlertOpen] = useState(false);
    const [leaveError, setLeaveError] = useState('');
    const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasEditorChanges()) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, []);

    // IonRouterOutlet keeps inactive pages mounted. Only the page currently
    // visible may register global back-navigation handlers.
    useEffect(() => {
        if (!location.pathname.startsWith('/control-editor/')) return;
        const onHardwareBack = (event: Event) => {
            const backEvent = event as CustomEvent<{ register: (priority: number, handler: () => void) => void }>;
            backEvent.detail?.register(101, () => {
                const leave = () => navigate(-1);
                if (hasEditorChanges()) {
                    setPendingLeave(() => leave);
                    setLeaveAlertOpen(true);
                } else leave();
            });
        };
        document.addEventListener('ionBackButton', onHardwareBack);
        return () => document.removeEventListener('ionBackButton', onHardwareBack);
    }, [location.pathname, navigate]);

    useEffect(() => {
        if (!location.pathname.startsWith('/control-editor/')) return;
        const onBrowserBack = (event: PopStateEvent) => {
            if (!hasEditorChanges()) return;
            event.stopImmediatePropagation();
            // Restore the current entry while the user decides. The intended
            // destination is now two entries back (the attempted pop + this push).
            window.history.pushState(window.history.state, '', `${location.pathname}${location.search}${location.hash}`);
            setPendingLeave(() => () => navigate(-2));
            setLeaveAlertOpen(true);
        };
        window.addEventListener('popstate', onBrowserBack, true);
        return () => window.removeEventListener('popstate', onBrowserBack, true);
    }, [location.pathname, location.search, location.hash, navigate]);

    const displayName = useMemo(() => {
        try {
            const labels = ControlConfigurationStore.getCapabilityLabels();
            return (capability ? labels[capability.id]?.trim() : undefined)
                || capability?.name
                || 'Control';
        } catch {
            return capability?.name || 'Control';
        }
    }, [capability]);
    // IonRouterOutlet retains the editor while another page is becoming active.
    // Its route state may already be cleared during that transition, so do not
    // render a missing-capability error for an editor page that is no longer active.
    const isActiveControlEditorRoute = location.pathname.startsWith('/control-editor/');
    if (!isActiveControlEditorRoute) return <IonPage />;

    if (!capability) return <IonPage><IonContent className="ion-padding"><IonText color="danger">Capability not found.</IonText><IonButton onClick={() => navigate('/controller-dashboard')}>Return</IonButton></IonContent></IonPage>;
    const analogChannels = capability.channels.filter(c => c.valueType === 'analog' && (policies[channelPolicyKey(capability.id, c.id)] ?? c.supportedPolicies[0]) === 'analog_curve');
    const binaryCurveChannels = capability.channels.filter(c => c.valueType === 'binary' && (policies[channelPolicyKey(capability.id, c.id)] ?? c.supportedPolicies[0]) === 'binary_curve');
    const binaryOtherChannels = capability.channels.filter(c => c.valueType === 'binary' && (policies[channelPolicyKey(capability.id, c.id)] ?? c.supportedPolicies[0]) !== 'binary_curve');
    const binaryCurves: CurveDefinition[] = binaryCurveChannels.map((channel, index) => {
        const saved = inlineConfigs[channel.id]?.curve as CurveDefinition | undefined;
        return {
            id: channel.id, label: channel.label,
            color: colors[channelPolicyKey(capability.id, channel.id)] ?? saved?.color ?? palette[index % palette.length],
            points: Array.isArray(saved?.points) ? saved.points.map(point => ({ ...point })) : [
                { x: 0, y: 0 }, { x: 7, y: 0 }, { x: 10, y: 1 }, { x: 17, y: 0 }, { x: 24, y: 0 },
            ],
        };
    });
    const activeBinaryChannel = binaryCurveChannels.find(c => c.id === selectedBinaryChannel) ?? binaryCurveChannels[0];
    const activeBinaryCurve = binaryCurves.find(c => c.id === activeBinaryChannel?.id);
    const updateBinaryCurve = (changed: CurveDefinition[]) => {
        if (!activeBinaryChannel) return;
        const nextCurve = changed.find(curve => curve.id === activeBinaryChannel.id);
        if (!nextCurve) return;
        setInlineConfigs(current => {
            const next = { ...current, [activeBinaryChannel.id]: { ...(current[activeBinaryChannel.id] ?? {}), curve: nextCurve } };
            ControlConfigurationStore.saveInlineConfigurations(capability.id, next);
            return next;
        });
        setSelectedProfile(''); setProfileName('');
    };
    // Trigger channels are operation-level actuators, not binary hardware outputs.
    // Keep their editor separate so they never fall through the binary editor path.
    const triggerChannels = capability.channels.filter(c => c.valueType === 'trigger' &&
        (policies[channelPolicyKey(capability.id, c.id)] ?? c.supportedPolicies[0]) === 'trigger');
    const analogGroups = Object.values(analogChannels.reduce<Record<string, typeof analogChannels>>((groups, channel) => { const key = `${channel.unit ?? ''}|${channel.min ?? 0}|${channel.max ?? 100}`; (groups[key] ??= []).push(channel); return groups; }, {}));
    const axisFor = (group: typeof analogChannels): CurveAxis => { const min = group[0]?.min ?? 0, max = group[0]?.max ?? 100; return { label: group[0]?.unit ? `Output (${group[0].unit})` : 'Output', min, max, unit: group[0]?.unit, ticks: [min, min + (max - min) * .25, min + (max - min) * .5, min + (max - min) * .75, max] }; };
    const saveCurves = (next: CurveDefinition[]) => { setCurves(next); ControlConfigurationStore.saveCurves(capability.id, next); };
    const activeAnalogChannel = analogChannels.find(c => c.id === selectedAnalogChannel) ?? analogChannels[0];
    const activeAnalogCurve = activeAnalogChannel ? curves.find(c => c.id === activeAnalogChannel.id) : undefined;
    const loadProfile = (value: string) => {
        const profile = customProfiles.find(item => item.profileId === value);
        if (!profile) return;

        const nextCurves = [...curves];
        const nextInline = { ...inlineConfigs };
        const nextPolicies = { ...policies };
        let restored = 0;
        for (const savedChannel of profile.channels) {
            const channel = capability.channels.find(candidate => candidate.id === savedChannel.channelId);
            if (!channel) continue;
            const policy = savedChannel.policy as ControlPolicy;
            if (channel.supportedPolicies.includes(policy)) {
                nextPolicies[channelPolicyKey(capability.id, channel.id)] = policy;
                try { ControlConfigurationStore.setChannelPolicy(capability.id, channel.id, policy); } catch (error) { console.error('Could not restore channel policy.', error); }
            }
            const config = savedChannel.configuration ?? {};
            // The policy determines the editor's state owner. A binary_curve
            // also contains a `curve`, but it belongs in inlineConfigurations,
            // not in the analogue curves collection.
            if (policy === 'analog_curve') {
                const curve = (config as { curve?: CurveDefinition | null }).curve;
                if (curve && Array.isArray(curve.points)) {
                    const normalized = { ...curve, id: channel.id, label: channel.label, points: curve.points.map(point => ({ ...point })) };
                    const existingIndex = nextCurves.findIndex(item => item.id === channel.id);
                    if (existingIndex >= 0) nextCurves[existingIndex] = normalized; else nextCurves.push(normalized);
                    restored += 1;
                }
            } else {
                nextInline[channel.id] = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
                restored += 1;
            }
        }
        if (!restored) { setProfileNotice('This profile has no channel configurations compatible with this control.'); return; }
        setPolicies(nextPolicies); setInlineConfigs(nextInline); setCurves(nextCurves);
        try {
            ControlConfigurationStore.saveCurves(capability.id, nextCurves);
            ControlConfigurationStore.saveInlineConfigurations(capability.id, nextInline);
        } catch (error) { console.error('Could not restore profile configuration.', error); }
        setSelectedProfile(value); setProfileName(profile.name);
        setProfileNotice(`Loaded ${profile.name}. Save when leaving this editor to retain the loaded profile.`);
    };
    const saveProfile = () => {
        const invalidTrigger = Object.entries(inlineConfigs).find(([, config]) => !validateTriggerRangeConfiguration(config).valid);
        if (invalidTrigger) { setProfileNotice(validateTriggerRangeConfiguration(invalidTrigger[1]).message ?? 'Correct the trigger range before saving a profile.'); return; }
        const name = profileName.trim();
        if (!name) { setProfileNotice('Enter a name for the profile first.'); return; }
        const snapshot: ControlProfile = {
            profileId: `custom:${controlId}:${name}`, controlId, capabilityId: capability.id, name, source: 'custom',
            channels: capability.channels.map(channel => {
                const policy = policies[channelPolicyKey(capability.id, channel.id)] ?? channel.supportedPolicies[0] ?? 'unassigned';
                const configuration = policy === 'analog_curve'
                    ? { curve: curves.find(curve => curve.id === channel.id) ?? null }
                    : { ...(inlineConfigs[channel.id] ?? {}) };
                return { channelId: channel.id, policy, configuration };
            }),
        };
        const next = [...customProfiles.filter(profile => profile.name.toLowerCase() !== name.toLowerCase()), snapshot];
        try { ControlProfileStore.saveCustomProfiles(controlId, capability.id, next); setCustomProfiles(next); setSelectedProfile(snapshot.profileId); setProfileName(name); setProfileNotice(`Added profile “${name}” to the working configuration. Save when leaving this editor to persist it.`); }
        catch { setProfileNotice('Could not save the profile locally.'); }
    };
    const deleteProfile = () => {
        const selected = customProfiles.find(profile => profile.profileId === selectedProfile);
        if (!selected) return;
        const next = customProfiles.filter(profile => profile.profileId !== selected.profileId);
        try { ControlProfileStore.saveCustomProfiles(controlId, capability.id, next); setCustomProfiles(next); setSelectedProfile(''); setProfileNotice(`Removed profile “${selected.name}” from the working configuration. Save when leaving this editor to persist the change.`); }
        catch { setProfileNotice('Could not delete the profile.'); }
    };
    const updateActiveCurve = (changed: CurveDefinition[]) => {
        if (!activeAnalogChannel) return;
        saveCurves(curves.map(c => c.id === activeAnalogChannel.id ? (changed.find(x => x.id === c.id) ?? c) : c));
        setSelectedProfile(''); setProfileName('');
    };
    const saveColor = (channelId: string, color: string) => { const key = channelPolicyKey(capability.id, channelId); const next = { ...colors, [key]: color }; setColors(next); ControlConfigurationStore.setChannelColor(capability.id, channelId, color); setCurves(current => current.map(c => c.id === channelId ? { ...c, color } : c)); };
    const requestBack = () => {
        const leave = () => navigate(-1);
        if (hasEditorChanges()) {
            setPendingLeave(() => leave);
            setLeaveAlertOpen(true);
            return;
        }
        leave();
    };
    const leaveAfterSave = () => {
        try {
            const invalidTrigger = Object.entries(inlineConfigs).find(([, config]) => !validateTriggerRangeConfiguration(config).valid);
            if (invalidTrigger) {
                setLeaveError(validateTriggerRangeConfiguration(invalidTrigger[1]).message ?? 'Correct the trigger range before saving.');
                return false;
            }
            const thresholdError = validateThresholdConfigurations(ControlConfigurationStore.load());
            if (thresholdError) { setLeaveError(thresholdError); return false; }
            ControlConfigurationStore.save();
            if (route?.controller?.deviceId) markLocalConfigurationPending(route.controller.deviceId);
            setLeaveAlertOpen(false);
            const action = pendingLeave;
            setPendingLeave(null);
            action?.();
            return true;
        } catch (error) {
            setLeaveError(error instanceof Error ? error.message : 'Could not save configuration.');
            return false;
        }
    };
    const leaveAfterDiscard = () => {
        try {
            if (capability && editorBaseline) {
                ControlConfigurationStore.restoreControlEditorSnapshot(capability.id, editorBaseline);
            }
            setLeaveAlertOpen(false);
            const action = pendingLeave;
            setPendingLeave(null);
            action?.();
            return true;
        } catch (error) {
            setLeaveError(error instanceof Error ? error.message : 'Could not discard changes.');
            return false;
        }
    };
    return <IonPage><IonHeader><IonToolbar><IonButtons slot="start"><IonButton fill="clear" onClick={requestBack} aria-label="Back to dashboard"><IonIcon slot="icon-only" icon={arrowBack} /></IonButton></IonButtons><IonTitle>{displayName}</IonTitle></IonToolbar></IonHeader><IonContent className="ion-padding">
            <IonCard><IonCardContent>
                <h2>Profiles</h2>
                <p>Save and reuse the complete configuration of every channel in this control.</p>
                <IonItem><IonLabel position="stacked">Profile</IonLabel>
                    <IonSelect interface="popover" value={selectedProfile} placeholder={customProfiles.length ? 'Select a profile' : 'No saved profiles'} onIonChange={e => loadProfile(String(e.detail.value ?? ''))}>
                        {customProfiles.map(p => <IonSelectOption key={p.profileId} value={p.profileId}>{p.name}</IonSelectOption>)}
                    </IonSelect>
                </IonItem>
                <IonItem><IonLabel position="stacked">Save as custom profile</IonLabel><IonInput value={profileName} onIonInput={e => setProfileName(e.detail.value ?? '')} placeholder="e.g. My preferred settings" /></IonItem>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <IonButton onClick={saveProfile}>Save Profile</IonButton>
                    <IonButton color="danger" fill="outline" disabled={!customProfiles.some(profile => profile.profileId === selectedProfile)} onClick={deleteProfile}>Delete Selected Profile</IonButton>
                </div>
                <IonNote>{profileNotice}</IonNote>
            </IonCardContent></IonCard>
        {analogChannels.length > 0 && <>

            {analogChannels.length > 1 && <>
                {analogGroups.map((group, index) => <IonCard key={`${group[0].unit ?? ''}-${group[0].min}-${group[0].max}`}><IonCardContent>
                    <h2>{analogGroups.length > 1 ? `${group[0].unit || 'Analogue'} channel group ${index + 1}` : `${displayName} · channel overview`}</h2>
                    <p>Read-only overview of the analogue curves in this compatible channel group.</p>
                    <CurveEditor xAxis={X_AXIS} yAxis={axisFor(group)} mode="analog" curves={curves.filter(c => group.some(a => a.id === c.id))} onChange={() => undefined} readOnly selectedCurveId={selectedAnalogChannel} currentTime={aquariumTime} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>{group.map((c, i) => <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 8, background: colors[channelPolicyKey(capability.id, c.id)] ?? curves.find(x => x.id === c.id)?.color ?? palette[i % palette.length] }} /><span>{c.label}</span><IonSelect interface="popover" value={colors[channelPolicyKey(capability.id, c.id)] ?? curves.find(x => x.id === c.id)?.color ?? palette[i % palette.length]} onIonChange={e => saveColor(c.id, String(e.detail.value))}>{palette.map(color => <IonSelectOption key={color} value={color}>{color}</IonSelectOption>)}</IonSelect></div>)}</div>
                </IonCardContent></IonCard>)}
            </>}
            <IonCard><IonCardContent>
                <h2>{analogChannels.length > 1 ? 'Individual channel editor' : analogChannels[0].label}</h2>
                {analogChannels.length > 1 && <IonItem><IonLabel position="stacked">Channel</IonLabel><IonSelect interface="popover" value={activeAnalogChannel?.id ?? ''} onIonChange={e => setSelectedAnalogChannel(String(e.detail.value))}>{analogChannels.map(c => <IonSelectOption key={c.id} value={c.id}>{c.label}</IonSelectOption>)}</IonSelect></IonItem>}
                {activeAnalogCurve && activeAnalogChannel && <CurveEditor xAxis={X_AXIS} yAxis={axisFor([activeAnalogChannel])} mode="analog" curves={[activeAnalogCurve]} onChange={updateActiveCurve} title={`Edit ${activeAnalogChannel.label}`} currentTime={aquariumTime} />}
            </IonCardContent></IonCard>
        </>}
        {binaryCurveChannels.length > 0 && <>
            {binaryCurveChannels.length > 1 && <IonCard><IonCardContent>
                <h2>{displayName} · binary channel overview</h2>
                <p>Read-only overview of all binary schedules in this capability.</p>
                <CurveEditor xAxis={X_AXIS} yAxis={BINARY_AXIS} mode="binary" curves={binaryCurves} onChange={() => undefined} readOnly selectedCurveId={activeBinaryChannel?.id} currentTime={aquariumTime} />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                    {binaryCurves.map(curve => <div key={curve.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 8, background: curve.color }} />
                        <span>{curve.label}</span>
                        <IonSelect interface="popover" value={curve.color} onIonChange={e => {
                            const color = String(e.detail.value);
                            saveColor(curve.id, color);
                            setInlineConfigs(current => {
                                const next = { ...current, [curve.id]: { ...(current[curve.id] ?? {}), curve: { ...curve, color } } };
                                ControlConfigurationStore.saveInlineConfigurations(capability.id, next);
                                return next;
                            });
                        }}>{palette.map(color => <IonSelectOption key={color} value={color}>{color}</IonSelectOption>)}</IonSelect>
                    </div>)}
                </div>
            </IonCardContent></IonCard>}
            <IonCard><IonCardContent>
                <h2>{binaryCurveChannels.length > 1 ? 'Individual binary channel editor' : binaryCurveChannels[0].label}</h2>
                {binaryCurveChannels.length > 1 && <IonItem><IonLabel position="stacked">Channel</IonLabel>
                    <IonSelect interface="popover" value={activeBinaryChannel?.id ?? ''} onIonChange={e => setSelectedBinaryChannel(String(e.detail.value))}>
                        {binaryCurveChannels.map(channel => <IonSelectOption key={channel.id} value={channel.id}>{channel.label}</IonSelectOption>)}
                    </IonSelect>
                </IonItem>}
                {activeBinaryCurve && <CurveEditor xAxis={X_AXIS} yAxis={BINARY_AXIS} mode="binary" curves={[activeBinaryCurve]} onChange={updateBinaryCurve} title={`Edit ${activeBinaryChannel.label}`} currentTime={aquariumTime} />}
            </IonCardContent></IonCard>
        </>}
        {binaryOtherChannels.map(c => {
            const key = channelPolicyKey(capability.id, c.id);
            const policy = policies[key] ?? c.supportedPolicies[0];
            return <IonCard key={c.id}><IonCardContent>
                <h2>{c.label}</h2>
                <IonNote>{policy ? POLICY_LABELS[policy] : 'No control surface assigned in Control Settings'}</IonNote>
                {policy && policy !== 'periodic_pulse' && <InlineChannelEditor capabilities={availableCapabilities} currentTime={aquariumTime} capabilityId={capability.id} channelId={c.id} channelLabel={c.label} policy={policy} unit={c.unit} min={c.min} max={c.max} value={inlineConfigs[c.id]} onChange={value => setInlineConfigs(current => { const next = { ...current, [c.id]: value }; ControlConfigurationStore.saveInlineConfigurations(capability.id, next); return next; })} />}
            </IonCardContent></IonCard>;
        })}
        {triggerChannels.map(c => <IonCard key={c.id}><IonCardContent>
            <h2>{c.label}</h2>
            <IonNote>{POLICY_LABELS.trigger}</IonNote>
            <InlineChannelEditor capabilities={availableCapabilities} currentTime={aquariumTime} capabilityId={capability.id} channelId={c.id} channelLabel={c.label} policy="trigger" onInvoke={controller ? () => invokeManualOperation(capability.id, c.id) : undefined} onReadExecutionState={controller ? () => readExecutionState(capability.id, c.id) : undefined} value={inlineConfigs[c.id]} onChange={value => setInlineConfigs(current => { const next = { ...current, [c.id]: value }; ControlConfigurationStore.saveInlineConfigurations(capability.id, next); return next; })} />
        </IonCardContent></IonCard>)}
    </IonContent>
        <IonAlert isOpen={leaveAlertOpen} header="Unsaved changes" message={leaveError || "You have changes that have not been saved. What would you like to do?"} onDidDismiss={() => { setLeaveAlertOpen(false); setLeaveError(''); setPendingLeave(null); }} buttons={[
            { text: 'Save and leave', handler: leaveAfterSave },
            { text: 'Discard and leave', role: 'destructive', handler: leaveAfterDiscard },
            { text: 'Stay', role: 'cancel' },
        ]} />
    </IonPage>;
};
export default ControlEditorPage;
