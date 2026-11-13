import { controllerRequest, ControllerApiError } from './controller-api';

export interface CalibrationPoint { raw: number; reference: number }
export interface SensorCalibration {
    componentId: string;
    calibrated: boolean;
    points: CalibrationPoint[];
    minimum: number;
    maximum: number;
    rawValue?: number;
    calibratedValue?: number;
}

type JsonRecord = Record<string, unknown>;
const record = (value: unknown): value is JsonRecord => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function numericReading(value: unknown): number | undefined {
    if (typeof value !== 'string' && typeof value !== 'number') return undefined;
    if (typeof value === 'string' && !value.trim()) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}
function parseCalibration(data: JsonRecord): SensorCalibration {
    if (typeof data.component_id !== 'string' || typeof data.calibrated !== 'boolean' ||
        !finite(data.minimum) || !finite(data.maximum) || data.minimum >= data.maximum || !Array.isArray(data.points)) {
        throw new ControllerApiError('Controller returned an invalid calibration response.');
    }
    const points: CalibrationPoint[] = data.points.map((point: unknown) => {
        if (!record(point) || !finite(point.raw) || !finite(point.reference)) {
            throw new ControllerApiError('Controller returned an invalid calibration point.');
        }
        return { raw: point.raw, reference: point.reference };
    });
    return {
        componentId: data.component_id,
        calibrated: data.calibrated,
        points,
        minimum: data.minimum,
        maximum: data.maximum,
        rawValue: numericReading(data.raw_value),
        calibratedValue: numericReading(data.calibrated_value),
    };
}
async function calibrationRequest(address: string, port: number, token: string, capabilityId: string,
    channelId: string, operation: string, points?: CalibrationPoint[]): Promise<SensorCalibration> {
    if (!token) throw new ControllerApiError('An authenticated controller session is required.');
    const response = await controllerRequest<JsonRecord>(address, port, operation, {
        session_token: token, capability_id: capabilityId, channel_id: channelId,
        ...(points === undefined ? {} : { points }),
    });
    return parseCalibration(response.data);
}
export const getSensorCalibration = (address: string, port: number, token: string, capabilityId: string, channelId: string) =>
    calibrationRequest(address, port, token, capabilityId, channelId, 'get_sensor_calibration');
export const setSensorCalibration = (address: string, port: number, token: string, capabilityId: string, channelId: string, points: CalibrationPoint[]) =>
    calibrationRequest(address, port, token, capabilityId, channelId, 'set_sensor_calibration', points);
export const clearSensorCalibration = (address: string, port: number, token: string, capabilityId: string, channelId: string) =>
    calibrationRequest(address, port, token, capabilityId, channelId, 'clear_sensor_calibration');
