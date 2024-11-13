import * as assert from 'assert';
import * as vscode from 'vscode';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { SvgPreviewOnCode } from '../extension';
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
      if (offset < eol) {
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

function getPropertyDescriptor(
  target: object,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  for (let o = target; o; o = Object.getPrototypeOf(o)) {
    const desc = Object.getOwnPropertyDescriptor(o, key);
    if (desc) {
      return desc;
    }
  }
  return undefined;
}

function mock<T extends object, K extends keyof T>(
  target: T,
  key: K,
  replace: T[K],
): { [Symbol.dispose](): void } {
  const desc = getPropertyDescriptor(target, key);
  if (desc?.get && !desc.set) {
    const save = desc.get;
    Object.defineProperty(target, key, { get: () => replace });
    return {
      [Symbol.dispose]() {
        Object.defineProperty(target, key, { get: save });
      },
    };
  }
  const save = target[key];
  target[key] = replace;
  return {
    [Symbol.dispose]() {
      target[key] = save;
    },
  };
}

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  const text = `
<svg xmlns="http://www.w3.org/2000/svg" width="100">
  <path d="m4 4l17 17a4 4 0 0 1 8 8l17 17m-32 0l10-10-5-5 22-22-5-5" />
</svg>
`;
  function decoration(
    spec: {
      currentColor?: string;
      colorThemeKind?: vscode.ColorThemeKind;
      preset?: object;
      width?: number;
      height?: number;
    },
    expect: {
      currentColor?: string;
      preset?: object;
      width?: number;
      height?: number;
    } = {},
  ) {
    using _1 = spec.currentColor
      ? mock(
          vscode.workspace,
          'getConfiguration',
          () =>
            ({
              currentColor: spec.currentColor,
              preset: spec.preset,
            }) as unknown as vscode.WorkspaceConfiguration,
        )
      : undefined;
    using _2 = mock(vscode.window, 'activeColorTheme', {
      kind: spec.colorThemeKind ?? vscode.ColorThemeKind.Light,
    });
    const document = new MockTextDocument(
      spec.width || spec.height
        ? text.replace(
            /(?<=<svg(?: \w+(?:-\w+)*="[^"]*")*)(?=>)/,
            `${spec.width ? ` width="${spec.width}"` : ''}${spec.height ? ` height="${spec.height}"` : ''}`,
          )
        : text,
    );
    const [decoration, ...rest] = new SvgPreviewOnCode().svgPreviewDecorations(
      document,
    );
    assert.equal(rest.length, 0);
    assert.ok(decoration);
    assert.ok(decoration.hoverMessage instanceof vscode.MarkdownString);
    assert.match(
      (decoration.hoverMessage as vscode.MarkdownString).value,
      /^\n!\[\]\(data:image\/svg\+xml;base64,([A-Za-z0-9+/]+=*)\)\n\n\[\$\(gear\)\]\(command:workbench.action.openSettings\?\["@ext:sugoroku-y.svg-preview-on-code"\]\)\n$/,
    );
    const svg = atob(RegExp.$1);
    assert.equal(
      svg,
      `<svg color="${expect.currentColor ?? 'black'}"${
        expect.preset
          ? Object.entries(expect.preset)
              .map(([name, value]) => ` ${name}="${value}"`)
              .join('')
          : ''
      } xmlns="http://www.w3.org/2000/svg" width="${expect.width ?? 50}" height="${expect.height ?? 50}"><path d="m4 4l17 17a4 4 0 0 1 8 8l17 17m-32 0l10-10-5-5 22-22-5-5"/></svg>`,
    );
    assert.equal(decoration.range.start.line, 1);
    assert.equal(decoration.range.start.character, 0);
    assert.equal(decoration.range.end.line, 3);
    assert.equal(decoration.range.end.character, 6);
  }
  test('currentColor: red', async () => {
    decoration({ currentColor: 'red' }, { currentColor: 'red' });
  });
  test('currentColor: blue', async () => {
    decoration({ currentColor: 'blue' }, { currentColor: 'blue' });
  });
  test('dark mode', async () => {
    decoration(
      { colorThemeKind: vscode.ColorThemeKind.Dark },
      { currentColor: 'white' },
    );
  });
  test('light mode', async () => {
    decoration({ colorThemeKind: vscode.ColorThemeKind.Light });
  });
  test('high contrast dark mode', async () => {
    decoration(
      { colorThemeKind: vscode.ColorThemeKind.HighContrast },
      { currentColor: 'white' },
    );
  });
  test('high contrast light mode', async () => {
    decoration({ colorThemeKind: vscode.ColorThemeKind.HighContrastLight });
  });
  test('width 100', async () => {
    decoration({ width: 100 }, {});
  });
  test('height 100', async () => {
    decoration({ height: 100 }, {});
  });
  test('100x25', async () => {
    decoration({ width: 100, height: 25 }, { height: 12.5 });
  });
  test('25x100', async () => {
    decoration({ width: 25, height: 100 }, { width: 12.5 });
  });
  test('preset: {stroke:currentColor}', async () => {
    decoration(
      { preset: { stroke: 'currentColor' } },
      { preset: { stroke: 'currentColor' } },
    );
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
