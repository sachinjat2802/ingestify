import type { IParser, ParsedDocument, ParserOptions } from '../types/index.js';

/**
 * Parses plain text and markdown files.
 * This is the fallback parser for any text-based content.
 *
 * @example
 * ```typescript
 * const parser = new TextParser();
 * const doc = await parser.parse(buffer, 'readme.md');
 * ```
 */
export class TextParser implements IParser {
  readonly supportedTypes = [
    'text/plain',
    'text/markdown',
    'text/html',
    'text/xml',
    'application/xml',
    'text/yaml',
    'application/x-yaml',
  ];

  canParse(mimeType: string): boolean {
    return (
      this.supportedTypes.includes(mimeType) ||
      mimeType.startsWith('text/')
    );
  }

  async parse(buffer: Buffer, fileName: string, options?: ParserOptions): Promise<ParsedDocument> {
    const encoding = options?.encoding || 'utf-8';
    const content = buffer.toString(encoding);

    const lines = content.split('\n');
    const words = content.split(/\s+/).filter(Boolean);

    return {
      fileName,
      mimeType: 'text/plain',
      content,
      metadata: {
        lineCount: lines.length,
        wordCount: words.length,
        encoding,
      },
      rawBuffer: buffer,
    };
  }
}
