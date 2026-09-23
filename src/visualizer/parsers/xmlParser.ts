import { XMLParser } from 'fast-xml-parser';
import { Parser } from '../types';

export class XMLParserImpl implements Parser {
    parse(content: string): any {
        try {
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '@_',
                textNodeName: '#text',
                parseAttributeValue: false,
                parseTagValue: false,
                trimValues: true,
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
