import { escapeHtml, linesOf, readInteger, requireText } from './common';
import type { UtilityTool } from './types';

// ── Meta tags ────────────────────────────────────────────────────────────────

export interface MetaInput {
    title: string;
    description: string;
    url: string;
    image: string;
    siteName: string;
    type: string;
    twitter: string;
    card: string;
    themeColor: string;
    locale: string;
}

export function buildMetaTags(input: MetaInput): string {
    const title = requireText(input.title, 'Title').trim();
    const attr = (value: string) => escapeHtml(value.trim());
    const tags: string[] = [
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<title>${attr(title)}</title>`,
    ];
    const add = (condition: string, tag: string) => {
        if (condition.trim()) {
            tags.push(tag);
        }
    };
    add(input.description, `<meta name="description" content="${attr(input.description)}">`);
    add(input.url, `<link rel="canonical" href="${attr(input.url)}">`);
    add(input.themeColor, `<meta name="theme-color" content="${attr(input.themeColor)}">`);
    tags.push('', '<!-- Open Graph -->');
    tags.push(`<meta property="og:type" content="${attr(input.type || 'website')}">`);
    tags.push(`<meta property="og:title" content="${attr(title)}">`);
    add(input.description, `<meta property="og:description" content="${attr(input.description)}">`);
    add(input.url, `<meta property="og:url" content="${attr(input.url)}">`);
    add(input.image, `<meta property="og:image" content="${attr(input.image)}">`);
    add(input.image, `<meta property="og:image:alt" content="${attr(title)}">`);
    add(input.siteName, `<meta property="og:site_name" content="${attr(input.siteName)}">`);
    add(input.locale, `<meta property="og:locale" content="${attr(input.locale)}">`);
    tags.push('', '<!-- Twitter / X -->');
    tags.push(
        `<meta name="twitter:card" content="${attr(input.card || (input.image ? 'summary_large_image' : 'summary'))}">`,
    );
    tags.push(`<meta name="twitter:title" content="${attr(title)}">`);
    add(input.description, `<meta name="twitter:description" content="${attr(input.description)}">`);
    add(input.image, `<meta name="twitter:image" content="${attr(input.image)}">`);
    if (input.twitter.trim()) {
        const handle = input.twitter.trim().startsWith('@') ? input.twitter.trim() : `@${input.twitter.trim()}`;
        tags.push(`<meta name="twitter:site" content="${attr(handle)}">`);
    }
    return tags.join('\n');
}

function metaWarnings(input: MetaInput): string | undefined {
    const warnings: string[] = [];
    if (input.title.length > 60) {
        warnings.push(`title is ${input.title.length} characters (search results show about 60)`);
    }
    if (input.description.length > 160) {
        warnings.push(`description is ${input.description.length} characters (about 160 are shown)`);
    }
    if (input.image && !/^https?:\/\//i.test(input.image.trim())) {
        warnings.push('og:image should be an absolute URL');
    }
    return warnings.length ? `Note: ${warnings.join('; ')}.` : undefined;
}

// ── Safe link decoder ────────────────────────────────────────────────────────

function decodeProofpointV2(encoded: string): string {
    return decodeURIComponent(encoded.replace(/-/g, '%').replace(/_/g, '/'));
}

function decodeProofpointV3(url: URL): string | undefined {
    const match = /\/v3\/__(.+?)__;(.*?)!/.exec(url.pathname + url.search + url.hash);
    if (!match) {
        return undefined;
    }
    const [, encoded, bytesPart] = match;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const replacement = Buffer.from(bytesPart.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const chars = [...replacement];
    let cursor = 0;
    return encoded.replace(/\*(\*.)?/g, (token) => {
        if (token === '*') {
            return chars[cursor++] ?? '';
        }
        const count = alphabet.indexOf(token[2]) + 2;
        const out = chars.slice(cursor, cursor + count).join('');
        cursor += count;
        return out;
    });
}

export function decodeSafeLink(value: string): string {
    let current = requireText(value, 'URL').trim();
    const steps: string[] = [];
    for (let depth = 0; depth < 5; depth += 1) {
        let url: URL;
        try {
            url = new URL(current);
        } catch {
            break;
        }
        const host = url.hostname.toLowerCase();
        let next: string | undefined;
        let label = '';
        if (host.endsWith('safelinks.protection.outlook.com')) {
            next = url.searchParams.get('url') ?? undefined;
            label = 'Microsoft Defender Safe Links';
        } else if (host === 'urldefense.proofpoint.com' || host === 'urldefense.com') {
            if (url.pathname.startsWith('/v2/')) {
                const u = url.searchParams.get('u');
                next = u ? decodeProofpointV2(u) : undefined;
                label = 'Proofpoint v2';
            } else if (url.pathname.startsWith('/v3/')) {
                next = decodeProofpointV3(url);
                label = 'Proofpoint v3';
            } else if (url.pathname.startsWith('/v1/')) {
                next = url.searchParams.get('u') ?? undefined;
                label = 'Proofpoint v1';
            }
        } else if ((host.startsWith('www.google.') || host.startsWith('google.')) && url.pathname === '/url') {
            next = url.searchParams.get('q') ?? url.searchParams.get('url') ?? undefined;
            label = 'Google redirect';
        } else if (
            (host === 'l.facebook.com' || host === 'lm.facebook.com' || host === 'l.instagram.com') &&
            url.pathname.startsWith('/l.php')
        ) {
            next = url.searchParams.get('u') ?? undefined;
            label = 'Facebook link shim';
        } else if (host === 'www.linkedin.com' && url.pathname.startsWith('/redir/redirect')) {
            next = url.searchParams.get('url') ?? undefined;
            label = 'LinkedIn redirect';
        } else if (host.endsWith('mimecastprotect.com') || host.endsWith('mimecast.com')) {
            next = url.searchParams.get('domain') ? `https://${url.searchParams.get('domain')}` : undefined;
            label = 'Mimecast (domain only; the full URL is stored server side)';
        } else if (
            host === 'slack-redir.net' ||
            host === 'www.youtube.com' ||
            host === 'out.reddit.com' ||
            host === 'href.li'
        ) {
            next = url.searchParams.get('url') ?? url.searchParams.get('q') ?? url.searchParams.get('u') ?? undefined;
            label = host;
        } else {
            for (const key of ['url', 'u', 'q', 'target', 'redirect', 'redirect_uri', 'dest', 'destination', 'link']) {
                const candidate = url.searchParams.get(key);
                if (candidate && /^https?:\/\//i.test(candidate)) {
                    next = candidate;
                    label = `generic "${key}" parameter`;
                    break;
                }
            }
        }
        if (!next || next === current) {
            break;
        }
        steps.push(`${label}: ${next}`);
        current = next;
    }
    if (steps.length === 0) {
        throw new Error(
            'No known wrapper found. Supported: Outlook Safe Links, Proofpoint v1–v3, Google, Facebook, LinkedIn, and URLs with a url/u/q parameter.',
        );
    }
    return [
        `Original URL: ${current}`,
        '',
        'Unwrapped:',
        ...steps.map((step, index) => `  ${index + 1}. ${step}`),
    ].join('\n');
}

// ── Email normalizer ─────────────────────────────────────────────────────────

const DOT_INSENSITIVE = new Set(['gmail.com', 'googlemail.com']);
const PLUS_PROVIDERS = new Set([
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'protonmail.com',
    'proton.me',
    'fastmail.com',
    'yandex.com',
    'yandex.ru',
]);
const DOMAIN_ALIASES: Record<string, string> = {
    'googlemail.com': 'gmail.com',
    'me.com': 'icloud.com',
    'mac.com': 'icloud.com',
    'protonmail.ch': 'protonmail.com',
    'pm.me': 'protonmail.com',
    'ya.ru': 'yandex.ru',
};

export function normalizeEmail(value: string): string {
    const text = value.trim();
    const at = text.lastIndexOf('@');
    if (at <= 0 || at === text.length - 1) {
        throw new Error(`"${text}" is not an email address.`);
    }
    let local = text.slice(0, at);
    let domain = text
        .slice(at + 1)
        .toLowerCase()
        .replace(/\.$/, '');
    domain = DOMAIN_ALIASES[domain] ?? domain;
    if (PLUS_PROVIDERS.has(domain) || domain.endsWith('.onmicrosoft.com')) {
        local = local.split('+')[0];
    }
    if (domain === 'yahoo.com') {
        local = local.split('-')[0];
    }
    if (DOT_INSENSITIVE.has(domain)) {
        local = local.replace(/\./g, '');
    }
    return `${local.toLowerCase()}@${domain}`;
}

export function normalizeEmails(value: string): string {
    const lines = linesOf(requireText(value, 'Emails'))
        .map((line) => line.trim())
        .filter(Boolean);
    return lines
        .map((line) => {
            try {
                return normalizeEmail(line);
            } catch (error) {
                return `# ${error instanceof Error ? error.message : String(error)}`;
            }
        })
        .join('\n');
}

// ── SVG placeholder ──────────────────────────────────────────────────────────

function safeColor(value: string, fallback: string): string {
    const text = value.trim() || fallback;
    if (!/^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i.test(text)) {
        throw new Error(`Invalid color "${text}".`);
    }
    return text;
}

export function svgPlaceholder(
    width: number,
    height: number,
    background: string,
    foreground: string,
    text: string,
    fontSize: number,
): string {
    const bg = safeColor(background, '#cccccc');
    const fg = safeColor(foreground, '#555555');
    const label = text.trim() || `${width}×${height}`;
    const size = fontSize || Math.max(10, Math.round(Math.min(width, height) / 6));
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `  <rect width="100%" height="100%" fill="${bg}"/>`,
        `  <text x="50%" y="50%" fill="${fg}" font-family="system-ui, sans-serif" font-size="${size}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(label)}</text>`,
        '</svg>',
    ].join('\n');
}

// ── IPv4 ranges ──────────────────────────────────────────────────────────────

export function ipToInt(value: string): number {
    const parts = value.trim().split('.');
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
        throw new Error(`"${value.trim()}" is not an IPv4 address.`);
    }
    return parts.reduce((acc, part) => acc * 256 + Number(part), 0);
}

export function intToIp(value: number): string {
    return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

export function rangeToCidrs(start: number, end: number): string[] {
    const blocks: string[] = [];
    let current = start;
    while (current <= end) {
        let size = 32;
        while (size > 0) {
            const mask = 2 ** (32 - (size - 1));
            if (current % mask !== 0 || current + mask - 1 > end) {
                break;
            }
            size -= 1;
        }
        blocks.push(`${intToIp(current)}/${size}`);
        current += 2 ** (32 - size);
    }
    return blocks;
}

function ipClass(value: number): string {
    const first = value >>> 24;
    const ranges: Array<[number, number, string]> = [
        [ipToInt('10.0.0.0'), ipToInt('10.255.255.255'), 'Private (RFC 1918)'],
        [ipToInt('172.16.0.0'), ipToInt('172.31.255.255'), 'Private (RFC 1918)'],
        [ipToInt('192.168.0.0'), ipToInt('192.168.255.255'), 'Private (RFC 1918)'],
        [ipToInt('127.0.0.0'), ipToInt('127.255.255.255'), 'Loopback'],
        [ipToInt('169.254.0.0'), ipToInt('169.254.255.255'), 'Link-local'],
        [ipToInt('100.64.0.0'), ipToInt('100.127.255.255'), 'Carrier-grade NAT (RFC 6598)'],
        [ipToInt('192.0.2.0'), ipToInt('192.0.2.255'), 'Documentation (TEST-NET-1)'],
        [ipToInt('198.51.100.0'), ipToInt('198.51.100.255'), 'Documentation (TEST-NET-2)'],
        [ipToInt('203.0.113.0'), ipToInt('203.0.113.255'), 'Documentation (TEST-NET-3)'],
        [ipToInt('224.0.0.0'), ipToInt('239.255.255.255'), 'Multicast'],
        [ipToInt('240.0.0.0'), ipToInt('255.255.255.254'), 'Reserved'],
        [ipToInt('255.255.255.255'), ipToInt('255.255.255.255'), 'Broadcast'],
        [0, ipToInt('0.255.255.255'), '"This" network'],
    ];
    const scope = ranges.find(([from, to]) => value >= from && value <= to)?.[2] ?? 'Public';
    const cls = first < 128 ? 'A' : first < 192 ? 'B' : first < 224 ? 'C' : first < 240 ? 'D' : 'E';
    return `${scope}, class ${cls}`;
}

export function ipv4Report(value: string): string {
    const text = requireText(value, 'Input').trim();
    const range = /^([\d.]+)\s*(?:-|–|to)\s*([\d.]+)$/.exec(text);
    if (range) {
        const start = ipToInt(range[1]);
        const end = ipToInt(range[2]);
        if (end < start) {
            throw new Error('The end address is before the start address.');
        }
        const cidrs = rangeToCidrs(start, end);
        return [
            `Range: ${intToIp(start)} – ${intToIp(end)}`,
            `Addresses: ${(end - start + 1).toLocaleString('en-US')}`,
            `CIDR blocks (${cidrs.length}):`,
            ...cidrs.map((cidr) => `  ${cidr}`),
        ].join('\n');
    }
    const cidr = /^([\d.]+)\/(\d{1,2})$/.exec(text);
    if (cidr) {
        const prefix = Number(cidr[2]);
        if (prefix > 32) {
            throw new Error('Prefix must be 0 to 32.');
        }
        const size = 2 ** (32 - prefix);
        const start = Math.floor(ipToInt(cidr[1]) / size) * size;
        const end = start + size - 1;
        const lines = [
            `CIDR: ${intToIp(start)}/${prefix}`,
            `First: ${intToIp(start)}`,
            `Last: ${intToIp(end)}`,
            `Addresses: ${size.toLocaleString('en-US')}`,
        ];
        if (size <= 1024) {
            lines.push('', 'Expanded:', ...Array.from({ length: size }, (_, index) => intToIp(start + index)));
        } else {
            lines.push('', 'Expansion is shown for /22 and smaller blocks only.');
        }
        return lines.join('\n');
    }
    let num: number;
    if (/^\d+$/.test(text)) {
        num = Number(text);
    } else if (/^0x[0-9a-f]{1,8}$/i.test(text)) {
        num = parseInt(text, 16);
    } else {
        num = ipToInt(text);
    }
    if (num > 0xffffffff) {
        throw new Error('Number is larger than 32 bits.');
    }
    const octets = intToIp(num).split('.').map(Number);
    return [
        `Dotted: ${intToIp(num)}`,
        `Decimal: ${num}`,
        `Hex: 0x${num.toString(16).padStart(8, '0')}`,
        `Octal: ${octets.map((o) => '0' + o.toString(8)).join('.')}`,
        `Binary: ${octets.map((o) => o.toString(2).padStart(8, '0')).join('.')}`,
        `IPv6 mapped: ::ffff:${((num >>> 16) & 0xffff).toString(16)}:${(num & 0xffff).toString(16)}`,
        `6to4 prefix: 2002:${((num >>> 16) & 0xffff).toString(16).padStart(4, '0')}:${(num & 0xffff).toString(16).padStart(4, '0')}::/48`,
        `Reverse DNS: ${[...octets].reverse().join('.')}.in-addr.arpa`,
        `Type: ${ipClass(num)}`,
    ].join('\n');
}

// ── CSP parser ───────────────────────────────────────────────────────────────

const FETCH_DIRECTIVES = [
    'script-src',
    'style-src',
    'img-src',
    'connect-src',
    'font-src',
    'object-src',
    'media-src',
    'frame-src',
    'child-src',
    'worker-src',
    'manifest-src',
];
const KNOWN_DIRECTIVES = new Set([
    ...FETCH_DIRECTIVES,
    'default-src',
    'script-src-elem',
    'script-src-attr',
    'style-src-elem',
    'style-src-attr',
    'base-uri',
    'form-action',
    'frame-ancestors',
    'sandbox',
    'report-uri',
    'report-to',
    'upgrade-insecure-requests',
    'block-all-mixed-content',
    'require-trusted-types-for',
    'trusted-types',
    'fenced-frame-src',
]);

export function analyzeCsp(value: string): string {
    const text = requireText(value, 'Policy')
        .trim()
        .replace(/^content-security-policy(-report-only)?\s*:\s*/i, '');
    const directives = new Map<string, string[]>();
    const warnings: string[] = [];
    for (const part of text.split(';')) {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) {
            continue;
        }
        const name = tokens[0].toLowerCase();
        if (directives.has(name)) {
            warnings.push(`${name} appears more than once; browsers ignore the repeats.`);
            continue;
        }
        if (!KNOWN_DIRECTIVES.has(name)) {
            warnings.push(`Unknown directive "${name}".`);
        }
        directives.set(name, tokens.slice(1));
    }
    const effective = (name: string) =>
        directives.get(name) ?? (FETCH_DIRECTIVES.includes(name) ? directives.get('default-src') : undefined);
    const script = effective('script-src');
    if (!directives.has('default-src')) {
        warnings.push('No default-src: fetch types without their own directive are unrestricted.');
    }
    if (!script) {
        warnings.push('Scripts are unrestricted (no script-src or default-src).');
    } else {
        const hasNonceOrHash = script.some((source) => /^'(nonce-|sha(256|384|512)-)/.test(source));
        if (script.includes("'unsafe-inline'") && !hasNonceOrHash) {
            warnings.push("script-src allows 'unsafe-inline', which permits injected inline scripts.");
        }
        if (script.includes("'unsafe-eval'")) {
            warnings.push("script-src allows 'unsafe-eval' (eval, new Function).");
        }
        if (
            script.some((source) => source === '*' || source === 'https:' || source === 'http:' || source === 'data:')
        ) {
            warnings.push('script-src allows a wildcard or scheme source (*, https:, data:), which is easy to bypass.');
        }
    }
    const objects = effective('object-src');
    if (!objects || !objects.includes("'none'")) {
        warnings.push("object-src is not 'none'; plugins such as <object> and <embed> can load.");
    }
    if (!directives.has('base-uri')) {
        warnings.push('No base-uri: an injected <base> tag can redirect relative script URLs.');
    }
    if (!directives.has('frame-ancestors')) {
        warnings.push('No frame-ancestors: the page can be framed (clickjacking) unless X-Frame-Options is set.');
    }
    if (!directives.has('form-action')) {
        warnings.push('No form-action: forms can submit to any origin.');
    }
    for (const [name, sources] of directives) {
        if (sources.some((source) => source.startsWith('http:'))) {
            warnings.push(`${name} loads over plain http.`);
        }
    }
    const lines = [...directives].map(([name, sources]) => `${name.padEnd(26)} ${sources.join(' ') || '(no value)'}`);
    return [
        `Directives (${directives.size}):`,
        ...lines.map((line) => `  ${line}`),
        '',
        warnings.length ? `Findings (${warnings.length}):` : 'No findings.',
        ...warnings.map((warning) => `  - ${warning}`),
    ].join('\n');
}

export function buildCsp(preset: string): string {
    switch (preset) {
        case 'strict':
            return "default-src 'self'; script-src 'self' 'nonce-{RANDOM}' 'strict-dynamic'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";
        case 'api':
            return "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
        default:
            return "default-src 'self'; img-src 'self' data: https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests";
    }
}

// ── Tool definitions ─────────────────────────────────────────────────────────

export const webTools: UtilityTool[] = [
    {
        id: 'meta-tags',
        label: 'Meta Tag Generator',
        description: 'Build SEO, Open Graph, and Twitter card tags',
        command: 'devx.metaTagsTool',
        icon: 'meta.svg',
        defaultVisible: true,
        category: 'Web',
        summary:
            'Generates the <head> tags used by search engines and link previews in Slack, Teams, X, LinkedIn, and Facebook. Values are HTML-escaped.',
        fields: [
            { id: 'title', label: 'Title', kind: 'text', placeholder: 'My page' },
            { id: 'description', label: 'Description', kind: 'textarea', rows: 2 },
            { id: 'url', label: 'Canonical URL', kind: 'text', placeholder: 'https://example.com/page' },
            { id: 'image', label: 'Image URL (1200×630)', kind: 'text', placeholder: 'https://example.com/og.png' },
            { id: 'siteName', label: 'Site name', kind: 'text' },
            {
                id: 'type',
                label: 'og:type',
                kind: 'select',
                options: ['website', 'article', 'profile', 'book', 'music.song', 'video.movie', 'product'].map(
                    (value) => ({ value, label: value }),
                ),
                defaultValue: 'website',
            },
            { id: 'twitter', label: 'Twitter / X handle', kind: 'text', placeholder: '@example' },
            {
                id: 'card',
                label: 'Twitter card',
                kind: 'select',
                options: [
                    { value: '', label: 'Auto' },
                    { value: 'summary', label: 'summary' },
                    { value: 'summary_large_image', label: 'summary_large_image' },
                ],
                defaultValue: '',
            },
            { id: 'themeColor', label: 'Theme color', kind: 'text', placeholder: '#0066ff' },
            { id: 'locale', label: 'Locale', kind: 'text', placeholder: 'en_US' },
        ],
        actions: [{ id: 'generate', label: 'Generate' }],
        run: (_action, values) => {
            const input: MetaInput = {
                title: values.title ?? '',
                description: values.description ?? '',
                url: values.url ?? '',
                image: values.image ?? '',
                siteName: values.siteName ?? '',
                type: values.type ?? 'website',
                twitter: values.twitter ?? '',
                card: values.card ?? '',
                themeColor: values.themeColor ?? '',
                locale: values.locale ?? '',
            };
            return { output: buildMetaTags(input), notice: metaWarnings(input) };
        },
    },
    {
        id: 'safelink',
        label: 'Safe Link Decoder',
        description: 'Unwrap Outlook Safe Links, Proofpoint, and redirect URLs',
        command: 'devx.safeLinkTool',
        icon: 'safelink.svg',
        defaultVisible: true,
        category: 'Web',
        summary:
            'Shows the real destination behind Microsoft Defender Safe Links, Proofpoint URL Defense (v1–v3), Google, Facebook, and LinkedIn redirects, and generic ?url= wrappers. Nothing is opened or fetched.',
        fields: [
            {
                id: 'input',
                label: 'Wrapped URL',
                kind: 'textarea',
                rows: 4,
                placeholder: 'https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com&data=...',
            },
        ],
        actions: [{ id: 'decode', label: 'Decode' }],
        run: (_action, values) => ({ output: decodeSafeLink(values.input ?? '') }),
    },
    {
        id: 'email-normalize',
        label: 'Email Normalizer',
        description: 'Canonicalize email addresses to detect duplicates',
        command: 'devx.emailNormalizeTool',
        icon: 'email.svg',
        defaultVisible: true,
        category: 'Web',
        summary:
            'One address per line. Lowercases, strips +tags for providers that support them, removes Gmail dots, and maps alias domains such as googlemail.com. Useful for deduplicating sign-ups.',
        fields: [
            { id: 'input', label: 'Emails', kind: 'textarea', rows: 8, placeholder: 'John.Doe+news@GoogleMail.com' },
        ],
        actions: [{ id: 'normalize', label: 'Normalize' }],
        run: (_action, values) => ({ output: normalizeEmails(values.input ?? '') }),
    },
    {
        id: 'svg-placeholder',
        label: 'SVG Placeholder',
        description: 'Generate placeholder images as SVG or data URIs',
        command: 'devx.svgPlaceholderTool',
        icon: 'placeholder.svg',
        defaultVisible: true,
        category: 'Web',
        summary:
            'Creates a lightweight placeholder image for mockups. Copy the SVG markup, a data URI for <img src>, or a CSS background.',
        fields: [
            { id: 'width', label: 'Width', kind: 'number', defaultValue: '600' },
            { id: 'height', label: 'Height', kind: 'number', defaultValue: '400' },
            { id: 'background', label: 'Background', kind: 'text', defaultValue: '#cccccc' },
            { id: 'foreground', label: 'Text color', kind: 'text', defaultValue: '#555555' },
            { id: 'text', label: 'Text (blank = size)', kind: 'text' },
            { id: 'fontSize', label: 'Font size (0 = auto)', kind: 'number', defaultValue: '0' },
        ],
        actions: [
            { id: 'svg', label: 'SVG' },
            { id: 'datauri', label: 'Data URI' },
            { id: 'css', label: 'CSS background' },
        ],
        run: (action, values) => {
            const svg = svgPlaceholder(
                readInteger(values.width, 'Width', 1, 10000),
                readInteger(values.height, 'Height', 1, 10000),
                values.background ?? '',
                values.foreground ?? '',
                values.text ?? '',
                readInteger(values.fontSize, 'Font size', 0, 1000),
            );
            const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`;
            const output =
                action === 'datauri' ? dataUri : action === 'css' ? `background-image: url("${dataUri}");` : svg;
            return { output, previewHtml: svg };
        },
    },
    {
        id: 'ipv4-range',
        label: 'IPv4 Range / Converter',
        description: 'Convert IPv4 addresses and turn ranges into CIDR blocks',
        command: 'devx.ipv4RangeTool',
        icon: 'ip-range.svg',
        defaultVisible: true,
        category: 'Convert',
        summary:
            'Enter an address (or decimal/hex number) to see every representation and its scope; a start–end range to get the minimal CIDR list; or a CIDR to list its addresses.',
        fields: [
            {
                id: 'input',
                label: 'Address, range, or CIDR',
                kind: 'text',
                placeholder: '192.168.1.10 - 192.168.1.200',
            },
        ],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({ output: ipv4Report(values.input ?? '') }),
    },
    {
        id: 'csp',
        label: 'CSP Analyzer',
        description: 'Parse and audit a Content-Security-Policy header',
        command: 'devx.cspTool',
        icon: 'csp.svg',
        defaultVisible: true,
        category: 'Web',
        summary:
            "Lists each directive and flags common weaknesses: 'unsafe-inline' and 'unsafe-eval' scripts, wildcards, missing object-src, base-uri, frame-ancestors, and form-action. Starter policies are available too.",
        fields: [
            {
                id: 'input',
                label: 'Policy',
                kind: 'textarea',
                rows: 5,
                placeholder: "default-src 'self'; script-src 'self' https://cdn.example.com",
            },
            {
                id: 'preset',
                label: 'Starter policy',
                kind: 'select',
                options: [
                    { value: 'basic', label: 'Basic site' },
                    { value: 'strict', label: 'Strict (nonce + strict-dynamic)' },
                    { value: 'api', label: 'JSON API' },
                ],
                defaultValue: 'basic',
            },
        ],
        actions: [
            { id: 'analyze', label: 'Analyze' },
            { id: 'starter', label: 'Starter policy' },
        ],
        run: (action, values) => {
            if (action === 'starter') {
                const policy = buildCsp(values.preset || 'basic');
                return { output: `Content-Security-Policy: ${policy}\n\n${analyzeCsp(policy)}` };
            }
            return { output: analyzeCsp(values.input ?? '') };
        },
    },
];
