import {
    controllerRequest,
    ControllerApiError,
} from './controller-api';
import type { CapabilityValueType } from '../config/controller-capabilities';

/** Numeric transport types accepted by the firmware capability API. */
export type CapabilityTransportValueType = 'int32' | 'uint32' | 'float32' | 'float64';

export interface CapabilityNumericValue {
    numericValue: string;
    valueType: CapabilityTransportValueType;
}

export interface CapabilityReadResult {
    capabilityId: string;
    channelId: string;
    kind: 'sensor' | 'actuator';
    available: boolean;
    value?: CapabilityNumericValue;
    /** Sensor-only measurement quality fields. */
    measurementValid?: boolean;
    measurementStatus?: string;
    unit?: string;
    /** Unix UTC seconds; zero means the driver has no timestamp. */
    timestamp?: number;
    /** Actuator-only read failure detail. */
    readStatus?: string;
}

export interface CapabilityWriteResult {
    capabilityId: string;
    channelId: string;
    kind: 'actuator';
    writeApplied: boolean;
    readbackAvailable: boolean;
    appliedValue: CapabilityNumericValue;
    currentValue?: CapabilityNumericValue;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumericValue(value: unknown, fieldName: string): CapabilityNumericValue {
    if (!isRecord(value) ||
        typeof value.numeric_value !== 'string' ||
        typeof value.value_type !== 'string' ||
        !['int32', 'uint32', 'float32', 'float64'].includes(value.value_type)) {
        throw new ControllerApiError(`Controller returned an invalid ${fieldName}.`);
    }

    return {
        numericValue: value.numeric_value,
        valueType: value.value_type as CapabilityTransportValueType,
    };
}

function validateAddressAndIdentity(
    capabilityId: string,
    channelId: string,
    sessionToken: string,
): void {
    if (!sessionToken) {
        throw new ControllerApiError('An authenticated controller session is required.');
    }
    if (!capabilityId.trim() || capabilityId.length > 64) {
        throw new ControllerApiError('Capability ID must contain 1 to 64 characters.');
    }
    if (!channelId.trim() || channelId.length > 64) {
        throw new ControllerApiError('Channel ID must contain 1 to 64 characters.');
    }
}

/**
 * Read one declared capability channel.
 *
 * Sensor results include measurement validity/status separately from transport
 * availability. A driver can respond successfully while reporting an invalid
 * or disconnected measurement.
 */
export async function getCapability(
    address: string,
    httpPort: number,
    sessionToken: string,
    capabilityId: string,
    channelId: string,
): Promise<CapabilityReadResult> {
    validateAddressAndIdentity(capabilityId, channelId, sessionToken);

    const response = await controllerRequest<UnknownRecord>(
        address,
        httpPort,
        'get_capability',
        {
            session_token: sessionToken,
            capability_id: capabilityId,
            channel_id: channelId,
        },
    );

    const data = response.data;
    if (data.capability_id !== capabilityId ||
        data.channel_id !== channelId ||
        (data.kind !== 'sensor' && data.kind !== 'actuator') ||
        typeof data.available !== 'boolean') {
        throw new ControllerApiError('Controller returned an invalid capability-read response.');
    }

    const result: CapabilityReadResult = {
        capabilityId,
        channelId,
        kind: data.kind,
        available: data.available,
    };

    if (data.available) {
        result.value = readNumericValue(data.value, 'capability value');
    }

    if (data.kind === 'sensor') {
        if (typeof data.measurement_valid !== 'boolean' ||
            typeof data.measurement_status !== 'string') {
            throw new ControllerApiError('Controller returned invalid sensor measurement status.');
        }
        result.measurementValid = data.measurement_valid;
        result.measurementStatus = data.measurement_status;

        if (data.available) {
            if (typeof data.unit !== 'string' ||
                typeof data.timestamp !== 'number' ||
                !Number.isFinite(data.timestamp) ||
                data.timestamp < 0) {
                throw new ControllerApiError('Controller returned invalid sensor measurement metadata.');
            }
            result.unit = data.unit;
            result.timestamp = data.timestamp;
        }
    } else if (!data.available && typeof data.read_status === 'string') {
        result.readStatus = data.read_status;
    }

    return result;
}



export interface SensorHistoryPoint {
    timestamp: number;
    value: number | null;
}

export interface SensorHistoryResult {
    capabilityId: string;
    channelId: string;
    componentId?: string;
    points: SensorHistoryPoint[];
}

/** Retrieve the most recent aggregated history for a public sensor channel. */
export async function getSensorHistory(
    address: string,
    httpPort: number,
    sessionToken: string,
    capabilityId: string,
    channelId: string,
    limit = 288,
): Promise<SensorHistoryResult> {
    validateAddressAndIdentity(capabilityId, channelId, sessionToken);
    if (!Number.isInteger(limit) || limit < 1 || limit > 288) {
        throw new ControllerApiError('Sensor history limit must be between 1 and 288.');
    }

    const response = await controllerRequest<UnknownRecord>(
        address,
        httpPort,
        'get_sensor_history',
        {
            session_token: sessionToken,
            capability_id: capabilityId,
            channel_id: channelId,
            limit,
        },
    );

    const data = response.data;
    if (data.capability_id !== capabilityId || data.channel_id !== channelId || !Array.isArray(data.points)) {
        throw new ControllerApiError('Controller returned an invalid sensor-history response.');
    }

    const points: SensorHistoryPoint[] = [];
    for (const rawPoint of data.points) {
        if (!isRecord(rawPoint) || typeof rawPoint.timestamp !== 'number' ||
            !Number.isFinite(rawPoint.timestamp) || rawPoint.timestamp <= 0 ||
            (rawPoint.value !== null && (typeof rawPoint.value !== 'number' || !Number.isFinite(rawPoint.value)))) {
            throw new ControllerApiError('Controller returned an invalid point in sensor history.');
        }
        points.push({ timestamp: rawPoint.timestamp, value: rawPoint.value });
    }

    points.sort((a, b) => a.timestamp - b.timestamp);
    return {
        capabilityId,
        channelId,
        ...(typeof data.component_id === 'string' ? { componentId: data.component_id } : {}),
        points,
    };
}

/**
 * Write one actuator channel.
 *
 * The public capability declaration determines the transport type:
 * binary -> int32 (0 or 1), analog -> float32. Firmware remains authoritative
 * for declared ranges and driver-specific acceptance.
 */
export async function setCapability(
    address: string,
    httpPort: number,
    sessionToken: string,
    capabilityId: string,
    channelId: string,
    channelValueType: CapabilityValueType,
    numericValue: number | string,
): Promise<CapabilityWriteResult> {
    validateAddressAndIdentity(capabilityId, channelId, sessionToken);

    if (typeof numericValue !== 'number' && typeof numericValue !== 'string') {
        throw new ControllerApiError('Capability value must be numeric.');
    }

    const parsedValue = typeof numericValue === 'number'
        ? numericValue
        : Number(numericValue);

    if (!Number.isFinite(parsedValue)) {
        throw new ControllerApiError('Capability value must be a finite number.');
    }

    let transportValueType: 'int32' | 'float32';
    if (channelValueType === 'binary') {
        if (parsedValue !== 0 && parsedValue !== 1) {
            throw new ControllerApiError('Binary capability values must be 0 or 1.');
        }
        transportValueType = 'int32';
    } else if (channelValueType === 'analog') {
        transportValueType = 'float32';
    } else {
        throw new ControllerApiError('Unsupported capability value type.');
    }

    const response = await controllerRequest<UnknownRecord>(
        address,
        httpPort,
        'set_capability',
        {
            session_token: sessionToken,
            capability_id: capabilityId,
            channel_id: channelId,
            value: {
                // Normalize the lexical representation so values such as "1.0"
                // become "1" for the firmware's strict binary 0/1 validation.
                numeric_value: String(parsedValue),
                value_type: transportValueType,
            },
        },
    );

    const data = response.data;
    if (data.capability_id !== capabilityId ||
        data.channel_id !== channelId ||
        data.kind !== 'actuator' ||
        typeof data.write_applied !== 'boolean' ||
        typeof data.readback_available !== 'boolean') {
        throw new ControllerApiError('Controller returned an invalid capability-write response.');
    }

    const result: CapabilityWriteResult = {
        capabilityId,
        channelId,
        kind: 'actuator',
        writeApplied: data.write_applied,
        readbackAvailable: data.readback_available,
        appliedValue: readNumericValue(data.applied_value, 'applied capability value'),
    };

    if (data.readback_available) {
        result.currentValue = readNumericValue(data.current_value, 'capability readback value');
    }

    if (!result.writeApplied) {
        throw new ControllerApiError('Controller acknowledged the request but did not apply the actuator value.');
    }

    return result;
}
