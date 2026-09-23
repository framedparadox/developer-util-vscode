import { Parser } from '../types';
import { loadYamlDocument } from '../yamlLoad';

export class RAMLParser implements Parser {
    parse(content: string): any {
        try {
            if (!content.trimStart().startsWith('#%RAML')) {
                throw new Error('RAML documents must start with a #%RAML version header');
            }

            const ramlData = loadYamlDocument(content);
            if (!ramlData || typeof ramlData !== 'object') {
                throw new Error('Invalid RAML structure');
            }

            return ramlData;
        } catch (error) {
            throw new Error(`RAML parsing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
