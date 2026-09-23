export function parseJsonc(text: string): unknown {
    try {
        return JSON.parse(stripJsonc(text));
    } catch (error) {
        throw new Error(`JSON parsing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function stripJsonc(input: string): string {
    let output = '';
    let index = 0;
    let state: 'code' | 'string' | 'lineComment' | 'blockComment' = 'code';
    let escaped = false;

    while (index < input.length) {
        const char = input[index];
        const next = index + 1 < input.length ? input[index + 1] : '';

        if (state === 'lineComment') {
            if (char === '\n' || char === '\r') {
                output += char;
                if (char === '\r' && next === '\n') {
                    output += next;
                    index += 1;
                }
                state = 'code';
            }
            index += 1;
            continue;
        }

        if (state === 'blockComment') {
            if (char === '*' && next === '/') {
                state = 'code';
                index += 2;
                continue;
            }
            if (char === '\n' || char === '\r') {
                output += char;
            }
            index += 1;
            continue;
        }

        if (state === 'string') {
            output += char;
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                state = 'code';
            }
            index += 1;
            continue;
        }

        if (char === '"') {
            state = 'string';
            escaped = false;
            output += char;
            index += 1;
            continue;
        }

        if (char === '/' && next === '/') {
            state = 'lineComment';
            index += 2;
            continue;
        }

        if (char === '/' && next === '*') {
            state = 'blockComment';
            index += 2;
            continue;
        }

        output += char;
        index += 1;
    }

    return stripTrailingCommas(output);
}

function stripTrailingCommas(input: string): string {
    let output = '';
    let index = 0;
    let inString = false;
    let escaped = false;

    while (index < input.length) {
        const char = input[index];
        if (inString) {
            output += char;
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            index += 1;
            continue;
        }

        if (char === '"') {
            inString = true;
            output += char;
            index += 1;
            continue;
        }

        if (char === ',') {
            let lookahead = index + 1;
            while (lookahead < input.length && /[\s\r\n]/.test(input[lookahead])) {
                lookahead += 1;
            }
            if (lookahead < input.length && (input[lookahead] === '}' || input[lookahead] === ']')) {
                index += 1;
                continue;
            }
        }

        output += char;
        index += 1;
    }

    return output;
}
