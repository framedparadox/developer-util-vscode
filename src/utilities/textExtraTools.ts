import { choice, linesOf, readInteger, requireText } from './common';
import type { UtilityTool } from './types';

// ── Numeronyms ───────────────────────────────────────────────────────────────

export function numeronym(value: string): string {
    return value.replace(/\p{L}+/gu, (word) => {
        const chars = [...word];
        return chars.length <= 3 ? word : `${chars[0]}${chars.length - 2}${chars[chars.length - 1]}`;
    });
}

// ── Morse code ───────────────────────────────────────────────────────────────

const MORSE: Record<string, string> = {
    A: '.-',
    B: '-...',
    C: '-.-.',
    D: '-..',
    E: '.',
    F: '..-.',
    G: '--.',
    H: '....',
    I: '..',
    J: '.---',
    K: '-.-',
    L: '.-..',
    M: '--',
    N: '-.',
    O: '---',
    P: '.--.',
    Q: '--.-',
    R: '.-.',
    S: '...',
    T: '-',
    U: '..-',
    V: '...-',
    W: '.--',
    X: '-..-',
    Y: '-.--',
    Z: '--..',
    0: '-----',
    1: '.----',
    2: '..---',
    3: '...--',
    4: '....-',
    5: '.....',
    6: '-....',
    7: '--...',
    8: '---..',
    9: '----.',
    '.': '.-.-.-',
    ',': '--..--',
    '?': '..--..',
    "'": '.----.',
    '!': '-.-.--',
    '/': '-..-.',
    '(': '-.--.',
    ')': '-.--.-',
    '&': '.-...',
    ':': '---...',
    ';': '-.-.-.',
    '=': '-...-',
    '+': '.-.-.',
    '-': '-....-',
    _: '..--.-',
    '"': '.-..-.',
    $: '...-..-',
    '@': '.--.-.',
};
const MORSE_REVERSE = Object.fromEntries(Object.entries(MORSE).map(([char, code]) => [code, char]));

export function encodeMorse(value: string): string {
    const unknown = new Set<string>();
    const words = value
        .toUpperCase()
        .trim()
        .split(/\s+/)
        .map((word) =>
            [...word]
                .map((char) => {
                    const code = MORSE[char];
                    if (!code) {
                        unknown.add(char);
                    }
                    return code ?? '';
                })
                .filter(Boolean)
                .join(' '),
        );
    if (unknown.size) {
        throw new Error(`No Morse code for: ${[...unknown].join(' ')}`);
    }
    return words.join(' / ');
}

export function decodeMorse(value: string): string {
    const normalized = value
        .replace(/[•·]/g, '.')
        .replace(/[−–—_]/g, '-')
        .trim();
    return normalized
        .split(/\s*(?:\/|\|| {3,}|\n)\s*/)
        .map((word) =>
            word
                .split(/\s+/)
                .filter(Boolean)
                .map((code) => {
                    const char = MORSE_REVERSE[code];
                    if (!char) {
                        throw new Error(`Unknown Morse sequence "${code}".`);
                    }
                    return char;
                })
                .join(''),
        )
        .join(' ');
}

// ── String escaping for languages ────────────────────────────────────────────

function cEscape(value: string, quote: string, unicode: 'u4' | 'x' | 'none'): string {
    let out = '';
    for (const char of value) {
        const code = char.codePointAt(0)!;
        switch (char) {
            case '\\':
                out += '\\\\';
                continue;
            case '\n':
                out += '\\n';
                continue;
            case '\r':
                out += '\\r';
                continue;
            case '\t':
                out += '\\t';
                continue;
            case '\b':
                out += '\\b';
                continue;
            case '\f':
                out += '\\f';
                continue;
            case '\0':
                out += unicode === 'u4' ? '\\u0000' : '\\0';
                continue;
        }
        if (char === quote) {
            out += `\\${char}`;
        } else if (code < 0x20 || code === 0x7f) {
            out +=
                unicode === 'u4'
                    ? `\\u${code.toString(16).padStart(4, '0')}`
                    : `\\x${code.toString(16).padStart(2, '0')}`;
        } else if (code > 0x7e && unicode === 'u4') {
            if (code > 0xffff) {
                const high = Math.floor((code - 0x10000) / 0x400) + 0xd800;
                const low = ((code - 0x10000) % 0x400) + 0xdc00;
                out += `\\u${high.toString(16)}\\u${low.toString(16)}`;
            } else {
                out += `\\u${code.toString(16).padStart(4, '0')}`;
            }
        } else {
            out += char;
        }
    }
    return out;
}

function cUnescape(value: string): string {
    return value.replace(
        /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{2}|[0-7]{1,3}|.)/gs,
        (_, seq: string) => {
            if (seq.startsWith('u{')) {
                return String.fromCodePoint(parseInt(seq.slice(2, -1), 16));
            }
            if (/^[uU]/.test(seq) && seq.length > 1) {
                return String.fromCodePoint(parseInt(seq.slice(1), 16));
            }
            if (seq.startsWith('x') && seq.length === 3) {
                return String.fromCharCode(parseInt(seq.slice(1), 16));
            }
            if (/^[0-7]+$/.test(seq)) {
                return String.fromCharCode(parseInt(seq, 8));
            }
            const map: Record<string, string> = {
                n: '\n',
                r: '\r',
                t: '\t',
                b: '\b',
                f: '\f',
                v: '\v',
                a: '\x07',
                e: '\x1b',
                '0': '\0',
            };
            return map[seq] ?? seq;
        },
    );
}

export function escapeFor(value: string, target: string): string {
    switch (target) {
        case 'java':
        case 'csharp':
        case 'json':
            return `"${cEscape(value, '"', 'u4')}"`;
        case 'javascript':
            return `'${cEscape(value, "'", 'none')}'`;
        case 'c':
            return `"${cEscape(value, '"', 'x')}"`;
        case 'python':
            return `'${cEscape(value, "'", 'x')}'`;
        case 'go':
            return value.includes('`') || /[\r]/.test(value) ? `"${cEscape(value, '"', 'x')}"` : `\`${value}\``;
        case 'regex':
            return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
        case 'shell':
            return `'${value.replace(/'/g, `'\\''`)}'`;
        case 'powershell':
            return `'${value.replace(/'/g, "''")}'`;
        case 'cmd':
            return value.replace(/([&|<>^%()!"])/g, '^$1');
        case 'sql':
            return `'${value.replace(/'/g, "''")}'`;
        case 'csv':
            return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        case 'xml':
            return value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        case 'yaml':
            return `"${cEscape(value, '"', 'u4')}"`;
        case 'markdown':
            return value.replace(/([\\`*_{}[\]()#+\-.!|<>~])/g, '\\$1');
        default:
            throw new Error('Unknown target.');
    }
}

function stripQuotes(value: string, quotes: string[]): string {
    const text = value.trim();
    for (const quote of quotes) {
        if (text.length >= 2 && text.startsWith(quote) && text.endsWith(quote)) {
            return text.slice(quote.length, -quote.length);
        }
    }
    return value;
}

export function unescapeFor(value: string, target: string): string {
    switch (target) {
        case 'java':
        case 'csharp':
        case 'json':
        case 'javascript':
        case 'c':
        case 'python':
        case 'yaml':
            return cUnescape(stripQuotes(value, ['"', "'"]));
        case 'go': {
            const text = value.trim();
            if (text.startsWith('`') && text.endsWith('`')) {
                return text.slice(1, -1);
            }
            return cUnescape(stripQuotes(value, ['"']));
        }
        case 'regex':
            return value.replace(/\\(.)/g, '$1');
        case 'shell':
            return stripQuotes(value, ["'"]).replace(/'\\''/g, "'");
        case 'powershell':
        case 'sql':
            return stripQuotes(value, ["'"]).replace(/''/g, "'");
        case 'cmd':
            return value.replace(/\^(.)/g, '$1');
        case 'csv':
            return stripQuotes(value, ['"']).replace(/""/g, '"');
        case 'xml':
            return value
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
                .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
                .replace(/&amp;/g, '&');
        case 'markdown':
            return value.replace(/\\([\\`*_{}[\]()#+\-.!|<>~])/g, '$1');
        default:
            throw new Error('Unknown target.');
    }
}

// ── Hex dump ─────────────────────────────────────────────────────────────────

export function hexDump(data: Buffer, width: number): string {
    const lines: string[] = [];
    for (let offset = 0; offset < data.length; offset += width) {
        const chunk = data.subarray(offset, offset + width);
        const groups: string[] = [];
        for (let index = 0; index < width; index += 2) {
            const pair = chunk.subarray(index, index + 2);
            groups.push(pair.length ? pair.toString('hex').padEnd(4, ' ') : '    ');
        }
        const ascii = [...chunk]
            .map((byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.'))
            .join('');
        lines.push(`${offset.toString(16).padStart(8, '0')}: ${groups.join(' ')}  ${ascii}`);
    }
    return lines.join('\n');
}

export function reverseHexDump(value: string): Buffer {
    const bytes: string[] = [];
    for (const line of linesOf(value)) {
        const dump = /^\s*[0-9a-f]+:\s+((?:[0-9a-f]{2,4}\s?)+)/i.exec(line);
        const source = dump ? dump[1] : line;
        bytes.push(source.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, ''));
    }
    const hex = bytes.join('');
    if (hex.length % 2 !== 0) {
        throw new Error('Hex input has an odd number of digits.');
    }
    return Buffer.from(hex, 'hex');
}

// ── Cheatsheets ──────────────────────────────────────────────────────────────

export const CHEATSHEETS: Record<string, Array<[string, string]>> = {
    git: [
        ['git init', 'Create a repository in the current folder'],
        ['git clone <url> [dir]', 'Clone a repository'],
        ['git status -sb', 'Short status with branch info'],
        ['git add -p', 'Stage changes hunk by hunk'],
        ['git commit -m "msg"', 'Commit staged changes'],
        ['git commit --amend --no-edit', 'Add staged changes to the last commit'],
        ['git switch -c <branch>', 'Create and switch to a branch'],
        ['git switch -', 'Switch to the previous branch'],
        ['git branch -d <branch>', 'Delete a merged branch (-D to force)'],
        ['git push -u origin <branch>', 'Push and set upstream'],
        ['git push --force-with-lease', 'Force-push only if the remote has not moved'],
        ['git pull --rebase', 'Fetch and rebase local commits on top'],
        ['git fetch --prune', 'Fetch and drop deleted remote branches'],
        ['git log --oneline --graph --decorate --all', 'Compact history graph'],
        ['git log -p -- <file>', 'History of one file with diffs'],
        ['git log -S "text"', 'Find commits that added or removed text'],
        ['git blame -L 10,20 <file>', 'Who changed lines 10–20'],
        ['git diff --staged', 'Diff of staged changes'],
        ['git diff main...HEAD', 'Changes on this branch since it left main'],
        ['git restore <file>', 'Discard unstaged changes to a file'],
        ['git restore --staged <file>', 'Unstage a file'],
        ['git reset --soft HEAD~1', 'Undo last commit, keep changes staged'],
        ['git reset --hard origin/main', 'Discard everything and match the remote'],
        ['git revert <sha>', 'Create a commit that undoes <sha>'],
        ['git stash push -m "msg"', 'Stash changes with a message'],
        ['git stash pop', 'Apply and drop the latest stash'],
        ['git cherry-pick <sha>', 'Apply a commit onto the current branch'],
        ['git rebase main', 'Replay this branch on top of main'],
        ['git rebase --onto new old', 'Move commits after old onto new'],
        ['git merge --no-ff <branch>', 'Merge with a merge commit'],
        ['git tag -a v1.0.0 -m "msg"', 'Create an annotated tag'],
        ['git push --tags', 'Push tags'],
        ['git reflog', 'Every position HEAD has been at (recover lost commits)'],
        ['git bisect start / good / bad', 'Binary search for the commit that broke something'],
        ['git worktree add ../dir <branch>', 'Check out a branch in another folder'],
        ['git clean -fdn', 'Preview removing untracked files (-f to do it)'],
        ['git remote -v', 'List remotes'],
        ['git config --global user.email "you@example.com"', 'Set your commit email'],
        ['git shortlog -sn', 'Commit counts by author'],
        ['git rm --cached <file>', 'Stop tracking a file but keep it on disk'],
    ],
    regex: [
        ['.', 'Any character except newline (all with the s flag)'],
        ['\\d \\w \\s', 'Digit, word character, whitespace'],
        ['\\D \\W \\S', 'Not digit, not word, not whitespace'],
        ['[abc] [^abc] [a-z]', 'Set, negated set, range'],
        ['^ $', 'Start and end of input (of line with the m flag)'],
        ['\\b \\B', 'Word boundary, not a word boundary'],
        ['* + ?', '0 or more, 1 or more, 0 or 1'],
        ['{n} {n,} {n,m}', 'Exactly n, n or more, between n and m'],
        ['*? +? ??', 'Lazy (as few as possible) quantifiers'],
        ['(abc)', 'Capturing group'],
        ['(?:abc)', 'Non-capturing group'],
        ['(?<name>abc)', 'Named group, referenced as \\k<name>'],
        ['\\1', 'Backreference to group 1'],
        ['a|b', 'Alternation'],
        ['(?=abc)', 'Positive lookahead'],
        ['(?!abc)', 'Negative lookahead'],
        ['(?<=abc)', 'Positive lookbehind'],
        ['(?<!abc)', 'Negative lookbehind'],
        ['\\p{L} \\p{N}', 'Unicode letter, number (u flag)'],
        ['flags: g i m s u y d', 'global, ignore case, multiline, dotAll, unicode, sticky, indices'],
        ['^[\\w.+-]+@[\\w-]+\\.[\\w.]+$', 'Simple email check'],
        ['^\\d{4}-\\d{2}-\\d{2}$', 'ISO date (YYYY-MM-DD)'],
        ['^(?:\\d{1,3}\\.){3}\\d{1,3}$', 'IPv4 shape'],
        ['^#?([a-f\\d]{3}|[a-f\\d]{6})$', 'Hex color (i flag)'],
        ['^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', 'UUID (i flag)'],
        ['^\\s+|\\s+$', 'Leading or trailing whitespace'],
        ['https?:\\/\\/[^\\s]+', 'URL in text'],
        ['^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{12,}$', 'Password with lower, upper, digit, and 12+ chars'],
    ],
    docker: [
        ['docker run -d --name web -p 8080:80 nginx', 'Run detached with a name and port mapping'],
        ['docker run --rm -it ubuntu bash', 'Throwaway interactive container'],
        ['docker ps -a', 'List all containers'],
        ['docker logs -f --tail 100 <name>', 'Follow the last 100 log lines'],
        ['docker exec -it <name> sh', 'Shell into a running container'],
        ['docker stop / start / restart <name>', 'Lifecycle'],
        ['docker rm -f <name>', 'Force-remove a container'],
        ['docker images', 'List images'],
        ['docker build -t app:1.0 .', 'Build an image from the Dockerfile'],
        ['docker build --no-cache --pull -t app .', 'Clean rebuild with fresh base images'],
        ['docker tag app:1.0 registry/app:1.0', 'Tag for a registry'],
        ['docker push registry/app:1.0', 'Push an image'],
        ['docker inspect <name>', 'Full JSON details'],
        ['docker stats', 'Live CPU and memory usage'],
        ['docker cp <name>:/path ./local', 'Copy files out of a container'],
        ['docker volume ls / prune', 'List or remove unused volumes'],
        ['docker network ls / create <net>', 'Networks'],
        ['docker system df', 'Disk usage'],
        ['docker system prune -a', 'Remove all unused data'],
        ['docker compose up -d --build', 'Build and start services'],
        ['docker compose down -v', 'Stop and remove services and volumes'],
        ['docker compose logs -f <svc>', 'Follow a service log'],
        ['docker compose exec <svc> sh', 'Shell into a service'],
    ],
    kubectl: [
        ['kubectl config get-contexts', 'List contexts'],
        ['kubectl config use-context <ctx>', 'Switch context'],
        ['kubectl config set-context --current --namespace=<ns>', 'Set the default namespace'],
        ['kubectl get pods -A -o wide', 'All pods in all namespaces'],
        ['kubectl get all -n <ns>', 'Common resources in a namespace'],
        ['kubectl describe pod <pod>', 'Events and details'],
        ['kubectl logs -f <pod> -c <container>', 'Follow container logs'],
        ['kubectl logs --previous <pod>', 'Logs from the crashed container'],
        ['kubectl exec -it <pod> -- sh', 'Shell into a pod'],
        ['kubectl port-forward svc/<svc> 8080:80', 'Forward a local port'],
        ['kubectl apply -f file.yaml', 'Create or update from a manifest'],
        ['kubectl delete -f file.yaml', 'Delete from a manifest'],
        ['kubectl rollout status deploy/<name>', 'Watch a rollout'],
        ['kubectl rollout undo deploy/<name>', 'Roll back'],
        ['kubectl rollout restart deploy/<name>', 'Restart pods'],
        ['kubectl scale deploy/<name> --replicas=3', 'Scale'],
        ['kubectl get events --sort-by=.lastTimestamp', 'Recent events'],
        ['kubectl top pods', 'CPU and memory (needs metrics-server)'],
        ['kubectl get secret <s> -o jsonpath="{.data.key}" | base64 -d', 'Read a secret value'],
        ['kubectl create secret generic <s> --from-literal=k=v', 'Create a secret'],
        ['kubectl explain deployment.spec', 'Field documentation'],
        ['kubectl run tmp --rm -it --image=busybox -- sh', 'Temporary debug pod'],
    ],
    vim: [
        ['i a o', 'Insert before, after, new line below'],
        ['Esc', 'Back to normal mode'],
        [':w :q :wq :q!', 'Write, quit, both, quit without saving'],
        ['h j k l', 'Left, down, up, right'],
        ['w b e', 'Next word, previous word, end of word'],
        ['0 ^ $', 'Line start, first non-blank, line end'],
        ['gg G :42', 'First line, last line, line 42'],
        ['dd yy p P', 'Delete line, yank line, paste after, paste before'],
        ['u Ctrl-r', 'Undo, redo'],
        ['x r<c>', 'Delete char, replace char'],
        ['ciw ci" dit', 'Change word, change inside quotes, delete inside tag'],
        ['v V Ctrl-v', 'Visual, visual line, visual block'],
        ['/text n N', 'Search forward, next, previous'],
        [':%s/old/new/gc', 'Replace everywhere with confirmation'],
        ['.', 'Repeat the last change'],
        ['>> <<', 'Indent, outdent'],
        ['qa ... q @a', 'Record macro a, play it'],
        [':sp :vsp', 'Split horizontally, vertically'],
        ['Ctrl-w w', 'Next window'],
    ],
    http: [
        ['GET', 'Read a resource; safe and idempotent'],
        ['POST', 'Create or submit; not idempotent'],
        ['PUT', 'Replace a resource; idempotent'],
        ['PATCH', 'Partial update'],
        ['DELETE', 'Remove a resource; idempotent'],
        ['HEAD / OPTIONS', 'Headers only / allowed methods and CORS preflight'],
        ['Accept', 'Media types the client wants'],
        ['Authorization: Bearer <token>', 'Token auth'],
        ['Cache-Control: no-store', 'Never cache'],
        ['Cache-Control: public, max-age=31536000, immutable', 'Cache static assets for a year'],
        ['Content-Type: application/json; charset=utf-8', 'Body media type'],
        ['ETag / If-None-Match', 'Conditional requests (304 Not Modified)'],
        ['Strict-Transport-Security: max-age=63072000; includeSubDomains; preload', 'HSTS'],
        ['X-Content-Type-Options: nosniff', 'Disable MIME sniffing'],
        ['Referrer-Policy: strict-origin-when-cross-origin', 'Sensible referrer default'],
        ['Permissions-Policy: camera=(), microphone=()', 'Disable browser features'],
        ['Set-Cookie: id=1; Secure; HttpOnly; SameSite=Lax', 'Safer cookie flags'],
        ['Retry-After: 120', 'When to retry after 429 or 503'],
    ],
};

export function showCheatsheet(topic: string, filter: string): string {
    const sheet = CHEATSHEETS[topic];
    if (!sheet) {
        throw new Error('Unknown cheatsheet.');
    }
    const query = filter.trim().toLowerCase();
    const rows = query
        ? sheet.filter(([command, info]) => command.toLowerCase().includes(query) || info.toLowerCase().includes(query))
        : sheet;
    if (rows.length === 0) {
        throw new Error('No entries match the filter.');
    }
    const width = Math.min(52, Math.max(...rows.map(([command]) => command.length)));
    return rows
        .map(([command, info]) =>
            command.length > width ? `${command}\n${' '.repeat(width)}  ${info}` : `${command.padEnd(width)}  ${info}`,
        )
        .join('\n');
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const ESCAPE_TARGETS = [
    { value: 'json', label: 'JSON string' },
    { value: 'javascript', label: 'JavaScript string' },
    { value: 'java', label: 'Java string' },
    { value: 'csharp', label: 'C# string' },
    { value: 'c', label: 'C / C++ string' },
    { value: 'python', label: 'Python string' },
    { value: 'go', label: 'Go string' },
    { value: 'yaml', label: 'YAML double-quoted' },
    { value: 'regex', label: 'Regular expression literal' },
    { value: 'shell', label: 'POSIX shell (single quotes)' },
    { value: 'powershell', label: 'PowerShell (single quotes)' },
    { value: 'cmd', label: 'Windows cmd (^ escapes)' },
    { value: 'sql', label: 'SQL string literal' },
    { value: 'csv', label: 'CSV field' },
    { value: 'xml', label: 'XML / HTML text' },
    { value: 'markdown', label: 'Markdown text' },
];

export const textExtraTools: UtilityTool[] = [
    {
        id: 'string-escape',
        label: 'String Escape',
        description: 'Escape text for JSON, Java, C#, Python, Go, shell, SQL, CSV, regex, and more',
        command: 'devx.stringEscapeTool',
        icon: 'string-escape.svg',
        defaultVisible: true,
        category: 'Text',
        summary:
            'Turns raw text into a correctly quoted literal for the chosen language, or back again. Use it when pasting file paths, JSON, or messages into code, scripts, or queries.',
        fields: [
            { id: 'input', label: 'Text', kind: 'textarea', rows: 8 },
            { id: 'target', label: 'Target', kind: 'select', options: ESCAPE_TARGETS, defaultValue: 'json' },
        ],
        actions: [
            { id: 'escape', label: 'Escape' },
            { id: 'unescape', label: 'Unescape' },
        ],
        run: (action, values) => {
            const target = choice(
                values.target,
                'target',
                ESCAPE_TARGETS.map((t) => t.value),
                'json',
            );
            const input = values.input ?? '';
            if (!input) {
                throw new Error('Text is required.');
            }
            return { output: action === 'unescape' ? unescapeFor(input, target) : escapeFor(input, target) };
        },
    },
    {
        id: 'numeronym',
        label: 'Numeronym Generator',
        description: 'Turn words into numeronyms like i18n and k8s',
        command: 'devx.numeronymTool',
        icon: 'numeronym.svg',
        defaultVisible: true,
        category: 'Text',
        summary:
            'Replaces the middle letters of each word longer than three letters with their count: internationalization → i18n, kubernetes → k8s.',
        fields: [
            {
                id: 'input',
                label: 'Text',
                kind: 'textarea',
                rows: 4,
                placeholder: 'internationalization localization kubernetes',
            },
        ],
        actions: [{ id: 'convert', label: 'Convert' }],
        run: (_action, values) => ({ output: numeronym(requireText(values.input, 'Text')) }),
    },
    {
        id: 'morse',
        label: 'Morse Code',
        description: 'Encode and decode International Morse code',
        command: 'devx.morseTool',
        icon: 'morse.svg',
        defaultVisible: true,
        category: 'Text',
        summary:
            'Letters are separated by spaces and words by " / ". Decoding also accepts | or three spaces between words, and • or − symbols.',
        fields: [{ id: 'input', label: 'Text or Morse', kind: 'textarea', rows: 5 }],
        actions: [
            { id: 'encode', label: 'Encode' },
            { id: 'decode', label: 'Decode' },
        ],
        run: (action, values) => {
            const input = requireText(values.input, 'Input');
            return { output: action === 'decode' ? decodeMorse(input) : encodeMorse(input) };
        },
    },
    {
        id: 'hexdump',
        label: 'Hex Dump',
        description: 'View text as an xxd-style hex dump, or rebuild text from hex',
        command: 'devx.hexDumpTool',
        icon: 'hexdump.svg',
        defaultVisible: true,
        category: 'Encode',
        summary:
            'Shows offset, hex bytes, and printable ASCII, like xxd. Reverse accepts a dump, spaced hex, or 0x-prefixed bytes and decodes them as UTF-8.',
        fields: [
            { id: 'input', label: 'Input', kind: 'textarea', rows: 8 },
            {
                id: 'width',
                label: 'Bytes per row',
                kind: 'select',
                options: ['8', '16', '24', '32'].map((value) => ({ value, label: value })),
                defaultValue: '16',
            },
        ],
        actions: [
            { id: 'dump', label: 'Dump' },
            { id: 'reverse', label: 'Hex → text' },
        ],
        run: (action, values) => {
            const input = values.input ?? '';
            if (!input) {
                throw new Error('Input is required.');
            }
            if (action === 'reverse') {
                const bytes = reverseHexDump(input);
                return { output: bytes.toString('utf8'), notice: `${bytes.length} bytes` };
            }
            const data = Buffer.from(input, 'utf8');
            return {
                output: hexDump(data, readInteger(values.width, 'Bytes per row', 8, 32)),
                notice: `${data.length} bytes`,
            };
        },
    },
    {
        id: 'cheatsheets',
        label: 'Cheatsheets',
        description: 'Git, regex, Docker, kubectl, Vim, and HTTP quick reference',
        command: 'devx.cheatsheetTool',
        icon: 'cheatsheet.svg',
        defaultVisible: true,
        category: 'Reference',
        summary:
            'Searchable offline quick references for everyday commands and syntax. Type in Filter to narrow the list.',
        fields: [
            {
                id: 'topic',
                label: 'Topic',
                kind: 'select',
                options: [
                    { value: 'git', label: 'Git' },
                    { value: 'regex', label: 'Regular expressions' },
                    { value: 'docker', label: 'Docker' },
                    { value: 'kubectl', label: 'kubectl' },
                    { value: 'vim', label: 'Vim' },
                    { value: 'http', label: 'HTTP methods and headers' },
                ],
                defaultValue: 'git',
            },
            { id: 'filter', label: 'Filter', kind: 'text', placeholder: 'rebase' },
        ],
        actions: [{ id: 'show', label: 'Show' }],
        run: (_action, values) => ({ output: showCheatsheet(values.topic || 'git', values.filter ?? '') }),
    },
];
