import { XMLParser } from 'fast-xml-parser';
import { Parser } from '../types';

export class XMLParserImpl implements Parser {
    parse(content: string): any {
        try {
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '@_',
                textNodeName: '#text',
                parseAttributeValue: true,
                parseTagValue: true,
                trimValues: true,
                isArray: (name, jpath, isLeafNode, isAttribute) => {
                    // Force arrays for repeated elements
                    // This ensures consistent structure
                    return false; // Let parser decide naturally
                },
                removeNSPrefix: true, // Remove namespace prefixes
                allowBooleanAttributes: true,
            });

            const result = parser.parse(content);

            return result;
        } catch (error) {
            throw new Error(`XML parsing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
