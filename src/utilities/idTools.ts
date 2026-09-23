import * as crypto from 'crypto';
import { readInteger } from './common';
import type { UtilityTool } from './types';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const NANO_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const SNOWFLAKE_EPOCH = 1288834974657n;
let snowflakeSequence = 0n;
let snowflakeLastMs = 0n;

export function ulid(timeMs = Date.now()): string {
    return `${encodeCrockford(BigInt(timeMs), 10)}${encodeCrockford(randomBigInt(80), 16)}`;
}

export function nanoid(size: number, alphabet = NANO_ALPHABET): string {
    if (!alphabet || new Set(alphabet).size !== alphabet.length) {
        throw new Error('Alphabet must not contain duplicate characters.');
    }
    const mask = (2 << Math.floor(Math.log2(alphabet.length - 1))) - 1;
    const step = Math.ceil((1.6 * mask * size) / alphabet.length);
    let id = '';
    while (id.length < size) {
        const bytes = crypto.randomBytes(step);
        for (const byte of bytes) {
            const index = byte & mask;
            if (index < alphabet.length) {
                id += alphabet[index];
            }
            if (id.length === size) {
                break;
            }
        }
    }
    return id;
}

export function generateSnowflake(workerId: number, timeMs = Date.now()): string {
    const now = BigInt(timeMs);
    if (now === snowflakeLastMs) {
        snowflakeSequence = (snowflakeSequence + 1n) & 0xfffn;
    } else {
        snowflakeSequence = 0n;
        snowflakeLastMs = now;
    }
    const timestamp = now - SNOWFLAKE_EPOCH;
    if (timestamp < 0n) {
        throw new Error('Time is before the Snowflake epoch.');
    }
    const id = (timestamp << 22n) | (BigInt(workerId) << 12n) | snowflakeSequence;
    return id.toString();
}

export function decodeSnowflake(value: string): string {
    if (!/^\d+$/.test(value.trim())) {
        throw new Error('Snowflake ID must be a positive integer.');
    }
    const id = BigInt(value.trim());
    const timestamp = Number((id >> 22n) + SNOWFLAKE_EPOCH);
    const worker = Number((id >> 12n) & 0x3ffn);
    const sequence = Number(id & 0xfffn);
    return [`ID: ${id.toString()}`, `Time: ${new Date(timestamp).toISOString()}`, `Worker: ${worker}`, `Sequence: ${sequence}`].join('\n');
}

function encodeCrockford(value: bigint, length: number): string {
    let current = value;
    let output = '';
    for (let index = 0; index < length; index += 1) {
        output = CROCKFORD[Number(current & 31n)] + output;
        current >>= 5n;
    }
    return output;
}

function randomBigInt(bits: number): bigint {
    const bytes = crypto.randomBytes(Math.ceil(bits / 8));
    const extra = bytes.length * 8 - bits;
    if (extra > 0) {
        bytes[0] &= (1 << (8 - extra)) - 1;
    }
    return BigInt(`0x${bytes.toString('hex')}`);
}

export const idTools: UtilityTool[] = [
    {
        id: 'ulid',
        label: 'ULID Generator',
        description: 'Generate sortable ULIDs',
        command: 'devx.ulidTool',
        icon: 'ulid.svg',
        defaultVisible: true,
        category: 'Identifiers',
        summary: '26-character Crockford Base32 ULIDs. The time prefix sorts lexicographically.',
        fields: [{ id: 'count', label: 'Count', kind: 'number', defaultValue: '1' }],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => {
            const count = readInteger(values.count, 'Count', 1, 100);
            return { output: Array.from({ length: count }, () => ulid()).join('\n') };
        },
    },
    {
        id: 'nanoid',
        label: 'Nano ID Generator',
        description: 'Generate URL-safe Nano IDs',
        command: 'devx.nanoidTool',
        icon: 'nanoid.svg',
        defaultVisible: true,
        category: 'Identifiers',
        summary: 'Compact IDs from a URL-safe alphabet, using rejection sampling so characters stay uniform.',
        fields: [
            { id: 'size', label: 'Length', kind: 'number', defaultValue: '21' },
            { id: 'count', label: 'Count', kind: 'number', defaultValue: '1' },
            { id: 'alphabet', label: 'Alphabet', kind: 'text', defaultValue: NANO_ALPHABET },
        ],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => {
            const size = readInteger(values.size, 'Length', 4, 64);
            const count = readInteger(values.count, 'Count', 1, 100);
            const alphabet = (values.alphabet || NANO_ALPHABET).trim();
            return { output: Array.from({ length: count }, () => nanoid(size, alphabet)).join('\n') };
        },
    },
    {
        id: 'snowflake',
        label: 'Snowflake ID',
        description: 'Generate or decode Twitter-style IDs',
        command: 'devx.snowflakeTool',
        icon: 'snowflake.svg',
        defaultVisible: true,
        category: 'Identifiers',
        summary: 'Twitter Snowflake layout: 41 bits of time since 2010-11-04, 10 bits of worker, 12 bits of sequence.',
        fields: [
            { id: 'id', label: 'Existing ID', kind: 'text', placeholder: '1541815603606036480' },
            { id: 'worker', label: 'Worker ID', kind: 'number', defaultValue: '1' },
            { id: 'count', label: 'Count', kind: 'number', defaultValue: '1' },
        ],
        actions: [
            { id: 'generate', label: 'Generate' },
            { id: 'decode', label: 'Decode' },
        ],
        run: (action, values) => {
            if (action === 'decode') {
                return { output: decodeSnowflake(values.id ?? '') };
            }
            const worker = readInteger(values.worker, 'Worker ID', 0, 1023);
            const count = readInteger(values.count, 'Count', 1, 100);
            return { output: Array.from({ length: count }, () => generateSnowflake(worker)).join('\n') };
        },
    },
];
