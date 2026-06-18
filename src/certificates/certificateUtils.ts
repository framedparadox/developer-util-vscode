import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const SUPPORTED_CERTIFICATE_EXTENSIONS = ['.crt', '.cer', '.cert', '.pem', '.der', '.ca-bundle', '.ca', '.bundle'];
export const UNSUPPORTED_CERTIFICATE_EXTENSIONS = ['.jks', '.p12', '.pfx', '.p7b', '.p7c', '.p7s', '.csr', '.key'];

export type CertificateStatus = 'valid' | 'expiring' | 'expired';

export interface CertificateDetails {
    subject: string;
    subjectCommonName: string;
    issuer: string;
    issuerCommonName: string;
    validFrom: string;
    validTo: string;
    serialNumber: string;
    fingerprint: string;
    fingerprint256: string;
    keyUsage: string[];
    subjectAltName: string;
    infoAccess: string;
    type: string;
    algorithm: string;
    format: string;
}

export interface ScannedCertificate {
    id: string;
    name: string;
    owner: string;
    type: string;
    expiryDate: string;
    filePath: string;
    issuer: string;
    validFrom: string;
    serialNumber: string;
    fingerprint: string;
    algorithm: string;
    format: string;
}

export function normalizePem(input: string, type = 'CERTIFICATE'): string {
    const trimmed = input.trim();
    if (!trimmed) {
        throw new Error('Certificate content is empty.');
    }

    if (trimmed.includes(`-----BEGIN ${type}-----`)) {
        return trimmed;
    }

    const body = trimmed.replace(/\s+/g, '');
    return `-----BEGIN ${type}-----\n${body.match(/.{1,64}/g)?.join('\n') ?? ''}\n-----END ${type}-----`;
}

export function parseCertificateContent(content: string | Buffer, format = 'PEM'): CertificateDetails {
    const cert = new crypto.X509Certificate(content);
    return certificateToDetails(cert, format);
}

export function parseCertificateFile(filePath: string): CertificateDetails {
    const extension = path.extname(filePath).toLowerCase();
    if (UNSUPPORTED_CERTIFICATE_EXTENSIONS.includes(extension)) {
        throw new Error(`${extension || 'This file type'} is not supported by Node.js X.509 parsing.`);
    }

    const format = formatFromFilePath(filePath);
    const content = fs.readFileSync(filePath);
    const text = content.toString('utf8');

    if (text.includes('-----BEGIN CERTIFICATE-----')) {
        const pem = extractFirstPemCertificate(text);
        return parseCertificateContent(pem, format);
    }

    if (extension === '.der' || SUPPORTED_CERTIFICATE_EXTENSIONS.includes(extension)) {
        return parseCertificateContent(content, format);
    }

    throw new Error(`${extension || 'This file type'} is not a supported certificate format.`);
}

export function scanCertificateFile(filePath: string): ScannedCertificate {
    const details = parseCertificateFile(filePath);

    return {
        id: generateCertificateId(filePath, details.serialNumber),
        name: path.basename(filePath),
        owner: details.subjectCommonName,
        type: details.type,
        expiryDate: details.validTo,
        filePath,
        issuer: details.issuerCommonName,
        validFrom: details.validFrom,
        serialNumber: details.serialNumber,
        fingerprint: details.fingerprint,
        algorithm: details.algorithm,
        format: details.format,
    };
}

export function extractFirstPemCertificate(content: string): string {
    const match = content.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
    if (!match) {
        throw new Error('No PEM certificate block found.');
    }
    return match[0];
}

export function getCertificateStatus(validTo: string | Date, referenceDate = new Date()): CertificateStatus {
    const expiryDate = validTo instanceof Date ? validTo : new Date(validTo);
    if (Number.isNaN(expiryDate.getTime())) {
        throw new Error('Certificate expiry date is invalid.');
    }

    const expiringThreshold = new Date(referenceDate);
    expiringThreshold.setMonth(expiringThreshold.getMonth() + 1);

    if (expiryDate < referenceDate) {
        return 'expired';
    }

    if (expiryDate < expiringThreshold) {
        return 'expiring';
    }

    return 'valid';
}

export function extractCommonName(subject: string): string {
    const cnMatch = subject.match(/(?:^|\n|,)\s*CN\s*=\s*([^,\n]+)/);
    return cnMatch ? cnMatch[1].trim() : subject.split('\n')[0]?.trim() || 'Unknown';
}

export function formatFromFilePath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return ext.startsWith('.') ? ext.slice(1).toUpperCase() : 'UNKNOWN';
}

function certificateToDetails(cert: crypto.X509Certificate, format: string): CertificateDetails {
    return {
        subject: cert.subject,
        subjectCommonName: extractCommonName(cert.subject),
        issuer: cert.issuer,
        issuerCommonName: extractCommonName(cert.issuer),
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        serialNumber: cert.serialNumber,
        fingerprint: cert.fingerprint,
        fingerprint256: cert.fingerprint256,
        keyUsage: cert.keyUsage ?? [],
        subjectAltName: cert.subjectAltName ?? 'N/A',
        infoAccess: cert.infoAccess ?? 'N/A',
        type: determineCertificateType(cert),
        algorithm: extractAlgorithm(cert),
        format,
    };
}

function determineCertificateType(cert: crypto.X509Certificate): string {
    const subject = cert.subject.toLowerCase();
    const keyUsage = cert.keyUsage ?? [];

    if (subject.includes('client') || keyUsage.includes('digitalSignature')) {
        return 'Client Authentication';
    }

    if (subject.includes('code') || subject.includes('signing')) {
        return 'Code Signing';
    }

    return 'TLS/SSL';
}

function extractAlgorithm(cert: crypto.X509Certificate): string {
    return cert.fingerprint256 ? 'SHA256' : 'Unknown';
}

function generateCertificateId(filePath: string, serialNumber: string): string {
    return crypto.createHash('sha256').update(`${filePath}:${serialNumber}`).digest('hex').slice(0, 16);
}
