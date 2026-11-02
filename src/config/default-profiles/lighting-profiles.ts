import type { BuiltinCurveProfile } from '../../models/control-profile';

/** Built-in profiles for the four-channel lighting capability only. */
const points = (values: Array<[number, number]>) => values.map(([x, y]) => ({ x, y }));
export const LIGHTING_DEFAULT_PROFILES: BuiltinCurveProfile[] = [
    {
        name: 'Tropical Day',
        curves: [
            { id: 'white', label: 'White', color: '#d1d5db', points: points([[0, 0], [5, 0], [8, 65], [12, 85], [16, 75], [20, 0], [24, 0]]) },
            { id: 'red', label: 'Red', color: '#ef4444', points: points([[0, 0], [6, 0], [9, 30], [13, 45], [17, 25], [21, 0], [24, 0]]) },
            { id: 'green', label: 'Green', color: '#22c55e', points: points([[0, 0], [6, 0], [9, 40], [13, 60], [17, 35], [21, 0], [24, 0]]) },
            { id: 'blue', label: 'Blue', color: '#3b82f6', points: points([[0, 8], [5, 8], [8, 35], [12, 60], [17, 45], [20, 8], [24, 8]]) },
        ],
    },
    {
        name: 'Equatorial Day',
        curves: [
            { id: 'white', label: 'White', color: '#d1d5db', points: points([[0, 0], [5, 0], [8, 70], [12, 80], [16, 70], [19, 0], [24, 0]]) },
            { id: 'red', label: 'Red', color: '#ef4444', points: points([[0, 0], [6, 0], [9, 30], [13, 40], [17, 25], [20, 0], [24, 0]]) },
            { id: 'green', label: 'Green', color: '#22c55e', points: points([[0, 0], [6, 0], [9, 45], [13, 55], [17, 35], [20, 0], [24, 0]]) },
            { id: 'blue', label: 'Blue', color: '#3b82f6', points: points([[0, 5], [5, 5], [8, 40], [12, 60], [17, 45], [20, 5], [24, 5]]) },
        ],
    },
    {
        name: 'Subtropical Winter Day',
        curves: [
            { id: 'white', label: 'White', color: '#d1d5db', points: points([[0, 0], [7, 0], [9, 60], [12, 75], [15, 55], [18, 0], [24, 0]]) },
            { id: 'red', label: 'Red', color: '#ef4444', points: points([[0, 0], [7, 0], [9, 25], [12, 35], [15, 20], [18, 0], [24, 0]]) },
            { id: 'green', label: 'Green', color: '#22c55e', points: points([[0, 0], [7, 0], [9, 35], [12, 50], [15, 25], [18, 0], [24, 0]]) },
            { id: 'blue', label: 'Blue', color: '#3b82f6', points: points([[0, 3], [7, 3], [9, 30], [12, 45], [15, 25], [18, 3], [24, 3]]) },
        ],
    },
];
