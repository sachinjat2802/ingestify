import type { IParser } from '../types/index.js';
import { detectMimeType } from '../utils/fileType.js';
import { PDFParser } from './PDFParser.js';
import { DOCXParser } from './DOCXParser.js';
import { CSVParser } from './CSVParser.js';
import { ExcelParser } from './ExcelParser.js';
import { JSONParser } from './JSONParser.js';
import { TextParser } from './TextParser.js';

export { PDFParser } from './PDFParser.js';
export { DOCXParser } from './DOCXParser.js';
export { CSVParser } from './CSVParser.js';
export { ExcelParser } from './ExcelParser.js';
export { JSONParser } from './JSONParser.js';
export { TextParser } from './TextParser.js';
export { ParserRegistry } from './ParserRegistry.js';

/**
 * Auto-detecting parser that delegates to the right parser based on file type.
 * Includes all built-in parsers by default.
 *
 * @example
 * ```typescript
 * const parser = new AutoParser();
 * // Automatically picks PDFParser for .pdf, CSVParser for .csv, etc.
 * const doc = await parser.parse(buffer, 'report.pdf');
 * ```
 */
export class AutoParser implements IParser {
  readonly supportedTypes = ['*/*'];
  private parsers: IParser[];

  constructor(extraParsers?: IParser[]) {
    this.parsers = [
      new PDFParser(),
      new DOCXParser(),
      new CSVParser(),
      new ExcelParser(),
      new JSONParser(),
      new TextParser(), // TextParser last — it's the fallback
      ...(extraParsers || []),
    ];
  }

  canParse(_mimeType: string): boolean {
    return true; // AutoParser accepts everything and delegates
  }

  async parse(buffer: Buffer, fileName: string, options?: import('../types/index.js').ParserOptions) {
    const mimeType = detectMimeType(fileName);
    const parser = this.parsers.find(p => p.canParse(mimeType));

    if (!parser) {
      // Fallback to TextParser
      return new TextParser().parse(buffer, fileName, options);
    }

    return parser.parse(buffer, fileName, options);
  }
}
