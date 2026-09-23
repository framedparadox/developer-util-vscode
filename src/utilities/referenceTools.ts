import * as crypto from 'crypto';
import * as os from 'os';
import { toString as qrToString } from 'qrcode';
import { choice, requireText } from './common';
import type { UtilityResult, UtilityTool } from './types';

const MIME_TYPES: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    mjs: 'text/javascript',
    json: 'application/json',
    map: 'application/json',
    xml: 'application/xml',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    txt: 'text/plain',
    md: 'text/markdown',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    pdf: 'application/pdf',
    zip: 'application/zip',
    gz: 'application/gzip',
    tar: 'application/x-tar',
    wasm: 'application/wasm',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ics: 'text/calendar',
    pem: 'application/x-pem-file',
    crt: 'application/pkix-cert',
    der: 'application/pkix-cert',
};

const HTTP_STATUS: Array<[number, string, string]> = [
    [100, 'Continue', 'The client should continue the request.'],
    [101, 'Switching Protocols', 'The server agrees to switch protocols.'],
    [102, 'Processing', 'The server is still working on the request.'],
    [200, 'OK', 'The request succeeded.'],
    [201, 'Created', 'The request created a resource.'],
    [202, 'Accepted', 'The request was accepted for later processing.'],
    [204, 'No Content', 'The request succeeded and there is no body.'],
    [206, 'Partial Content', 'The response contains a byte range.'],
    [301, 'Moved Permanently', 'The resource has a new permanent URI.'],
    [302, 'Found', 'The resource is temporarily at another URI.'],
    [304, 'Not Modified', 'The cached representation is still valid.'],
    [307, 'Temporary Redirect', 'Repeat the request, with the same method, at another URI.'],
    [308, 'Permanent Redirect', 'Repeat the request, with the same method, at the new permanent URI.'],
    [400, 'Bad Request', 'The server could not understand the request.'],
    [401, 'Unauthorized', 'Authentication is required or has failed.'],
    [403, 'Forbidden', 'The server understood the request and refuses it.'],
    [404, 'Not Found', 'The server cannot find the resource.'],
    [405, 'Method Not Allowed', 'The method is not allowed for this resource.'],
    [406, 'Not Acceptable', 'The server cannot produce an acceptable representation.'],
    [408, 'Request Timeout', 'The server timed out waiting for the request.'],
    [409, 'Conflict', 'The request conflicts with the current state.'],
    [410, 'Gone', 'The resource is intentionally gone.'],
    [411, 'Length Required', 'Content-Length is required.'],
    [412, 'Precondition Failed', 'A precondition header failed.'],
    [413, 'Content Too Large', 'The request body is too large.'],
    [414, 'URI Too Long', 'The request URI is too long.'],
    [415, 'Unsupported Media Type', 'The media type is not supported.'],
    [416, 'Range Not Satisfiable', 'The requested range cannot be served.'],
    [418, "I'm a teapot", 'The server refuses to brew coffee.'],
    [422, 'Unprocessable Content', 'The body was understood but could not be processed.'],
    [425, 'Too Early', 'The server is unwilling to process a request that might be replayed.'],
    [426, 'Upgrade Required', 'The client should switch protocols.'],
    [428, 'Precondition Required', 'The request must be conditional.'],
    [429, 'Too Many Requests', 'The client has sent too many requests.'],
    [431, 'Request Header Fields Too Large', 'The headers are too large.'],
    [451, 'Unavailable For Legal Reasons', 'The resource is unavailable for legal reasons.'],
    [500, 'Internal Server Error', 'The server hit an unexpected condition.'],
    [501, 'Not Implemented', 'The server does not support the method.'],
    [502, 'Bad Gateway', 'An upstream server returned an invalid response.'],
    [503, 'Service Unavailable', 'The server is not ready to handle the request.'],
    [504, 'Gateway Timeout', 'An upstream server timed out.'],
];

const GITIGNORE: Record<string, string> = {
    node: 'node_modules/\ndist/\nout/\n*.log\n.env\n.env.*\ncoverage/',
    python: '__pycache__/\n.venv/\nvenv/\n*.py[cod]\n.pytest_cache/\n.mypy_cache/',
    go: 'bin/\n*.exe\n*.test\nvendor/',
    java: 'target/\n*.class\n.gradle/\nbuild/',
    vscode: '.vscode/*\n!.vscode/extensions.json\n!.vscode/launch.json\n!.vscode/settings.json\n!.vscode/tasks.json',
    macos: '.DS_Store\n.AppleDouble\n.LSOverride',
    windows: 'Thumbs.db\nDesktop.ini\n$RECYCLE.BIN/',
};

export function parseUrl(value: string): string {
    const text = requireText(value, 'URL').trim();
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    const params = [...url.searchParams.entries()].map(([key, item]) => `  ${key} = ${item}`);
    return [
        `href: ${url.href}`,
        `protocol: ${url.protocol}`,
        `username: ${url.username}`,
        `password: ${url.password ? '(present)' : ''}`,
        `hostname: ${url.hostname}`,
        `port: ${url.port}`,
        `pathname: ${url.pathname}`,
        `search: ${url.search}`,
        `hash: ${url.hash}`,
        'query:',
        params.join('\n') || '  (none)',
    ].join('\n');
}

export function parseUserAgent(value: string): string {
    const text = requireText(value, 'User agent');
    const browser = matchBrowser(text);
    const system = matchOs(text);
    const device = /mobile|iphone|android/i.test(text) ? 'mobile' : 'desktop';
    return [`Browser: ${browser}`, `System: ${system}`, `Device: ${device}`, `Bot: ${/bot|crawler|spider/i.test(text) ? 'yes' : 'no'}`].join('\n');
}

export function lookupMime(value: string): string {
    const query = requireText(value, 'Query').trim().toLowerCase().replace(/^\./, '');
    const byExtension = MIME_TYPES[query];
    if (byExtension) {
        return `.${query} -> ${byExtension}`;
    }
    const matches = Object.entries(MIME_TYPES).filter(([, type]) => type.includes(query));
    if (matches.length === 0) {
        throw new Error('No matching type or extension.');
    }
    return matches.map(([extension, type]) => `.${extension} -> ${type}`).join('\n');
}

export function lookupStatus(value: string): string {
    const query = requireText(value, 'Status').trim().toLowerCase();
    const matches = HTTP_STATUS.filter(([code, reason]) => String(code) === query || reason.toLowerCase().includes(query));
    if (matches.length === 0) {
        throw new Error('No matching HTTP status.');
    }
    return matches.map(([code, reason, description]) => `${code} ${reason}\n${description}`).join('\n\n');
}

export async function makeQr(payload: string): Promise<string> {
    if (payload.length > 800) {
        throw new Error('QR text is limited to 800 characters.');
    }
    const svg = await qrToString(payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    if (!svg.includes('<svg') || /<script/i.test(svg)) {
        throw new Error('QR generation failed.');
    }
    return svg.replace(/<script[\s\S]*?<\/script>/gi, '');
}

export function randomPort(range: string): string {
    const [min, max] = range === 'system' ? [0, 1023] : range === 'registered' ? [1024, 49151] : range === 'dynamic' ? [49152, 65535] : [1024, 65535];
    return String(crypto.randomInt(min, max + 1));
}

export function deviceReport(vscodeVersion: string): string {
    const cpus = os.cpus();
    return [
        `Platform: ${os.platform()}`,
        `Architecture: ${os.arch()}`,
        `Endianness: ${os.endianness()}`,
        `OS release: ${os.release()}`,
        `OS type: ${os.type()}`,
        `CPU: ${cpus[0]?.model ?? 'unknown'}`,
        `CPU count: ${cpus.length}`,
        `Memory total: ${os.totalmem()}`,
        `Memory free: ${os.freemem()}`,
        `Uptime seconds: ${Math.floor(os.uptime())}`,
        `Node: ${process.version}`,
        `VS Code: ${vscodeVersion || 'unknown'}`,
    ].join('\n');
}

export function gitignoreStarter(stack: string): string {
    const selected = GITIGNORE[stack] ?? GITIGNORE.node;
    return `# Starter ignore for ${stack}\n${selected}\n`;
}

export function corsHeaders(origin: string, methods: string, headers: string, credentials: boolean): string {
    const lines = [`Access-Control-Allow-Origin: ${origin.trim() || '*'}`];
    if (methods.trim()) {
        lines.push(`Access-Control-Allow-Methods: ${methods.trim()}`);
    }
    if (headers.trim()) {
        lines.push(`Access-Control-Allow-Headers: ${headers.trim()}`);
    }
    if (credentials) {
        lines.push('Access-Control-Allow-Credentials: true');
    }
    return lines.join('\n');
}

function matchBrowser(value: string): string {
    const patterns: Array<[RegExp, string]> = [
        [/Edg\/([\d.]+)/, 'Edge'],
        [/OPR\/([\d.]+)/, 'Opera'],
        [/Chrome\/([\d.]+)/, 'Chrome'],
        [/Firefox\/([\d.]+)/, 'Firefox'],
        [/Version\/([\d.]+).*Safari/, 'Safari'],
    ];
    for (const [pattern, name] of patterns) {
        const match = value.match(pattern);
        if (match) {
            return `${name} ${match[1]}`;
        }
    }
    return 'unknown';
}

function matchOs(value: string): string {
    if (/Windows NT/i.test(value)) {
        return 'Windows';
    }
    if (/Mac OS X/i.test(value)) {
        return 'macOS';
    }
    if (/Android/i.test(value)) {
        return 'Android';
    }
    if (/iPhone|iPad/i.test(value)) {
        return 'iOS';
    }
    if (/Linux/i.test(value)) {
        return 'Linux';
    }
    return 'unknown';
}

function wifiPayload(values: Record<string, string>): string {
    const auth = choice(values.auth, 'security', ['WPA', 'WEP', 'nopass'], 'WPA');
    const ssid = escapeWifi(requireText(values.ssid, 'SSID'));
    const password = auth === 'nopass' ? '' : escapeWifi(values.password ?? '');
    const hidden = values.hidden === 'true' ? 'true' : 'false';
    return `WIFI:T:${auth};S:${ssid};P:${password};H:${hidden};;`;
}

function escapeWifi(value: string): string {
    return value.replace(/([\\;,:"])/g, '\\$1');
}

async function qrResult(values: Record<string, string>): Promise<UtilityResult> {
    const mode = choice(values.mode, 'mode', ['text', 'wifi'], 'text');
    const payload = mode === 'wifi' ? wifiPayload(values) : requireText(values.text, 'Text');
    const svg = await makeQr(payload);
    return { output: payload, previewHtml: svg, notice: 'SVG preview is below.' };
}

export const referenceTools: UtilityTool[] = [
    {
        id: 'url-parser',
        label: 'URL Parser',
        description: 'Split a URL into its parts',
        command: 'devx.urlParserTool',
        icon: 'url-parse.svg',
        defaultVisible: true,
        category: 'Web',
        summary: 'Shows protocol, host, path, query, and hash. A missing scheme is treated as https. The password is not printed.',
        fields: [{ id: 'input', label: 'URL', kind: 'text', placeholder: 'https://example.com/a?x=1#h' }],
        actions: [{ id: 'parse', label: 'Parse' }],
        run: (_action, values) => ({ output: parseUrl(values.input ?? '') }),
    },
    {
        id: 'user-agent',
        label: 'User-Agent Parser',
        description: 'Summarize a browser user-agent string',
        command: 'devx.userAgentTool',
        icon: 'user-agent.svg',
        defaultVisible: true,
        category: 'Web',
        summary: 'A lightweight read of browser, operating system, device class, and bot hints. It is not a full device database.',
        fields: [{ id: 'input', label: 'User agent', kind: 'textarea', rows: 4 }],
        actions: [{ id: 'parse', label: 'Parse' }],
        run: (_action, values) => ({ output: parseUserAgent(values.input ?? '') }),
    },
    {
        id: 'mime',
        label: 'MIME Types',
        description: 'Look up common media types',
        command: 'devx.mimeTool',
        icon: 'mime.svg',
        defaultVisible: true,
        category: 'Web',
        summary: 'Look up an extension or part of a media type from a built-in developer set.',
        fields: [{ id: 'input', label: 'Extension or type', kind: 'text', placeholder: 'json' }],
        actions: [{ id: 'lookup', label: 'Look up' }],
        run: (_action, values) => ({ output: lookupMime(values.input ?? '') }),
    },
    {
        id: 'http-status',
        label: 'HTTP Status',
        description: 'Look up HTTP status codes',
        command: 'devx.httpStatusTool',
        icon: 'http-status.svg',
        defaultVisible: true,
        category: 'Web',
        summary: 'Search the common HTTP status codes by number or reason phrase.',
        fields: [{ id: 'input', label: 'Code or phrase', kind: 'text', placeholder: '404' }],
        actions: [{ id: 'lookup', label: 'Look up' }],
        run: (_action, values) => ({ output: lookupStatus(values.input ?? '') }),
    },
    {
        id: 'qr',
        label: 'QR Code',
        description: 'Create a QR code for text or Wi-Fi',
        command: 'devx.qrTool',
        icon: 'qr.svg',
        defaultVisible: true,
        category: 'Web',
        summary: 'Builds an SVG QR code locally for text or a Wi-Fi network payload.',
        fields: [
            {
                id: 'mode',
                label: 'Mode',
                kind: 'select',
                options: [
                    { value: 'text', label: 'Text' },
                    { value: 'wifi', label: 'Wi-Fi' },
                ],
                defaultValue: 'text',
            },
            { id: 'text', label: 'Text', kind: 'textarea', rows: 4 },
            { id: 'ssid', label: 'SSID', kind: 'text' },
            { id: 'password', label: 'Wi-Fi password', kind: 'text' },
            {
                id: 'auth',
                label: 'Security',
                kind: 'select',
                options: [
                    { value: 'WPA', label: 'WPA/WPA2' },
                    { value: 'WEP', label: 'WEP' },
                    { value: 'nopass', label: 'None' },
                ],
                defaultValue: 'WPA',
            },
            {
                id: 'hidden',
                label: 'Hidden network',
                kind: 'select',
                options: [
                    { value: 'false', label: 'No' },
                    { value: 'true', label: 'Yes' },
                ],
                defaultValue: 'false',
            },
        ],
        actions: [{ id: 'create', label: 'Create QR' }],
        run: (_action, values) => qrResult(values),
    },
    {
        id: 'port',
        label: 'Random Port',
        description: 'Pick an unused-looking TCP port number',
        command: 'devx.randomPortTool',
        icon: 'port.svg',
        defaultVisible: true,
        category: 'Web',
        summary: 'Picks a port number from the system, registered, dynamic, or non-system range. It does not check whether the port is free.',
        fields: [
            {
                id: 'range',
                label: 'Range',
                kind: 'select',
                options: [
                    { value: 'user', label: '1024-65535' },
                    { value: 'system', label: 'System 0-1023' },
                    { value: 'registered', label: 'Registered 1024-49151' },
                    { value: 'dynamic', label: 'Dynamic 49152-65535' },
                ],
                defaultValue: 'user',
            },
        ],
        actions: [{ id: 'pick', label: 'Pick port' }],
        run: (_action, values) => ({
            output: randomPort(choice(values.range, 'range', ['user', 'system', 'registered', 'dynamic'], 'user')),
        }),
    },
    {
        id: 'keycode',
        label: 'Key Codes',
        description: 'Inspect keyboard event fields',
        command: 'devx.keyCodeTool',
        icon: 'keycode.svg',
        defaultVisible: true,
        category: 'Web',
        summary: 'Press a key in the capture box to see key, code, keyCode, location, and modifiers. Nothing leaves the panel.',
        fields: [],
        actions: [],
        presentation: 'keycode',
        run: () => ({ output: 'Press a key in the capture box.' }),
    },
    {
        id: 'device',
        label: 'Device Info',
        description: 'Show local OS and runtime details',
        command: 'devx.deviceInfoTool',
        icon: 'device.svg',
        defaultVisible: true,
        category: 'Web',
        summary: 'Platform, CPU, memory, Node, and VS Code version from this machine. User name and home directory are omitted.',
        fields: [],
        actions: [{ id: 'refresh', label: 'Refresh' }],
        inject: ['vscodeVersion'],
        run: (_action, values) => ({ output: deviceReport(values.vscodeVersion ?? '') }),
    },
    {
        id: 'gitignore',
        label: 'Gitignore Starter',
        description: 'Insert a small language ignore list',
        command: 'devx.gitignoreTool',
        icon: 'gitignore.svg',
        defaultVisible: true,
        category: 'Web',
        summary: 'Short starter ignore rules for common stacks. This is not the full GitHub gitignore catalog.',
        fields: [
            {
                id: 'stack',
                label: 'Stack',
                kind: 'select',
                options: [
                    { value: 'node', label: 'Node' },
                    { value: 'python', label: 'Python' },
                    { value: 'go', label: 'Go' },
                    { value: 'java', label: 'Java' },
                    { value: 'vscode', label: 'VS Code' },
                    { value: 'macos', label: 'macOS' },
                    { value: 'windows', label: 'Windows' },
                ],
                defaultValue: 'node',
            },
        ],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => ({
            output: gitignoreStarter(choice(values.stack, 'stack', ['node', 'python', 'go', 'java', 'vscode', 'macos', 'windows'], 'node')),
        }),
    },
    {
        id: 'cors',
        label: 'CORS Headers',
        description: 'Draft Access-Control-Allow headers',
        command: 'devx.corsTool',
        icon: 'cors.svg',
        defaultVisible: true,
        category: 'Web',
        summary: 'Drafts Access-Control-Allow-Origin, Methods, Headers, and Credentials lines for you to copy into a server.',
        fields: [
            { id: 'origin', label: 'Origin', kind: 'text', defaultValue: '*' },
            { id: 'methods', label: 'Methods', kind: 'text', defaultValue: 'GET, POST, OPTIONS' },
            { id: 'headers', label: 'Headers', kind: 'text', defaultValue: 'Content-Type, Authorization' },
            {
                id: 'credentials',
                label: 'Credentials',
                kind: 'select',
                options: [
                    { value: 'false', label: 'Omit' },
                    { value: 'true', label: 'Allow' },
                ],
                defaultValue: 'false',
            },
        ],
        actions: [{ id: 'build', label: 'Build' }],
        run: (_action, values) => ({
            output: corsHeaders(values.origin ?? '', values.methods ?? '', values.headers ?? '', values.credentials === 'true'),
        }),
    },
];
