import * as assert from 'assert';
import * as vscode from 'vscode';
import { svgPreviewDecorations } from '../extension';

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

  test('Sample test', () => {
    const document = new MockTextDocument(`
		<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2">
			<path d="m0 0l100 100" />
		</svg>
	`);

    const decorations = [
      ...svgPreviewDecorations(document, {
        size: 50,
        currentColor: 'white',
        currentMode: 'dark',
        preset: [],
      }),
    ];
    assert.equal(decorations.length, 1);
    assert.ok(decorations[0].hoverMessage instanceof vscode.MarkdownString);
    assert.match(
      (decorations[0].hoverMessage as vscode.MarkdownString).value,
      /^!\[\]\(data:image\/svg\+xml;base64,[0-9A-Za-z+/]+=*\)$/,
    );
    assert.equal(decorations[0].range.start.line, 1);
    assert.equal(decorations[0].range.start.character, 2);
    assert.equal(decorations[0].range.end.line, 3);
    assert.equal(decorations[0].range.end.character, 8);
  });
});
