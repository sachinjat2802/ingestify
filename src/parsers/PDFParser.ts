import type { IParser, ParsedDocument, ParserOptions } from '../types/index.js';
import { ParseError } from '../utils/errors.js';
import { dynamicImport } from '../utils/dynamicImport.js';

/**
 * Parses PDF files using the `pdf-parse` package.
 * Requires `pdf-parse` as a peer dependency.
 *
 * @example
 * ```typescript
 * const parser = new PDFParser();
 * const doc = await parser.parse(buffer, 'report.pdf');
 * console.log(doc.content); // extracted text
 * console.log(doc.metadata.pages); // page count
 * ```
 */
export class PDFParser implements IParser {
  readonly supportedTypes = ['application/pdf'];

  canParse(mimeType: string): boolean {
    return this.supportedTypes.includes(mimeType);
  }

  async parse(buffer: Buffer, fileName: string, _options?: ParserOptions): Promise<ParsedDocument> {
    const pdfParse = await dynamicImport('pdf-parse');
    if (!pdfParse) {
      throw new ParseError(
        'pdf-parse is required to parse PDF files. Install it: npm install pdf-parse',
        { fileName }
      );
    }

    try {
      const parseFn = pdfParse.default || pdfParse;
      const pdf = await parseFn(buffer);

      return {
        fileName,
        mimeType: 'application/pdf',
        content: pdf.text || '',
        metadata: {
          pages: pdf.numpages,
          info: pdf.info,
          version: pdf.version,
        },
        rawBuffer: buffer,
      };
    } catch (err) {
      throw new ParseError(
        `Failed to parse PDF "${fileName}": ${err instanceof Error ? err.message : String(err)}`,
        { fileName }
      );
    }
  }
}
