import * as crypto from 'crypto';

export function extractPemCertificates(text: string): string[] {
    return text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
}

export function normalizeCertificateInput(input: string): string[] {
    const pems = extractPemCertificates(input);
    if (pems.length > 0) {
        return pems;
    }

    const compact = input.replace(/\s+/g, '');
    if (compact.length >= 64 && /^[A-Za-z0-9+/]+=*$/.test(compact)) {
        return [`-----BEGIN CERTIFICATE-----\n${compact}\n-----END CERTIFICATE-----`];
    }

    throw new Error('No PEM certificate block found.');
}

export function extractCommonName(subject: string): string {
    const quoted = subject.match(/(?:^|[\n,])\s*CN="([^"]+)"/i);
    if (quoted?.[1]) {
        return quoted[1].trim();
    }

    const plain = subject.match(/(?:^|[\n,])\s*CN=([^\n,]+)/i);
    if (plain?.[1]) {
        return plain[1].trim();
    }

    return subject.split('\n')[0]?.trim() || 'Unknown';
}

export function determineCertType(cert: crypto.X509Certificate): string {
    if (cert.ca) {
        return 'Certificate Authority';
    }

    const keyUsage = cert.keyUsage ?? [];
    const usage = keyUsage.join(' ').toLowerCase();
    if (keyUsage.includes('1.3.6.1.5.5.7.3.3') || usage.includes('code signing')) {
        return 'Code Signing';
    }
    if (keyUsage.includes('1.3.6.1.5.5.7.3.2') || usage.includes('client auth')) {
        return 'Client Authentication';
    }
    if (
        keyUsage.includes('1.3.6.1.5.5.7.3.1') ||
        usage.includes('server auth') ||
        usage.includes('tls web server')
    ) {
        return 'TLS Server';
    }
    return 'X.509 Certificate';
}

export function extractCertificateAlgorithm(cert: crypto.X509Certificate): string {
    try {
        const key = cert.publicKey;
        const type = key.asymmetricKeyType ?? 'unknown';
        const details = key.asymmetricKeyDetails;
        const size = details?.modulusLength ?? details?.namedCurve;
        const labels: Record<string, string> = {
            rsa: 'RSA',
            ec: 'EC',
            ed25519: 'Ed25519',
            ed448: 'Ed448',
            dsa: 'DSA',
            x25519: 'X25519',
            x448: 'X448',
        };
        const label = labels[type] ?? type;
        return size ? `${label} ${size}` : label;
    } catch {
        return 'Unknown';
    }
}

export function inspectCertificateDates(cert: crypto.X509Certificate): {
    withinValidityWindow: boolean;
    validFrom: Date;
    validTo: Date;
} {
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);
    const now = Date.now();
    return {
        withinValidityWindow: now >= validFrom.getTime() && now <= validTo.getTime(),
        validFrom,
        validTo,
    };
}
