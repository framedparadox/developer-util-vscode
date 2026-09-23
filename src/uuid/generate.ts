import * as crypto from 'crypto';

export const NULL_UUID = '00000000-0000-0000-0000-000000000000';
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID generator with RFC 4122 v1 multicast-node IDs and RFC 9562 v7
 * same-millisecond counters so bulk values stay unique and sortable.
 */
export class UuidGenerator {
    private v1LastMs = 0n;
    private v1Counter = 0n;
    private v7LastMs = 0n;
    private v7Seq = 0;

    uuidv1(): string {
        const nowMs = BigInt(Date.now());
        if (nowMs > this.v1LastMs) {
            this.v1LastMs = nowMs;
            this.v1Counter = 0n;
        } else {
            this.v1Counter += 1n;
            if (this.v1Counter >= 10000n) {
                this.v1LastMs += 1n;
                this.v1Counter = 0n;
            }
        }

        const timestamp = this.v1LastMs * 10000n + this.v1Counter + 0x01b21dd213814000n;
        const timeLow = (timestamp & 0xffffffffn).toString(16).padStart(8, '0');
        const timeMid = ((timestamp >> 32n) & 0xffffn).toString(16).padStart(4, '0');
        const timeHi = (((timestamp >> 48n) & 0x0fffn) | 0x1000n).toString(16).padStart(4, '0');

        const clockSeq = crypto.randomBytes(2);
        clockSeq[0] = (clockSeq[0] & 0x3f) | 0x80;

        const node = crypto.randomBytes(6);
        node[0] = node[0] | 0x01;

        return `${timeLow}-${timeMid}-${timeHi}-${clockSeq.toString('hex')}-${node.toString('hex')}`;
    }

    uuidv4(): string {
        return crypto.randomUUID();
    }

    uuidv7(): string {
        const nowMs = BigInt(Date.now());
        if (nowMs > this.v7LastMs) {
            this.v7LastMs = nowMs;
            this.v7Seq = crypto.randomInt(0, 0x1000);
        } else {
            this.v7Seq = (this.v7Seq + 1) & 0x0fff;
            if (this.v7Seq === 0) {
                this.v7LastMs += 1n;
            }
        }

        const timeHex = this.v7LastMs.toString(16).padStart(12, '0');
        const randA = (0x7000 | this.v7Seq).toString(16).padStart(4, '0');
        const randBytes = crypto.randomBytes(8);
        randBytes[0] = (randBytes[0] & 0x3f) | 0x80;

        return `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-${randA}-${randBytes.toString('hex', 0, 2)}-${randBytes.toString('hex', 2, 8)}`;
    }

    nullUuid(): string {
        return NULL_UUID;
    }
}
