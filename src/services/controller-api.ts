import { CapacitorHttp } from '@capacitor/core';
import type { SavedController } from '../models/saved-controller';
import { isControllerCapability, type ControllerCapability } from '../config/controller-capabilities';

export const CONTROLLER_API_PATH = '/api/v1';
export const CONTROLLER_PROTOCOL_VERSION = '0.1';
export const CONTROLLER_API_TIMEOUT_MS = 20000;

export interface DeviceInfo {
    device_id: string;
    protocol_version?: string;
    product?: string;
    firmware_version?: string;
    hardware_family?: string;
    [key: string]: unknown;
}

export interface ControllerApiResponse<T extends Record<string, unknown> = Record<string, unknown>> {
    request_id?: string;
    protocol_version?: string;
    status: 'ok';
    data: T;
}

export class ControllerApiError extends Error {
    readonly code?: string;
    readonly httpStatus?: number;

    constructor(message: string, options: { code?: string; httpStatus?: number } = {}) {
        super(message);
        this.name = 'ControllerApiError';
        this.code = options.code;
        this.httpStatus = options.httpStatus;
    }
}


/** Numeric parameter declaration published by a virtual sensor in the Product Specification. */
export interface VirtualSensorNumericParameter {
    type: 'number';
    label: string;
    description?: string;
    default: number;
    minimum?: number;
    maximum?: number;
    step?: number;
}

export interface VirtualSensorDeclaration {
    component_id: string;
    driver: string;
    capability_id: string;
    channel_id: string;
    parameters: Record<string, VirtualSensorNumericParameter>;
}

function isVirtualSensorDeclaration(value: unknown): value is VirtualSensorDeclaration {
    if (!isRecord(value)) return false;
    if (typeof value.component_id !== 'string' || !value.component_id ||
        typeof value.driver !== 'string' || !value.driver ||
        typeof value.capability_id !== 'string' || !value.capability_id ||
        typeof value.channel_id !== 'string' || !value.channel_id ||
        !isRecord(value.parameters)) return false;

    return Object.values(value.parameters).every(parameter => {
        if (!isRecord(parameter) || parameter.type !== 'number' ||
            typeof parameter.label !== 'string' ||
            typeof parameter.default !== 'number' || !Number.isFinite(parameter.default)) return false;
        if (parameter.description !== undefined && typeof parameter.description !== 'string') return false;
        if (parameter.minimum !== undefined && (typeof parameter.minimum !== 'number' || !Number.isFinite(parameter.minimum))) return false;
        if (parameter.maximum !== undefined && (typeof parameter.maximum !== 'number' || !Number.isFinite(parameter.maximum))) return false;
        if (parameter.step !== undefined && (typeof parameter.step !== 'number' || !Number.isFinite(parameter.step) || parameter.step <= 0)) return false;
        if (parameter.minimum !== undefined && parameter.default < parameter.minimum) return false;
        if (parameter.maximum !== undefined && parameter.default > parameter.maximum) return false;
        if (parameter.minimum !== undefined && parameter.maximum !== undefined && parameter.minimum > parameter.maximum) return false;
        return true;
    });
}

/** Exact capability document returned by the authenticated get_capabilities operation. */
export interface ControllerCapabilitiesDocument {
    device_id: string;
    controller: {
        product: string;
        firmware_version: string;
        hardware_family: string;
        flash_mb: number;
        psram_mb: number;
        [key: string]: unknown;
    };
    interfaces: string[];
    operations: Record<string, boolean>;
    capabilities: ControllerCapability[];
    /** Product Specification parameter schemas for virtual sensor components. */
    virtual_sensors?: VirtualSensorDeclaration[];
    [key: string]: unknown;
}

/** Exact configuration envelope returned by firmware get_configuration. */
export interface ControllerConfigurationReadResult {
    storage: string;
    configuration_exists: boolean;
    /** Unix UTC seconds from the controller; null when no saved configuration exists. */
    configuration_timestamp: number | null;
    /** Firmware-owned JSON document. Its schema is independent of the app's editor model. */
    configuration?: Record<string, unknown> | null;
    [key: string]: unknown;
}

export interface SetControllerConfigurationResult {
    saved: true;
    configuration_timestamp: number;
    [key: string]: unknown;
}

/** Retrieve the authenticated controller capability document. */
export async function getControllerCapabilities(
    address: string,
    httpPort: number,
    sessionToken: string,
): Promise<ControllerCapabilitiesDocument> {
    const response = await controllerRequest<ControllerCapabilitiesDocument>(
        address, httpPort, 'get_capabilities', { session_token: sessionToken },
    );
    const data = response.data;
    if (typeof data.device_id !== 'string' ||
        !isRecord(data.controller) ||
        typeof data.controller.product !== 'string' ||
        typeof data.controller.firmware_version !== 'string' ||
        typeof data.controller.hardware_family !== 'string' ||
        typeof data.controller.flash_mb !== 'number' ||
        typeof data.controller.psram_mb !== 'number' ||
        !Array.isArray(data.interfaces) || !data.interfaces.every(item => typeof item === 'string') ||
        !isRecord(data.operations) || !Object.values(data.operations).every(item => typeof item === 'boolean') ||
        !Array.isArray(data.capabilities) || !data.capabilities.every(isControllerCapability) ||
        (data.virtual_sensors !== undefined &&
            (!Array.isArray(data.virtual_sensors) || !data.virtual_sensors.every(isVirtualSensorDeclaration)))) {
        throw new ControllerApiError('Controller returned an invalid capability document.');
    }
    return data;
}

/** Retrieve the complete firmware-owned configuration envelope. */
export async function getControllerConfiguration(
    address: string,
    httpPort: number,
    sessionToken: string,
): Promise<ControllerConfigurationReadResult> {
    const response = await controllerRequest<ControllerConfigurationReadResult>(
        address, httpPort, 'get_configuration', { session_token: sessionToken },
    );
    const data = response.data;
    if (typeof data.storage !== 'string' || typeof data.configuration_exists !== 'boolean') {
        throw new ControllerApiError('Controller configuration response is invalid.');
    }
    if (data.configuration_exists) {
        if (typeof data.configuration_timestamp !== 'number' || !Number.isSafeInteger(data.configuration_timestamp) || data.configuration_timestamp <= 0 ||
            !isRecord(data.configuration)) {
            throw new ControllerApiError('Controller configuration or its Unix timestamp is missing or invalid.');
        }
    } else if (data.configuration_timestamp !== null && data.configuration_timestamp !== 0 && data.configuration_timestamp !== undefined) {
        throw new ControllerApiError('Controller reported no saved configuration but returned a configuration timestamp.');
    }
    return data;
}

/** Invoke a firmware-declared virtual actuator operation immediately. */
export async function invokeVirtualActuator(
    address: string,
    httpPort: number,
    sessionToken: string,
    capabilityId: string,
    channelId: string,
): Promise<void> {
    const response = await controllerRequest<{ accepted: boolean }>(
        address, httpPort, 'invoke_actuator', {
            session_token: sessionToken,
            capability_id: capabilityId,
            channel_id: channelId,
        },
    );
    if (response.data.accepted !== true) {
        throw new ControllerApiError('Controller did not accept the operation.');
    }
}

/** Read the authoritative runtime state of a virtual actuator. */
export async function getActuatorExecutionState(
    address: string, httpPort: number, sessionToken: string,
    capabilityId: string, channelId: string,
): Promise<'IDLE' | 'RUNNING'> {
    const response = await controllerRequest<{ capability_id: string; channel_id: string; execution_state: string }>(
        address, httpPort, 'get_actuator_execution_state', {
            session_token: sessionToken,
            capability_id: capabilityId,
            channel_id: channelId,
        },
    );
    const data = response.data;
    if (data.capability_id !== capabilityId || data.channel_id !== channelId ||
        (data.execution_state !== 'IDLE' && data.execution_state !== 'RUNNING')) {
        throw new ControllerApiError('Controller returned an invalid actuator execution state.');
    }
    return data.execution_state;
}

/** Persist a firmware-schema configuration. Mapping from the app editor model is handled separately. */
export async function setControllerConfiguration(
    address: string,
    httpPort: number,
    sessionToken: string,
    configuration: Record<string, unknown>,
): Promise<SetControllerConfigurationResult> {
    const response = await controllerRequest<SetControllerConfigurationResult>(
        address, httpPort, 'set_configuration', { session_token: sessionToken, configuration },
    );
    if (response.data.saved !== true || typeof response.data.configuration_timestamp !== 'number' || !Number.isSafeInteger(response.data.configuration_timestamp) || response.data.configuration_timestamp <= 0) {
        throw new ControllerApiError('Controller did not return a valid configuration-save acknowledgement.');
    }
    return response.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeResponse(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value) as unknown;
    } catch {
        throw new ControllerApiError('Controller returned invalid JSON.');
    }
}

function describeProtocolError(payload: Record<string, unknown>): ControllerApiError {
    const error = isRecord(payload.error) ? payload.error : undefined;
    const code = typeof error?.code === 'string' ? error.code : undefined;
    const message = typeof error?.message === 'string'
        ? error.message
        : typeof payload.message === 'string'
            ? payload.message
            : 'Controller rejected the API request.';
    return new ControllerApiError(code ? `${message} (${code})` : message, { code });
}

export async function controllerRequest<T extends Record<string, unknown> = Record<string, unknown>>(
    address: string,
    httpPort: number,
    operation: string,
    extraData: Record<string, unknown> = {},
): Promise<ControllerApiResponse<T>> {
    if (!address.trim()) throw new ControllerApiError('Controller IP address is missing.');
    if (!Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65535) {
        throw new ControllerApiError('Controller HTTP port is invalid.');
    }
    if (!operation.trim()) throw new ControllerApiError('Controller API operation is missing.');

    const url = `http://${address}:${httpPort}${CONTROLLER_API_PATH}`;
    const requestId = `prakiva-${Date.now()}-${++requestSequence}`;

    // CapacitorHttp can handle plain object bodies differently across native
    // platforms. In particular, nested configuration documents must be sent as
    // an explicit JSON string so the ESP32 receives the exact JSON payload.
    const requestPayload = {
        request_id: requestId,
        operation,
        protocol_version: CONTROLLER_PROTOCOL_VERSION,
        ...extraData,
    };

    let requestBody: string;
    try {
        requestBody = JSON.stringify(requestPayload);
        if (typeof requestBody !== 'string' || !requestBody.length) {
            throw new Error('The request body is empty.');
        }
    } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new ControllerApiError(`Could not serialize the controller request as JSON. ${detail}`);
    }

    let response;

    try {
        response = await CapacitorHttp.post({
            url,
            headers: { 'Content-Type': 'application/json' },
            data: requestBody,
            connectTimeout: CONTROLLER_API_TIMEOUT_MS,
            readTimeout: CONTROLLER_API_TIMEOUT_MS,
        });
    } catch (error: unknown) {
        const detail = error instanceof Error
            ? error.message
            : String(error);

        throw new ControllerApiError(
            `Could not reach the controller at ${address}:${httpPort}. ` +
            `Check the Wi-Fi connection and controller address. ${detail}`,
        );
    }

    if (response.status < 200 || response.status >= 300) {
        const body = decodeResponse(response.data);
        const detail = isRecord(body) ? describeProtocolError(body).message : JSON.stringify(body);
        throw new ControllerApiError(`Controller returned HTTP ${response.status}: ${detail}`, {
            httpStatus: response.status,
        });
    }

    const decoded = decodeResponse(response.data);
    if (!isRecord(decoded)) {
        throw new ControllerApiError('Controller returned an unexpected API response.');
    }

    if (decoded.status !== 'ok') {
        throw describeProtocolError(decoded);
    }
    if (!isRecord(decoded.data)) {
        throw new ControllerApiError('Controller returned a response without a valid data object.');
    }
    if (typeof decoded.request_id === 'string' && decoded.request_id !== requestId) {
        throw new ControllerApiError('Controller response request ID does not match the request.');
    }

    return decoded as unknown as ControllerApiResponse<T>;
}

let requestSequence = 0;

export async function getDeviceInfo(address: string, httpPort: number): Promise<DeviceInfo> {
    const response = await controllerRequest<DeviceInfo>(address, httpPort, 'get_device_info');
    if (typeof response.data.device_id !== 'string') {
        throw new ControllerApiError('Controller device-info response is missing its permanent device ID.');
    }
    return response.data;
}

export async function getSetupStatus(
    address: string,
    httpPort: number,
): Promise<Record<string, unknown>> {
    const response = await controllerRequest(address, httpPort, 'get_setup_status');
    return response.data;
}

export async function claimController(
    address: string,
    httpPort: number,
    userId: string,
    password: string,
    resetPin: string,
): Promise<Record<string, unknown>> {
    if (userId.length < 3 || userId.length > 32) {
        throw new Error('User ID must be between 3 and 32 characters.');
    }

    if (password.length < 8 || password.length > 64) {
        throw new Error('Password must be between 8 and 64 characters.');
    }

    if (!/^\d{10}$/.test(resetPin)) {
        throw new ControllerApiError('Reset PIN must contain exactly 10 digits.');
    }

    const response = await controllerRequest(
        address,
        httpPort,
        'claim_controller',
        {
            user_id: userId,
            password,
            reset_pin: resetPin,
        },
    );

    return response.data;
}

export async function authenticateOwner(
    address: string,
    httpPort: number,
    userId: string,
    password: string,
): Promise<Record<string, unknown>> {
    if (!userId.trim()) throw new ControllerApiError('Enter your owner user ID.');
    if (password.length < 1) throw new ControllerApiError('Enter your owner password.');

    const response = await controllerRequest(
        address,
        httpPort,
        'authenticate_owner',
        { user_id: userId.trim(), password },
    );

    if (response.data.authenticated !== true) {
        throw new ControllerApiError('The controller did not confirm authentication.');
    }

    return response.data;
}

export async function resetController(
    address: string,
    httpPort: number,
    pin: string,
): Promise<Record<string, unknown>> {
    if (!/^\d{10}$/.test(pin)) {
        throw new ControllerApiError(
            'The reset PIN must contain exactly 10 digits.',
        );
    }

    const response = await controllerRequest(
        address,
        httpPort,
        'reset_controller',
        { pin },
    );

    const data = response.data;

    if (
        data.setup_state !== 'unclaimed' ||
        data.setup_required !== true
    ) {
        throw new ControllerApiError(
            'The controller did not confirm a successful reset.',
        );
    }

    return data;
}

export function savedControllerFromDevice(
    device: { deviceId: string; address: string; httpPort: number; protocolVersion: string },
    data: DeviceInfo,
    name: string,
): SavedController {
    if (data.device_id !== device.deviceId) {
        throw new ControllerApiError('Device identity mismatch: HTTP response does not match UDP ID.');
    }
    return {
        deviceId: device.deviceId,
        name,
        address: device.address,
        httpPort: device.httpPort,
        protocolVersion: typeof data.protocol_version === 'string' ? data.protocol_version : device.protocolVersion,
        product: typeof data.product === 'string' ? data.product : 'Prakiva',
        firmwareVersion: typeof data.firmware_version === 'string' ? data.firmware_version : 'Unknown',
        hardwareFamily: typeof data.hardware_family === 'string' ? data.hardware_family : 'Unknown',
    };
}

export interface OwnerSession {
    device_id: string;
    authenticated: true;
    owner_user_id?: string;
    session_token: string;
}

export async function validateOwnerSession(
    address: string,
    httpPort: number,
    sessionToken: string,
): Promise<boolean> {
    if (!sessionToken) return false;
    const response = await controllerRequest(
        address, httpPort, 'validate_session', { session_token: sessionToken },
    );
    return response.data.session_valid === true;
}

export async function helloWorld(
    address: string,
    httpPort: number,
    sessionToken: string,
): Promise<string> {
    const response = await controllerRequest(
        address, httpPort, 'hello_world', { session_token: sessionToken },
    );
    if (typeof response.data.message !== 'string' || response.data.message.length === 0) {
        throw new ControllerApiError('The controller returned no hello-world message.');
    }
    return response.data.message;
}

export async function logoutOwner(
    address: string,
    httpPort: number,
    sessionToken: string,
): Promise<boolean> {
    const response = await controllerRequest(
        address, httpPort, 'logout', { session_token: sessionToken },
    );
    return response.data.logged_out === true;
}

export interface WifiStatus {
    wifi_type: 'AP' | 'STA' | string;
    wifi_status: string;
    [key: string]: unknown;
}

export interface WifiConfigResult {
    wifi_type: 'AP' | 'STA' | string;
    wifi_status: string;
    reconnect_required?: boolean;
    [key: string]: unknown;
}

export async function getWifiStatus(
    address: string,
    httpPort: number,
    sessionToken: string,
): Promise<WifiStatus> {
    const response = await controllerRequest<WifiStatus>(
        address, httpPort, 'get_wifi_status', { session_token: sessionToken },
    );
    if (typeof response.data.wifi_type !== 'string' ||
        typeof response.data.wifi_status !== 'string') {
        throw new ControllerApiError('Controller returned an invalid Wi-Fi status.');
    }
    return response.data;
}

export async function setWifiConfig(
    address: string,
    httpPort: number,
    sessionToken: string,
    wifiType: 'AP' | 'STA',
    ssid: string,
    password: string,
): Promise<WifiConfigResult> {
    if (!ssid.trim()) throw new ControllerApiError('Enter a Wi-Fi network name (SSID).');
    if (ssid.length > 32) throw new ControllerApiError('SSID must be 32 characters or fewer.');
    if (password.length > 63) throw new ControllerApiError('Wi-Fi password must be 63 characters or fewer.');
    if (wifiType === 'AP' && password.length > 0 && password.length < 8) {
        throw new ControllerApiError('A custom Prakiva Wi-Fi password must be empty or at least 8 characters.');
    }

    const response = await controllerRequest<WifiConfigResult>(
        address,
        httpPort,
        'set_wifi_config',
        { session_token: sessionToken, wifi_type: wifiType, ssid: ssid.trim(), password },
    );
    return response.data;
}

export interface TimeStatus {
    clock_valid: boolean;
    unix_time: number;
    rtc_available: boolean;
    sync_source: string;
    last_sync_unix: number;
    schedule_offset_minutes: number;
    schedule_unix_time: number;
    wifi_sta_connected: boolean;
    [key: string]: unknown;
}

function validateTimeStatus(data: Record<string, unknown>): TimeStatus {
    if (typeof data.clock_valid !== 'boolean' ||
        typeof data.rtc_available !== 'boolean' ||
        typeof data.wifi_sta_connected !== 'boolean' ||
        typeof data.schedule_offset_minutes !== 'number' ||
        typeof data.unix_time !== 'number' ||
        typeof data.last_sync_unix !== 'number' ||
        typeof data.schedule_unix_time !== 'number' ||
        typeof data.sync_source !== 'string') {
        throw new ControllerApiError('Controller returned an invalid time status.');
    }
    return data as TimeStatus;
}

export async function getTimeStatus(
    address: string,
    httpPort: number,
    sessionToken: string,
): Promise<TimeStatus> {
    const response = await controllerRequest<Record<string, unknown>>(
        address, httpPort, 'get_time_status', { session_token: sessionToken },
    );
    return validateTimeStatus(response.data);
}

export async function syncTimeFromPhone(
    address: string,
    httpPort: number,
    sessionToken: string,
    unixTime = Math.floor(Date.now() / 1000),
): Promise<TimeStatus> {
    if (!Number.isInteger(unixTime) || unixTime < 1704067200) {
        throw new ControllerApiError('Phone time is not a valid timestamp.');
    }
    const response = await controllerRequest<Record<string, unknown>>(
        address, httpPort, 'sync_time_phone',
        { session_token: sessionToken, unix_time: unixTime },
    );
    return validateTimeStatus(response.data);
}

export async function syncTimeFromNtp(
    address: string,
    httpPort: number,
    sessionToken: string,
): Promise<TimeStatus> {
    const response = await controllerRequest<Record<string, unknown>>(
        address, httpPort, 'sync_time_ntp', { session_token: sessionToken },
    );
    return validateTimeStatus(response.data);
}

export async function setScheduleOffset(
    address: string,
    httpPort: number,
    sessionToken: string,
    offsetMinutes: number,
): Promise<TimeStatus> {
    if (!Number.isInteger(offsetMinutes) || offsetMinutes < -720 || offsetMinutes > 720) {
        throw new ControllerApiError('Schedule offset must be between -720 and +720 minutes.');
    }
    const response = await controllerRequest<Record<string, unknown>>(
        address, httpPort, 'set_schedule_offset',
        { session_token: sessionToken, offset_minutes: offsetMinutes },
    );
    return validateTimeStatus(response.data);
}

