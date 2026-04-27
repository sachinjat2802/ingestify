import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextParser } from '../src/parsers/TextParser';
import { JSONParser } from '../src/parsers/JSONParser';

// ─── TextParser ──────────────────────────────────────────────────────────────

describe('TextParser', () => {
  const parser = new TextParser();

  it('should parse plain text files', async () => {
    const buffer = Buffer.from('Hello, World!\nThis is a test.');
    const doc = await parser.parse(buffer, 'test.txt');

    expect(doc.fileName).toBe('test.txt');
    expect(doc.content).toBe('Hello, World!\nThis is a test.');
    expect(doc.metadata.lineCount).toBe(2);
    expect(doc.metadata.wordCount).toBe(6);
  });

  it('should handle empty files', async () => {
    const buffer = Buffer.from('');
    const doc = await parser.parse(buffer, 'empty.txt');

    expect(doc.content).toBe('');
    expect(doc.metadata.lineCount).toBe(1);
    expect(doc.metadata.wordCount).toBe(0);
  });

  it('should support custom encoding', async () => {
    const buffer = Buffer.from('UTF-8 content: ñ é ü', 'utf-8');
    const doc = await parser.parse(buffer, 'unicode.txt', { encoding: 'utf-8' });

    expect(doc.content).toContain('ñ');
    expect(doc.content).toContain('é');
  });

  it('should report canParse for text MIME types', () => {
    expect(parser.canParse('text/plain')).toBe(true);
    expect(parser.canParse('text/markdown')).toBe(true);
    expect(parser.canParse('text/html')).toBe(true);
    expect(parser.canParse('text/csv')).toBe(true); // text/* matches
    expect(parser.canParse('application/pdf')).toBe(false);
  });

  it('should count words correctly for multiline content', async () => {
    const buffer = Buffer.from('Word1 Word2\nWord3\n\nWord4 Word5 Word6');
    const doc = await parser.parse(buffer, 'words.txt');

    expect(doc.metadata.wordCount).toBe(6);
  });
});

// ─── JSONParser ──────────────────────────────────────────────────────────────

describe('JSONParser', () => {
  const parser = new JSONParser();

  it('should parse JSON objects', async () => {
    const data = { name: 'test', value: 42 };
    const buffer = Buffer.from(JSON.stringify(data));
    const doc = await parser.parse(buffer, 'data.json');

    expect(doc.fileName).toBe('data.json');
    expect(doc.metadata.parsed).toEqual(data);
    expect(doc.metadata.isArray).toBe(false);
  });

  it('should parse JSON arrays', async () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const buffer = Buffer.from(JSON.stringify(data));
    const doc = await parser.parse(buffer, 'array.json');

    expect(doc.metadata.parsed).toEqual(data);
    expect(doc.metadata.isArray).toBe(true);
    expect(doc.metadata.itemCount).toBe(3);
  });

  it('should parse JSONL files', async () => {
    const jsonl = '{"id":1}\n{"id":2}\n{"id":3}';
    const buffer = Buffer.from(jsonl);
    const doc = await parser.parse(buffer, 'data.jsonl');

    expect(doc.metadata.isJsonl).toBe(true);
    expect(doc.metadata.isArray).toBe(true);
    expect(doc.metadata.itemCount).toBe(3);
  });

  it('should throw ParseError on invalid JSON', async () => {
    const buffer = Buffer.from('{ invalid json }');

    await expect(parser.parse(buffer, 'bad.json')).rejects.toThrow('Failed to parse JSON');
  });

  it('should throw on invalid JSONL line', async () => {
    const jsonl = '{"id":1}\nnot json\n{"id":3}';
    const buffer = Buffer.from(jsonl);

    await expect(parser.parse(buffer, 'bad.jsonl')).rejects.toThrow('line 2');
  });

  it('should report canParse correctly', () => {
    expect(parser.canParse('application/json')).toBe(true);
    expect(parser.canParse('application/x-ndjson')).toBe(true);
    expect(parser.canParse('text/plain')).toBe(false);
  });
});
