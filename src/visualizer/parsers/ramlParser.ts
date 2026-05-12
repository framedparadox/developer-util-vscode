import * as yaml from 'js-yaml';
import { Parser } from '../types';

export class RAMLParser implements Parser {
    parse(content: string): any {
        try {
            // RAML is YAML-based, so we can use YAML parser
            // RAML 1.0 structure will be converted to JSON object
            const ramlData = yaml.load(content);

            if (!ramlData || typeof ramlData !== 'object') {
                throw new Error('Invalid RAML structure');
            }

            return ramlData;
        } catch (error) {
            throw new Error(`RAML parsing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
