import type { IParser, ParsedDocument, ParserOptions } from '../types/index.js';
import { ParseError } from '../utils/errors.js';
import { dynamicImport } from '../utils/dynamicImport.js';

/**
 * Parses CSV and TSV files using the `papaparse` package.
 * Returns both raw text and structured row data.
 *
 * @example
 * ```typescript
 * const parser = new CSVParser();
 * const doc = await parser.parse(buffer, 'data.csv');
 * console.log(doc.metadata.rows); // parsed rows as objects
 * ```
 */
export class CSVParser implements IParser {
  readonly supportedTypes = [
    'text/csv',
    'text/tab-separated-values',
    'application/csv',
  ];

  canParse(mimeType: string): boolean {
    return this.supportedTypes.includes(mimeType);
  }

  async parse(buffer: Buffer, fileName: string, options?: ParserOptions): Promise<ParsedDocument> {
    const Papa = await dynamicImport('papaparse');
    if (!Papa) {
      throw new ParseError(
        'papaparse is required to parse CSV files. Install it: npm install papaparse',
        { fileName }
      );
    }

    try {
      const encoding = options?.encoding || 'utf-8';
      const text = buffer.toString(encoding);
      const isTSV = fileName.endsWith('.tsv') || text.includes('\t');

      const parseFn = Papa.default || Papa;
      const result = parseFn.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: isTSV ? '\t' : undefined,
        dynamicTyping: true,
      });

      return {
        fileName,
        mimeType: isTSV ? 'text/tab-separated-values' : 'text/csv',
        content: text,
        metadata: {
          rows: result.data,
          headers: result.meta.fields || [],
          rowCount: result.data.length,
          delimiter: result.meta.delimiter,
          errors: result.errors.length > 0 ? result.errors : undefined,
        },
        rawBuffer: buffer,
      };
    } catch (err) {
      throw new ParseError(
        `Failed to parse CSV "${fileName}": ${err instanceof Error ? err.message : String(err)}`,
        { fileName }
      );
    }
  }
}
