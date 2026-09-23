import { Parser } from '../types';
import { loadYamlDocument } from '../yamlLoad';

export class YAMLParser implements Parser {
    parse(content: string): any {
        try {
            return loadYamlDocument(content);
        } catch (error) {
            throw new Error(`YAML parsing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
