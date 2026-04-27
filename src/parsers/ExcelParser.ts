import type { IParser, ParsedDocument, ParserOptions } from '../types/index.js';
import { ParseError } from '../utils/errors.js';
import { dynamicImport } from '../utils/dynamicImport.js';

/**
 * Parses Excel (.xlsx, .xls) files using the `xlsx` package.
 * Extracts text from all sheets plus structured row data per sheet.
 *
 * @example
 * ```typescript
 * const parser = new ExcelParser();
 * const doc = await parser.parse(buffer, 'data.xlsx');
 * console.log(doc.metadata.sheets); // { Sheet1: [...rows], Sheet2: [...rows] }
 * ```
 */
export class ExcelParser implements IParser {
  readonly supportedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];

  canParse(mimeType: string): boolean {
    return this.supportedTypes.includes(mimeType);
  }

  async parse(buffer: Buffer, fileName: string, _options?: ParserOptions): Promise<ParsedDocument> {
    const XLSX = await dynamicImport('xlsx');
    if (!XLSX) {
      throw new ParseError(
        'xlsx is required to parse Excel files. Install it: npm install xlsx',
        { fileName }
      );
    }

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets: Record<string, unknown[]> = {};
      const textParts: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);
        sheets[sheetName] = rows;

        // Also extract as text for content field
        const text = XLSX.utils.sheet_to_csv(sheet);
        textParts.push(`--- ${sheetName} ---\n${text}`);
      }

      return {
        fileName,
        mimeType: this.supportedTypes[0],
        content: textParts.join('\n\n'),
        metadata: {
          sheets,
          sheetNames: workbook.SheetNames,
          sheetCount: workbook.SheetNames.length,
        },
        rawBuffer: buffer,
      };
    } catch (err) {
      throw new ParseError(
        `Failed to parse Excel "${fileName}": ${err instanceof Error ? err.message : String(err)}`,
        { fileName }
      );
    }
  }
}
