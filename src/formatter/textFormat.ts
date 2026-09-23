const SQL_KEYWORDS = [
    'LEFT JOIN',
    'RIGHT JOIN',
    'INNER JOIN',
    'OUTER JOIN',
    'ORDER BY',
    'GROUP BY',
    'SELECT',
    'FROM',
    'WHERE',
    'JOIN',
    'ON',
    'AND',
    'OR',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'INSERT',
    'INTO',
    'VALUES',
    'UPDATE',
    'SET',
    'DELETE',
    'CREATE',
    'TABLE',
    'ALTER',
    'DROP',
    'AS',
    'DISTINCT',
    'UNION',
    'CASE',
    'WHEN',
    'THEN',
    'ELSE',
    'END',
];

const SQL_KEYWORD_PATTERN = new RegExp(
    `\\b(?:${SQL_KEYWORDS.map((keyword) => keyword.replace(/ /g, '\\s+')).join('|')})\\b`,
    'gi',
);

export function formatJSON(text: string, indent: number): string {
    return JSON.stringify(JSON.parse(text), null, indent);
}

export function minifyJSON(text: string): string {
    return JSON.stringify(JSON.parse(text));
}

export function minifyXML(text: string): string {
    return text
        .replace(/>\s+</g, '><')
        .replace(/^\s+|\s+$/gm, '')
        .trim();
}

export function formatXML(xml: string, indent: number): string {
    const padding = ' '.repeat(indent);
    const reg = /(>)(<)(\/*)/g;
    let formatted = '';
    let pad = 0;

    xml = xml.replace(reg, '$1\r\n$2$3');

    xml.split('\r\n').forEach((node) => {
        let padDelta = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
            padDelta = 0;
        } else if (node.match(/^<\/\w/) && pad > 0) {
            pad -= 1;
        } else if (node.match(/^<\w[^>]*[^/]>.*$/)) {
            padDelta = 1;
        } else {
            padDelta = 0;
        }

        formatted += padding.repeat(pad) + node + '\r\n';
        pad += padDelta;
    });

    return formatted.trim();
}

export function formatSQL(sql: string): string {
    const holes: string[] = [];
    const masked = sql.replace(/('(?:[^']|'')*')|("(?:[^"]|"")*")/g, (match) => {
        holes.push(match);
        return `\u0000${holes.length - 1}\u0000`;
    });

    let formatted = masked.replace(SQL_KEYWORD_PATTERN, (match) => `\n${match.replace(/\s+/g, ' ').toUpperCase()}`);
    formatted = formatted.replace(/\u0000(\d+)\u0000/g, (_, index) => holes[Number(index)]);

    formatted = formatted
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n');

    const lines = formatted.split('\n');
    let indentLevel = 0;
    const indentedLines = lines.map((line) => {
        const upperLine = line.toUpperCase();

        if (
            upperLine.startsWith('SELECT') ||
            upperLine.startsWith('FROM') ||
            upperLine.startsWith('WHERE') ||
            upperLine.startsWith('ORDER BY') ||
            upperLine.startsWith('GROUP BY') ||
            upperLine.startsWith('HAVING') ||
            upperLine.startsWith('UNION') ||
            upperLine.startsWith('INSERT') ||
            upperLine.startsWith('UPDATE') ||
            upperLine.startsWith('DELETE') ||
            upperLine.startsWith('CREATE') ||
            upperLine.startsWith('ALTER') ||
            upperLine.startsWith('DROP')
        ) {
            indentLevel = 0;
        } else if (upperLine.includes('JOIN')) {
            indentLevel = 1;
        } else if (
            upperLine.startsWith('AND') ||
            upperLine.startsWith('OR') ||
            upperLine.startsWith('ON') ||
            upperLine.startsWith('SET') ||
            upperLine.startsWith('VALUES') ||
            upperLine.startsWith('WHEN') ||
            upperLine.startsWith('THEN') ||
            upperLine.startsWith('ELSE') ||
            upperLine.startsWith('END')
        ) {
            indentLevel = 1;
        }

        return '  '.repeat(indentLevel) + line;
    });

    return indentedLines.join('\n');
}
