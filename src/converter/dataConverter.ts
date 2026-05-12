import { ConversionFormat, OutputFormat, ConversionResult, DataConverter as IDataConverter } from '../visualizer/types';
import { JSONParser, YAMLParser, XMLParserImpl, CSVParser, RAMLParser } from '../visualizer/parsers';
import * as yaml from 'js-yaml';

/**
 * DataConverter - Converts between different data formats
 * Currently supports converting all formats to JSON
 */
export class DataConverter implements IDataConverter {
    /**
     * Convert data from one format to another
     * @param content Source data as string
     * @param sourceFormat Source format (json, yaml, xml, csv, raml)
     * @param targetFormat Target format (currently only json supported)
     * @returns ConversionResult with output or error
     */
    convert(content: string, sourceFormat: ConversionFormat, targetFormat: OutputFormat): ConversionResult {
        const startTime = Date.now();
        const sourceSize = new Blob([content]).size;

        try {
            // Step 1: Parse source format to JSON object
            const parsedData = this.parseSourceFormat(content, sourceFormat);

            // Step 2: Convert to target format
            const output = this.formatOutput(parsedData, targetFormat);

            const conversionTime = Date.now() - startTime;
            const outputSize = new Blob([output]).size;

            return {
                success: true,
                output,
                metadata: {
                    sourceFormat,
                    targetFormat,
                    sourceSize,
                    outputSize,
                    conversionTime,
                },
            };
        } catch (error) {
            const conversionTime = Date.now() - startTime;
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                metadata: {
                    sourceFormat,
                    targetFormat,
                    sourceSize,
                    outputSize: 0,
                    conversionTime,
                },
            };
        }
    }

    /**
     * Parse source format to JSON object using existing parsers
     */
    private parseSourceFormat(content: string, format: ConversionFormat): any {
        let parsed: any;

        switch (format) {
            case 'json':
                parsed = new JSONParser().parse(content);
                break;

            case 'yaml':
                parsed = new YAMLParser().parse(content);
                break;

            case 'xml':
                parsed = new XMLParserImpl().parse(content);
                break;

            case 'csv':
                parsed = new CSVParser().parse(content);
                break;

            case 'raml':
                parsed = new RAMLParser().parse(content);
                break;

            default:
                throw new Error(`Unsupported source format: ${format}`);
        }

        // Normalize the parsed data
        return this.normalizeData(parsed);
    }

    /**
     * Normalize parsed data to remove common issues
     */
    private normalizeData(data: any): any {
        if (data === null || data === undefined) {
            return data;
        }

        // Handle arrays
        if (Array.isArray(data)) {
            return data.map((item) => this.normalizeData(item));
        }

        // Handle objects
        if (typeof data === 'object') {
            const normalized: any = {};

            for (const key of Object.keys(data)) {
                const value = data[key];

                // Skip empty objects and null values if desired
                if (value === null || value === undefined) {
                    normalized[key] = value;
                } else if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
                    // Skip empty objects
                    continue;
                } else {
                    normalized[key] = this.normalizeData(value);
                }
            }

            return normalized;
        }

        // Primitive values
        return data;
    }

    /**
     * Format parsed data to target format
     */
    private formatOutput(data: any, format: OutputFormat): string {
        switch (format) {
            case 'json':
                return JSON.stringify(data, null, 2);

            case 'xml':
                return this.generateXmlDocument(data);

            case 'yaml':
                return yaml.dump(data, {
                    indent: 2,
                    lineWidth: 120,
                    noRefs: true,
                    sortKeys: false,
                });

            default:
                throw new Error(`Unsupported target format: ${format}`);
        }
    }

    /**
     * Convert JSON object to XML string
     */
    private jsonToXml(obj: any, rootName: string = 'root', indentLevel: number = 0): string {
        const indent = '  '.repeat(indentLevel);
        const childIndent = '  '.repeat(indentLevel + 1);

        // Handle null/undefined
        if (obj === null || obj === undefined) {
            return `${indent}<${rootName}/>`;
        }

        // Handle primitives
        if (typeof obj !== 'object') {
            const escaped = this.escapeXml(String(obj));
            return `${indent}<${rootName}>${escaped}</${rootName}>`;
        }

        // Handle arrays
        if (Array.isArray(obj)) {
            if (obj.length === 0) {
                return `${indent}<${rootName}/>`;
            }

            const items = obj
                .map((item, index) => {
                    // Use 'item' as element name for array children
                    return this.jsonToXml(item, 'item', indentLevel + 1);
                })
                .join('\n');

            return `${indent}<${rootName}>\n${items}\n${indent}</${rootName}>`;
        }

        // Handle objects
        const keys = Object.keys(obj);
        if (keys.length === 0) {
            return `${indent}<${rootName}/>`;
        }

        const children = keys
            .map((key) => {
                const sanitizedKey = this.sanitizeXmlTag(key);
                return this.jsonToXml(obj[key], sanitizedKey, indentLevel + 1);
            })
            .join('\n');

        return `${indent}<${rootName}>\n${children}\n${indent}</${rootName}>`;
    }

    /**
     * Escape special XML characters
     */
    private escapeXml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Sanitize tag names for XML (remove invalid characters)
     */
    private sanitizeXmlTag(tag: string): string {
        // XML tag names must start with letter or underscore
        // and can contain letters, digits, hyphens, underscores, and periods
        let sanitized = tag
            .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace invalid chars with underscore
            .replace(/^[^a-zA-Z_]/, '_$&'); // Ensure starts with letter or underscore

        return sanitized || 'element';
    }

    /**
     * Generate complete XML document
     */
    private generateXmlDocument(data: any): string {
        const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>';
        const xmlContent = this.jsonToXml(data, 'root', 0);
        return `${xmlDeclaration}\n${xmlContent}`;
    }

    /**
     * Detect format from file extension or content
     */
    static detectFormat(fileName: string, content?: string): ConversionFormat | null {
        const ext = fileName.split('.').pop()?.toLowerCase();

        switch (ext) {
            case 'json':
                return 'json';
            case 'yaml':
            case 'yml':
                return 'yaml';
            case 'xml':
                return 'xml';
            case 'csv':
                return 'csv';
            case 'raml':
                return 'raml';
            default:
                // Try to detect from content if provided
                if (content) {
                    const trimmed = content.trim();
                    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                        return 'json';
                    }
                    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) {
                        return 'xml';
                    }
                    if (trimmed.startsWith('#%RAML')) {
                        return 'raml';
                    }
                    // CSV heuristic: at least two non-empty lines with consistent comma-separated fields
                    const lines = trimmed
                        .split(/\r?\n/)
                        .map((l) => l.trim())
                        .filter((l) => l.length > 0);
                    if (lines.length >= 2 && lines[0].includes(',') && lines[1].includes(',')) {
                        const c0 = lines[0].split(',').length;
                        const c1 = lines[1].split(',').length;
                        if (c0 > 1 && c0 === c1 && !/:\s*/.test(lines[0])) {
                            return 'csv';
                        }
                    }
                    // YAML heuristic: key-value pairs like "name: value"
                    // (kept after JSON/XML/RAML/CSV checks to reduce false positives)
                    const firstNonEmpty = lines[0] ?? '';
                    if (/^[-\s]*[A-Za-z0-9_"'.][A-Za-z0-9_"'.-]*\s*:\s*\S+/.test(firstNonEmpty)) {
                        return 'yaml';
                    }
                }
                return null;
        }
    }
}
