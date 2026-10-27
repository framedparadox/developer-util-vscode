import { ConversionFormat, OutputFormat, ConversionResult, DataConverter as IDataConverter } from '../visualizer/types';
import { JSONParser, YAMLParser, XMLParserImpl, CSVParser, RAMLParser } from '../visualizer/parsers';
import { detectDataFormat } from '../visualizer/format';
import * as yaml from 'js-yaml';

export const MAX_CONVERSION_INPUT_BYTES = 10 * 1024 * 1024;

/**
 * DataConverter - Converts between different data formats
 * Converts supported input formats to JSON, YAML, or XML.
 */
export class DataConverter implements IDataConverter {
    /**
     * Convert data from one format to another
     * @param content Source data as string
     * @param sourceFormat Source format (json, yaml, xml, csv, raml)
     * @param targetFormat Target format (JSON, YAML, or XML)
     * @returns ConversionResult with output or error
     */
    convert(content: string, sourceFormat: ConversionFormat, targetFormat: OutputFormat): ConversionResult {
        const startTime = Date.now();
        const sourceSize = typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : 0;

        try {
            if (typeof content !== 'string') {
                throw new Error('Conversion input must be text.');
            }
            if (sourceSize > MAX_CONVERSION_INPUT_BYTES) {
                throw new Error('Conversion input exceeds the 10 MB limit.');
            }

            // Step 1: Parse source format to JSON object
            const parsedData = this.parseSourceFormat(content, sourceFormat);

            // Step 2: Convert to target format
            const output = this.formatOutput(parsedData, targetFormat);

            const conversionTime = Date.now() - startTime;
            const outputSize = Buffer.byteLength(output, 'utf8');

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
    private normalizeData(data: any, ancestors: WeakSet<object> = new WeakSet()): any {
        if (data === null || data === undefined) {
            return data;
        }

        // Handle arrays
        if (Array.isArray(data)) {
            if (ancestors.has(data)) {
                throw new Error('Circular references are not supported.');
            }
            ancestors.add(data);
            const normalized = data.map((item) => this.normalizeData(item, ancestors));
            ancestors.delete(data);
            return normalized;
        }

        // Handle objects
        if (typeof data === 'object') {
            if (ancestors.has(data)) {
                throw new Error('Circular references are not supported.');
            }
            ancestors.add(data);
            const normalized: any = {};

            for (const key of Object.keys(data)) {
                // Guard against prototype-polluting keys (e.g. a "__proto__"
                // key produced by js-yaml). A plain `normalized[key] = value`
                // assignment with key === '__proto__' writes to the object's
                // prototype slot instead of creating an own property, which
                // silently drops the data from the converted output.
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                    Object.defineProperty(normalized, key, {
                        value: this.normalizeData(data[key], ancestors),
                        enumerable: true,
                        writable: true,
                        configurable: true,
                    });
                    continue;
                }

                const value = data[key];

                if (value === null || value === undefined) {
                    normalized[key] = value;
                } else {
                    // Preserve all values, including empty objects/arrays, so
                    // conversions stay faithful to the source document.
                    normalized[key] = this.normalizeData(value, ancestors);
                }
            }

            ancestors.delete(data);
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
     * Detect format from file extension or, failing that, content.
     * Delegates to the shared {@link detectDataFormat} heuristic so format
     * detection stays consistent with the visualizer.
     */
    static detectFormat(fileName: string, content?: string): ConversionFormat | null {
        return detectDataFormat(content ?? '', fileName);
    }
}
