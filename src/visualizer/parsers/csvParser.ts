import { parse, ParseResult } from 'papaparse';
import { Parser } from '../types';

export class CSVParser implements Parser {
    parse(content: string): any {
        try {
            const result: ParseResult<any> = parse(content, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                transformHeader: (header: string) => header.trim(), // Remove whitespace from headers
            });

            if (result.errors && result.errors.length > 0) {
                const criticalErrors = result.errors.filter((e) => e.type === 'Quotes' || e.type === 'FieldMismatch');
                if (criticalErrors.length > 0) {
                    throw new Error(`CSV parsing errors: ${criticalErrors.map((e) => e.message).join(', ')}`);
                }
            }

            // Return just the data array for cleaner output
            // Each row is an object with column headers as keys
            return result.data;
        } catch (error) {
            throw new Error(`CSV parsing failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
