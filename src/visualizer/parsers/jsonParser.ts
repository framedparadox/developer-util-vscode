import { Parser } from '../types';

export class JSONParser implements Parser {
    parse(content: string): any {
        try {
            return JSON.parse(content);
        } catch (error) {
            throw new Error(`JSON parsing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
