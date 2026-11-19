/** Shared HTTP endpoint validation for remote sensors and actuators. */
export function validateHttpEndpoint(value: string): string {
    const endpoint = value.trim();
    if (!endpoint) throw new Error('Endpoint URI is required.');
    if (!/^https?:\/\//i.test(endpoint)) throw new Error('Endpoint URI must begin with http:// or https://.');
    try {
        const parsed = new URL(endpoint);
        if (!parsed.hostname || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid URL');
    } catch { throw new Error('Endpoint URI must be a valid HTTP or HTTPS URL.'); }
    return endpoint;
}
