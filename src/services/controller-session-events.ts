export interface SessionInvalidation {
    address: string;
    httpPort: number;
    sessionToken: string;
}

type Listener = (event: SessionInvalidation) => void;
const listeners = new Set<Listener>();
const rejected = new Set<string>();
const key = (event: SessionInvalidation) => JSON.stringify([event.address, event.httpPort, event.sessionToken]);

export function isRejectedSession(event: SessionInvalidation): boolean {
    return rejected.has(key(event));
}

export function reportSessionInvalidation(event: SessionInvalidation): void {
    const id = key(event);
    rejected.add(id);
    for (const listener of listeners) listener(event);
}

export function subscribeSessionInvalidation(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
