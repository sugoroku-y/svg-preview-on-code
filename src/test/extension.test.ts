import * as assert from 'assert';
import * as vscode from 'vscode';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { svgPreviewDecorations } from '../extension';
import { resolve } from 'path';

class MockTextDocument implements vscode.TextDocument {
  uri!: vscode.Uri;
  fileName!: string;
  isUntitled!: boolean;
  languageId!: string;
  version!: number;
  isDirty!: boolean;
  isClosed!: boolean;
  save(): Thenable<boolean> {
    throw new Error('Method not implemented.');
  }
  eol!: vscode.EndOfLine;
  private lines: string[];
  get lineCount(): number {
    return this.lines.length;
  }
  lineAt(line: number): vscode.TextLine;
  lineAt(position: vscode.Position): vscode.TextLine;
  lineAt(position: vscode.Position | number): vscode.TextLine {
    const lineNumber: number =
      typeof position === 'number' ? position : position.line;
    const line = this.lines[lineNumber] + '\n';
    const range = new vscode.Range(
      new vscode.Position(lineNumber, 0),
      new vscode.Position(lineNumber, line.length + 1),
    );
    return new (class implements vscode.TextLine {
      get lineNumber() {
        return lineNumber;
      }
      get text(): string {
        return line;
      }
      get range(): vscode.Range {
        return range;
      }
      rangeIncludingLineBreak!: vscode.Range;
      firstNonWhitespaceCharacterIndex!: number;
      isEmptyOrWhitespace!: boolean;
    })();
  }
  offsetAt(position: vscode.Position): number {
    throw new Error('Method not implemented.');
  }
  positionAt(offset: number): vscode.Position {
    let line = 0;
    let bol = 0,
      eol = this.lines[0].length + 1;
    do {
      if (offset <= eol) {
        break;
      }
      ++line;
      bol = eol;
      eol += this.lines[line].length + 1;
    } while (true);
    return new vscode.Position(line, offset - bol);
  }
  getText(range?: vscode.Range): string {
    return this.lines.join('\n');
  }
  getWordRangeAtPosition(
    position: vscode.Position,
    regex?: RegExp,
  ): vscode.Range | undefined {
    throw new Error('Method not implemented.');
  }
  validateRange(range: vscode.Range): vscode.Range {
    throw new Error('Method not implemented.');
  }
  validatePosition(position: vscode.Position): vscode.Position {
    throw new Error('Method not implemented.');
  }

  constructor(text: string) {
    this.lines = text.split('\n');
  }
}

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Sample test', async () => {
    const text = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <path d="m4 4l17 17a4 4 0 0 1 8 8l17 17m-32 0l10-10-5-5 22-22-5-5" />
      </svg>
    `;
    const document = new MockTextDocument(text);

    const decorations = [
      ...svgPreviewDecorations(document, {
        urlCache: new WeakMap<vscode.TextDocument, Map<string, string>>(),
        preset: { $$color: 'black' },
        size: 50,
      }),
    ];
    assert.equal(decorations.length, 1);
    assert.ok(decorations[0].hoverMessage instanceof vscode.MarkdownString);
    assert.equal(
      (decorations[0].hoverMessage as vscode.MarkdownString).value,
      `\n![](data:image/svg+xml;base64,${btoa(
        text
          .replace(/(?<=>)\s+|\s+(?=<)/g, '')
          .replace(/(?<=<svg)(?= )/, ' color="black"')
          .replace(
            /(?<=<svg(?: \w+(?:-\w+)*="[^"]*")*)(?=>)/,
            ' width="50" height="50"',
          )
          .replace(/\s+(?=\/>)/g, ''),
      )})\n\n[$(gear)](command:workbench.action.openSettings?["@ext:sugoroku-y.svg-preview-on-code"])\n`,
    );
    assert.equal(decorations[0].range.start.line, 1);
    assert.equal(decorations[0].range.start.character, 6);
    assert.equal(decorations[0].range.end.line, 3);
    assert.equal(decorations[0].range.end.character, 12);
  });

  test('Changelog', async () => {
    const { version } = require('../../package.json');
    const stream = createInterface(
      createReadStream(resolve(__dirname, '..', '..', 'CHANGELOG.md')),
    );
    let count = 0;
    let currentVersion = '';
    for await (const line of stream) {
      const match = /^[ \t]*- `(\d+\.\d+\.\d+)`\s*$/.exec(line);
      if (match) {
        currentVersion = match[1];
        continue;
      }
      if (line.trim() && currentVersion === version) {
        ++count;
      }
    }
    assert.ok(count, `CHANGELOG.mdに${version}の記載がありません。`);
  });
});
