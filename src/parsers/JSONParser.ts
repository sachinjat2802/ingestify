import type { IParser, ParsedDocument, ParserOptions } from '../types/index.js';
import { ParseError } from '../utils/errors.js';

/**
 * Parses JSON and JSONL files.
 * Stringifies the parsed content into readable text for chunking.
 *
 * @example
 * ```typescript
 * const parser = new JSONParser();
 * const doc = await parser.parse(buffer, 'data.json');
 * console.log(doc.metadata.parsed); // the actual parsed JS object
 * ```
 */
export class JSONParser implements IParser {
  readonly supportedTypes = [
    'application/json',
    'application/x-ndjson',
    'application/jsonl',
  ];

  canParse(mimeType: string): boolean {
    return this.supportedTypes.includes(mimeType);
  }

  async parse(buffer: Buffer, fileName: string, options?: ParserOptions): Promise<ParsedDocument> {
    const encoding = options?.encoding || 'utf-8';
    const text = buffer.toString(encoding);
    const isJsonl = fileName.endsWith('.jsonl') || fileName.endsWith('.ndjson');

    try {
      let parsed: unknown;

      if (isJsonl) {
        // Parse JSONL: each line is a separate JSON object
        const lines = text.split('\n').filter(line => line.trim());
        parsed = lines.map((line, i) => {
          try {
            return JSON.parse(line);
          } catch {
            throw new Error(`Invalid JSON at line ${i + 1}`);
          }
        });
      } else {
        parsed = JSON.parse(text);
      }

      // Create readable text representation
      const content = typeof parsed === 'string'
        ? parsed
        : JSON.stringify(parsed, null, 2);

      return {
        fileName,
        mimeType: isJsonl ? 'application/x-ndjson' : 'application/json',
        content,
        metadata: {
          parsed,
          isArray: Array.isArray(parsed),
          itemCount: Array.isArray(parsed) ? parsed.length : undefined,
          isJsonl,
        },
        rawBuffer: buffer,
      };
    } catch (err) {
      throw new ParseError(
        `Failed to parse JSON "${fileName}": ${err instanceof Error ? err.message : String(err)}`,
        { fileName }
      );
    }
  }
}
