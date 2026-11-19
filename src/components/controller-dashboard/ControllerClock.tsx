import { useEffect, useState } from 'react';
import { getTimeStatus, type TimeStatus } from '../../services/controller-api';

interface Props {
    address: string;
    httpPort: number;
    sessionToken: string;
}

/** Controller schedule time, not the handset's local timezone or clock. */
const ControllerClock: React.FC<Props> = ({ address, httpPort, sessionToken }) => {
    const [sample, setSample] = useState<{ status: TimeStatus; receivedAt: number } | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [stale, setStale] = useState(false);

    useEffect(() => {
        setSample(null);
        setStale(false);
        if (!sessionToken) return;
        let active = true;
        const refresh = async () => {
            try {
                const status = await getTimeStatus(address, httpPort, sessionToken);
                if (active) {
                    setSample({ status, receivedAt: Date.now() });
                    setStale(false);
                }
            } catch {
                if (active) setStale(true);
            }
        };
        void refresh();
        const syncInterval = window.setInterval(() => { void refresh(); }, 60_000);
        const tickInterval = window.setInterval(() => setNow(Date.now()), 1000);
        return () => {
            active = false;
            window.clearInterval(syncInterval);
            window.clearInterval(tickInterval);
        };
    }, [address, httpPort, sessionToken]);

    const valid = sample?.status.clock_valid && Number.isFinite(sample.status.schedule_unix_time)
        && sample.status.schedule_unix_time > 0;
    const scheduleMs = valid && sample
        ? sample.status.schedule_unix_time * 1000 + Math.max(0, now - sample.receivedAt)
        : null;
    const display = scheduleMs === null ? '--:--:--' : new Date(scheduleMs).toLocaleTimeString('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC',
    });
    return <div role="status" aria-label="Controller time" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
        margin: '0 auto 0.8rem', color: 'var(--ion-text-color)', opacity: stale ? 0.65 : 1,
        fontVariantNumeric: 'tabular-nums',
    }}>
        <strong style={{ fontSize: '1.25rem', letterSpacing: '0.07em' }}>{display}</strong>
        {(!sessionToken || !valid || stale) && <span style={{ fontSize: '0.72rem', opacity: 0.75 }}>
            {!sessionToken ? 'Connecting' : !sample ? (stale ? 'Unavailable' : 'Syncing')
                : !valid ? 'Clock not set' : 'Last known time'}
        </span>}
    </div>;
};

export default ControllerClock;
