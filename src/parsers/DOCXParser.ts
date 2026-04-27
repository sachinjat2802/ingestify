import type { IParser, ParsedDocument, ParserOptions } from '../types/index.js';
import { ParseError } from '../utils/errors.js';
import { dynamicImport } from '../utils/dynamicImport.js';

/**
 * Parses DOCX (Word) files using the `mammoth` package.
 * Extracts text and optionally HTML.
 *
 * @example
 * ```typescript
 * const parser = new DOCXParser();
 * const doc = await parser.parse(buffer, 'proposal.docx');
 * ```
 */
export class DOCXParser implements IParser {
  readonly supportedTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  canParse(mimeType: string): boolean {
    return this.supportedTypes.includes(mimeType);
  }

  async parse(buffer: Buffer, fileName: string, _options?: ParserOptions): Promise<ParsedDocument> {
    const mammoth = await dynamicImport('mammoth');
    if (!mammoth) {
      throw new ParseError(
        'mammoth is required to parse DOCX files. Install it: npm install mammoth',
        { fileName }
      );
    }

    try {
      const [textResult, htmlResult] = await Promise.all([
        mammoth.extractRawText({ buffer }),
        mammoth.convertToHtml({ buffer }),
      ]);

      const warnings = [
        ...textResult.messages.map((m: { message: string }) => m.message),
        ...htmlResult.messages.map((m: { message: string }) => m.message),
      ];

      return {
        fileName,
        mimeType: this.supportedTypes[0],
        content: textResult.value,
        metadata: {
          html: htmlResult.value,
          warnings,
        },
        rawBuffer: buffer,
      };
    } catch (err) {
      throw new ParseError(
        `Failed to parse DOCX "${fileName}": ${err instanceof Error ? err.message : String(err)}`,
        { fileName }
      );
    }
  }
}
