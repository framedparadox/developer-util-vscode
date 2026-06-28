import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import {
    ExternalToolAvailability,
    ParsedCertificateArtifact,
    ParsedCertificateDetails,
    ValidationIssue,
    analyzeCertificateChain,
    parseCertificateInputFromFile,
    parseCertificateInputFromText,
} from './certificateUtils';

interface CommandResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    command: string;
}

export interface PkcsInspectionResult {
    summary: string;
    command: string;
    certificates?: ParsedCertificateDetails[];
    warnings: string[];
    rawOutput: string;
}

export interface RemoteInspectionResult {
    artifact: ParsedCertificateArtifact;
    command: string;
    warnings: string[];
    rawOutput: string;
}

let toolAvailabilityCache: Promise<ExternalToolAvailability> | undefined;

export function detectExternalToolAvailability(forceRefresh = false): Promise<ExternalToolAvailability> {
    if (!forceRefresh && toolAvailabilityCache) {
        return toolAvailabilityCache;
    }

    toolAvailabilityCache = Promise.all([
        detectCommandVersion('openssl', ['version']),
        detectCommandVersion('keytool', ['-J-version']),
    ]).then(([openssl, keytool]) => ({ openssl, keytool }));
    return toolAvailabilityCache;
}

export async function inspectPkcs12File(filePath: string, password?: string): Promise<PkcsInspectionResult> {
    const availability = await detectExternalToolAvailability();
    if (!availability.openssl.available) {
        return {
            summary: 'OpenSSL is not available. PKCS#12 inspection is limited to command recipes.',
            command: buildOpenSslCommand(['pkcs12', '-info', '-in', filePath]),
            warnings: ['OpenSSL is not available on this machine.'],
            rawOutput: '',
        };
    }

    const passArg = password ? 'env:CERT_UTIL_PKCS12_PASSWORD' : 'pass:';
    const commandArgs = ['pkcs12', '-in', filePath, '-nokeys', '-passin', passArg];
    const result = await runCommand(
        'openssl',
        commandArgs,
        undefined,
        10000,
        password ? { CERT_UTIL_PKCS12_PASSWORD: password } : undefined
    );
    const artifact = result.ok
        ? parseCertificateInputFromText(result.stdout, {
              kind: 'file',
              label: path.basename(filePath),
              filePath,
          })
        : undefined;

    return {
        summary: result.ok
            ? `OpenSSL extracted ${artifact?.certificates.length ?? 0} certificate(s) from the PKCS#12 bundle.`
            : 'OpenSSL could not inspect the PKCS#12 file.',
        command: result.command,
        certificates: artifact?.certificates,
        warnings: result.ok ? artifact?.warnings ?? [] : [result.stderr || 'OpenSSL command failed.'],
        rawOutput: result.ok ? result.stdout : result.stderr,
    };
}

export async function inspectPkcs7File(filePath: string): Promise<PkcsInspectionResult> {
    const availability = await detectExternalToolAvailability();
    if (!availability.openssl.available) {
        return {
            summary: 'OpenSSL is not available. PKCS#7 inspection is limited to command recipes.',
            command: buildOpenSslCommand(['pkcs7', '-in', filePath, '-print_certs']),
            warnings: ['OpenSSL is not available on this machine.'],
            rawOutput: '',
        };
    }

    const content = await fs.promises.readFile(filePath);
    const args = ['pkcs7'];
    if (!content.toString('utf8', 0, Math.min(content.length, 64)).includes('-----BEGIN')) {
        args.push('-inform', 'DER');
    }
    args.push('-in', filePath, '-print_certs');
    const result = await runCommand('openssl', args);
    const artifact = result.ok
        ? parseCertificateInputFromText(result.stdout, {
              kind: 'file',
              label: path.basename(filePath),
              filePath,
          })
        : undefined;

    return {
        summary: result.ok
            ? `OpenSSL extracted ${artifact?.certificates.length ?? 0} certificate(s) from the PKCS#7 bundle.`
            : 'OpenSSL could not inspect the PKCS#7 file.',
        command: result.command,
        certificates: artifact?.certificates,
        warnings: result.ok ? artifact?.warnings ?? [] : [result.stderr || 'OpenSSL command failed.'],
        rawOutput: result.ok ? result.stdout : result.stderr,
    };
}

export async function inspectRemoteCertificate(target: string): Promise<RemoteInspectionResult> {
    const availability = await detectExternalToolAvailability();
    if (!availability.openssl.available) {
        throw new Error('OpenSSL is required for remote certificate inspection.');
    }

    const { host, port } = normalizeRemoteTarget(target);
    const connectTarget = net.isIP(host) === 6 ? `[${host}]:${port}` : `${host}:${port}`;
    const args = ['s_client', '-showcerts'];
    if (!net.isIP(host)) {
        args.push('-servername', host);
    }
    args.push('-connect', connectTarget);
    const result = await runCommand('openssl', args, '', 15000);
    if (!result.ok) {
        throw new Error(result.stderr || 'OpenSSL s_client failed.');
    }

    const artifact = parseCertificateInputFromText(result.stdout, {
        kind: 'remote',
        label: `${host}:${port}`,
        host: `${host}:${port}`,
    });

    return {
        artifact: {
            ...artifact,
            chain: artifact.chain ?? analyzeCertificateChain(artifact.certificates),
        },
        command: result.command,
        warnings: artifact.warnings,
        rawOutput: result.stdout,
    };
}

export async function verifyWithOpenSsl(
    certificatePem: string,
    chainPem?: string,
    caFile?: string,
    caPath?: string
): Promise<{ issues: ValidationIssue[]; command: string; rawOutput: string }> {
    const availability = await detectExternalToolAvailability();
    if (!availability.openssl.available) {
        return {
            issues: [
                {
                    severity: 'warning',
                    code: 'openssl-unavailable',
                    message: 'OpenSSL is not available, so trust verification could not be performed.',
                },
            ],
            command: buildOpenSslCommand(['verify', '-CAfile', '<ca-file>', '<leaf.pem>']),
            rawOutput: '',
        };
    }

    const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cert-util-verify-'));
    const leafFile = path.join(tempDirectory, 'leaf.pem');
    const chainFile = path.join(tempDirectory, 'chain.pem');
    try {
        await fs.promises.writeFile(leafFile, certificatePem);
        if (chainPem) {
            await fs.promises.writeFile(chainFile, chainPem);
        }

        const args = ['verify'];
        if (caFile) {
            args.push('-CAfile', caFile);
        }
        if (caPath) {
            args.push('-CApath', caPath);
        }
        if (chainPem) {
            args.push('-untrusted', chainFile);
        }
        args.push(leafFile);

        const result = await runCommand('openssl', args);
        if (result.ok) {
            return {
                issues: [
                    {
                        severity: 'info',
                        code: 'openssl-verify-ok',
                        message: 'OpenSSL trust verification succeeded.',
                    },
                ],
                command: result.command,
                rawOutput: result.stdout,
            };
        }

        return {
            issues: [
                {
                    severity: 'error',
                    code: 'openssl-verify-failed',
                    message: 'OpenSSL trust verification failed.',
                    details: result.stderr || result.stdout,
                },
            ],
            command: result.command,
            rawOutput: result.stderr || result.stdout,
        };
    } finally {
        await fs.promises.rm(tempDirectory, { recursive: true, force: true });
    }
}

export function buildPemToDerCommand(filePath: string, outputPath: string): string {
    return buildOpenSslCommand(['x509', '-in', filePath, '-outform', 'DER', '-out', outputPath]);
}

export function buildDerToPemCommand(filePath: string, outputPath: string): string {
    return buildOpenSslCommand(['x509', '-inform', 'DER', '-in', filePath, '-out', outputPath]);
}

export function buildPkcs12ExportCommand(certPath: string, keyPath: string, outputPath: string, password?: string): string {
    const args = ['pkcs12', '-export', '-in', certPath, '-inkey', keyPath, '-out', outputPath];
    if (password) {
        args.push('-password', 'pass:<password>');
    }
    return buildOpenSslCommand(args);
}

export async function listJksAliases(
    filePath: string,
    password?: string
): Promise<{ summary: string; command: string; rawOutput: string }> {
    const availability = await detectExternalToolAvailability();
    const args = ['-list', '-keystore', filePath];
    if (password) {
        args.push('-storepass:env', 'CERT_UTIL_JKS_PASSWORD');
    }

    if (!availability.keytool.available) {
        return {
            summary: 'keytool is not available. The extension can only show the command recipe.',
            command: buildKeytoolCommand(args),
            rawOutput: '',
        };
    }

    const result = await runCommand(
        'keytool',
        args,
        undefined,
        10000,
        password ? { CERT_UTIL_JKS_PASSWORD: password } : undefined
    );
    return {
        summary: result.ok ? 'JKS aliases listed successfully.' : 'keytool could not list JKS aliases.',
        command: result.command,
        rawOutput: result.ok ? result.stdout : result.stderr,
    };
}

export function buildJksExportCommand(filePath: string, alias: string): string {
    return buildKeytoolCommand(['-exportcert', '-alias', alias, '-keystore', filePath, '-rfc', '-file', 'certificate.pem']);
}

export function buildJksToPkcs12Command(filePath: string): string {
    return buildKeytoolCommand(['-importkeystore', '-srckeystore', filePath, '-destkeystore', 'keystore.p12', '-deststoretype', 'PKCS12']);
}

async function detectCommandVersion(
    command: string,
    args: string[]
): Promise<{ available: boolean; version?: string; error?: string }> {
    const result = await runCommand(command, args, undefined, 5000);
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    if (result.ok) {
        return {
            available: true,
            version: output.split('\n')[0]?.trim() || undefined,
        };
    }

    return {
        available: false,
        error: output || `Failed to execute ${command}.`,
    };
}

function runCommand(
    command: string,
    args: string[],
    input?: string,
    timeout = 10000,
    environment?: NodeJS.ProcessEnv
): Promise<CommandResult> {
    return new Promise((resolve) => {
        const commandString = [command, ...redactSensitiveArgs(args).map(shellQuote)].join(' ');
        const child = childProcess.execFile(
            command,
            args,
            {
                encoding: 'utf8',
                env: environment ? { ...process.env, ...environment } : undefined,
                maxBuffer: 10 * 1024 * 1024,
                timeout,
            },
            (error, stdout, stderr) => {
                const errorMessage = error && !stderr ? error.message : '';
                resolve({
                    ok: !error,
                    stdout: stdout ?? '',
                    stderr: stderr || errorMessage,
                    command: commandString,
                });
            }
        );
        child.stdin?.end(input ?? '');
    });
}

function buildOpenSslCommand(args: string[]): string {
    return ['openssl', ...args.map(shellQuote)].join(' ');
}

function buildKeytoolCommand(args: string[]): string {
    return ['keytool', ...args.map(shellQuote)].join(' ');
}

function shellQuote(value: string): string {
    if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
        return value;
    }
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function normalizeRemoteTarget(target: string): { host: string; port: number } {
    const trimmed = target.trim();
    if (!trimmed) {
        throw new Error('Remote target is required.');
    }

    if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
        let url: URL;
        try {
            url = new URL(trimmed);
        } catch {
            throw new Error('Remote target must be a valid host name, IP address, or HTTPS URL.');
        }
        if (url.protocol !== 'https:') {
            throw new Error('Only HTTPS URLs are supported for remote certificate inspection.');
        }
        return {
            host: stripIpv6Brackets(url.hostname),
            port: url.port ? parsePort(url.port) : 443,
        };
    }

    if (trimmed.startsWith('[')) {
        const closingBracket = trimmed.indexOf(']');
        if (closingBracket < 0) {
            throw new Error('IPv6 addresses must include a closing bracket.');
        }
        const host = trimmed.slice(1, closingBracket);
        if (net.isIP(host) !== 6) {
            throw new Error('Bracketed remote targets must contain a valid IPv6 address.');
        }
        const suffix = trimmed.slice(closingBracket + 1);
        return {
            host,
            port: suffix ? parsePortSuffix(suffix) : 443,
        };
    }

    if (net.isIP(trimmed) === 6) {
        return { host: trimmed, port: 443 };
    }

    const colonCount = (trimmed.match(/:/g) ?? []).length;
    if (colonCount > 1) {
        throw new Error('IPv6 addresses with a port must use bracket notation, for example [::1]:443.');
    }

    const [host, portText] = colonCount === 1 ? trimmed.split(':') : [trimmed, undefined];
    if (!host) {
        throw new Error('Remote host is required.');
    }

    return {
        host,
        port: portText === undefined ? 443 : parsePort(portText),
    };
}

function parsePortSuffix(suffix: string): number {
    if (!suffix.startsWith(':')) {
        throw new Error('Unexpected text after the IPv6 address.');
    }
    return parsePort(suffix.slice(1));
}

function parsePort(value: string): number {
    if (!/^\d+$/.test(value)) {
        throw new Error('Remote port must be a number between 1 and 65535.');
    }
    const port = Number(value);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Remote port must be a number between 1 and 65535.');
    }
    return port;
}

function stripIpv6Brackets(host: string): string {
    return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function redactSensitiveArgs(args: string[]): string[] {
    const sensitiveFlags = new Set([
        '-passin',
        '-passout',
        '-password',
        '-storepass',
        '-keypass',
        '-srcstorepass',
        '-deststorepass',
    ]);

    return args.map((arg, index) => {
        if (!sensitiveFlags.has(args[index - 1])) {
            return arg;
        }
        return arg.startsWith('pass:') ? 'pass:<redacted>' : '<redacted>';
    });
}

export function parseRemoteInspectionOutput(rawOutput: string): number {
    return parseCertificateInputFromText(rawOutput, {
        kind: 'remote',
        label: 'remote',
    }).certificates.length;
}

export function parsePkcsCertificateOutput(rawOutput: string): number {
    return parseCertificateInputFromText(rawOutput, {
        kind: 'pasted',
        label: 'output',
    }).certificates.length;
}

export function parseArtifactFromExternalFile(filePath: string): ParsedCertificateArtifact {
    return parseCertificateInputFromFile(filePath);
}
