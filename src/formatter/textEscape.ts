export function escapeJsonStyle(text: string): string {
    return text.replace(/[\u0000-\u001F"\\]/g, (char) => {
        switch (char) {
            case '"':
                return '\\"';
            case '\\':
                return '\\\\';
            case '\b':
                return '\\b';
            case '\f':
                return '\\f';
            case '\n':
                return '\\n';
            case '\r':
                return '\\r';
            case '\t':
                return '\\t';
            default:
                return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
        }
    });
}

export function stripWrappingQuotes(text: string): string {
    if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
        return text.slice(1, -1);
    }
    return text;
}

export function decodeJsonEscapes(input: string): string {
    let output = '';

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (char !== '\\') {
            output += char;
            continue;
        }

        if (i === input.length - 1) {
            throw new Error('Invalid escape sequence: trailing backslash');
        }

        const next = input[i + 1];
        switch (next) {
            case '"':
                output += '"';
                i++;
                break;
            case '\\':
                output += '\\';
                i++;
                break;
            case '/':
                output += '/';
                i++;
                break;
            case 'b':
                output += '\b';
                i++;
                break;
            case 'f':
                output += '\f';
                i++;
                break;
            case 'n':
                output += '\n';
                i++;
                break;
            case 'r':
                output += '\r';
                i++;
                break;
            case 't':
                output += '\t';
                i++;
                break;
            case 'u': {
                if (i + 5 >= input.length) {
                    throw new Error('Invalid unicode escape sequence: incomplete \\uXXXX token');
                }
                const hex = input.slice(i + 2, i + 6);
                if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                    throw new Error(`Invalid unicode escape sequence: \\u${hex}`);
                }
                output += String.fromCharCode(parseInt(hex, 16));
                i += 5;
                break;
            }
            default:
                throw new Error(`Invalid escape sequence: \\${next}`);
        }
    }

    return output;
}

export function unescapeJsonStyle(text: string, tabSize: number): string {
    const decoded = decodeJsonEscapes(stripWrappingQuotes(text));
    return decoded.replace(/\t/g, ' '.repeat(tabSize));
}
