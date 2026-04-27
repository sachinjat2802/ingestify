import type { IParser, ParserOptions, ParsedDocument } from '../types/index.js';
import { detectMimeType } from '../utils/fileType.js';

/**
 * Singleton parser registry.
 * Follows the Registry pattern — register parsers once, look up by MIME type.
 * Avoids creating new parser instances on every pipeline run.
 *
 * @example
 * ```typescript
 * const registry = ParserRegistry.getInstance();
 *
 * // Register parsers (done once at app startup)
 * registry.register(new PDFParser());
 * registry.register(new DOCXParser());
 * registry.register(new CSVParser());
 *
 * // Look up by MIME type (fast O(1) lookup)
 * const parser = registry.getParser('application/pdf');
 *
 * // Or use the registry itself as a parser
 * const doc = await registry.parse(buffer, 'report.pdf');
 * ```
 */
export class ParserRegistry implements IParser {
  private static instance: ParserRegistry;
  private parsers: Map<string, IParser> = new Map();
  private parserList: IParser[] = [];

  readonly supportedTypes = ['*/*'];

  private constructor() {}

  /** Get the singleton instance. */
  static getInstance(): ParserRegistry {
    if (!ParserRegistry.instance) {
      ParserRegistry.instance = new ParserRegistry();
    }
    return ParserRegistry.instance;
  }

  /** Create a new (non-singleton) registry. Useful for testing. */
  static create(): ParserRegistry {
    const registry = new ParserRegistry();
    return registry;
  }

  /** Register a parser. Its supported MIME types are indexed for fast lookup. */
  register(parser: IParser): this {
    this.parserList.push(parser);
    for (const mimeType of parser.supportedTypes) {
      this.parsers.set(mimeType, parser);
    }
    return this;
  }

  /** Get a parser for the given MIME type. Returns undefined if no parser is found. */
  getParser(mimeType: string): IParser | undefined {
    // Exact match first
    const exact = this.parsers.get(mimeType);
    if (exact) return exact;

    // Fallback: ask each parser if it can handle this type
    return this.parserList.find(p => p.canParse(mimeType));
  }

  /** Check if any registered parser can handle this MIME type. */
  canParse(mimeType: string): boolean {
    return this.getParser(mimeType) !== undefined;
  }

  /** Parse using the appropriate registered parser. */
  async parse(buffer: Buffer, fileName: string, options?: ParserOptions): Promise<ParsedDocument> {
    const mimeType = detectMimeType(fileName);
    const parser = this.getParser(mimeType);

    if (!parser) {
      throw new Error(`No parser registered for MIME type "${mimeType}" (file: ${fileName})`);
    }

    return parser.parse(buffer, fileName, options);
  }

  /** Get all registered parsers. */
  getAll(): IParser[] {
    return [...this.parserList];
  }

  /** Get all supported MIME types. */
  getSupportedTypes(): string[] {
    return Array.from(this.parsers.keys());
  }

  /** Clear all registered parsers. */
  clear(): void {
    this.parsers.clear();
    this.parserList = [];
  }

  /** Get the count of registered parsers. */
  get size(): number {
    return this.parserList.length;
  }
}
