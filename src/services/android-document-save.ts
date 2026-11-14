import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeDocumentSaver {
    openDocument(options: { mimeType: string }): Promise<{ selected: boolean; base64?: string }>;
    saveDocument(options: { filename: string; mimeType: string; base64: string }): Promise<{ saved: boolean; uri?: string }>;
}
const DocumentSaver = registerPlugin<NativeDocumentSaver>('PrakivaDocumentSaver');

function toBase64(bytes: Uint8Array): string {
    let result = '';
    const step = 0x4000;
    for (let i = 0; i < bytes.length; i += step) {
        result += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return btoa(result);
}

/** Saves via Android's system document picker. Returns false if user cancels. */
export async function saveBackupDocument(blob: Blob, filename: string): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') {
        throw new Error('Native Save As is currently supported on Android only.');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = await DocumentSaver.saveDocument({
        filename,
        mimeType: 'application/octet-stream',
        base64: toBase64(bytes),
    });
    return result.saved;
}

/** Opens a PRAKIVA backup via Android Storage Access Framework; null means cancelled. */
export async function openBackupDocument(): Promise<Blob | null> {
    if (Capacitor.getPlatform() !== 'android') {
        throw new Error('Native Open Document is currently supported on Android only.');
    }
    const result = await DocumentSaver.openDocument({ mimeType: 'application/octet-stream' });
    if (!result.selected) return null;
    if (!result.base64) throw new Error('Selected document has no content.');
    const binary = atob(result.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'application/octet-stream' });
}
