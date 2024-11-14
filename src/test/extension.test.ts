import * as assert from 'assert';
import * as vscode from 'vscode';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { SvgPreviewOnCode } from '../extension';
import { resolve } from 'path';
import { XMLParser } from 'fast-xml-parser';

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

const saved = Symbol();

function mock<T extends object, K extends keyof T>(
  target: T,
  key: K,
  replace: T[K],
): { [Symbol.dispose](): void } {
  const desc = getPropertyDescriptor(target, key);
  if (!desc) {
    throw new Error(`unknown property: '${String(key)}'`);
  }
  if ((desc.get && !desc.set) || (!desc.get && !desc.set && !desc.writable)) {
    Object.defineProperty(target, key, { get: () => replace });
    return {
      [Symbol.dispose]() {
        Object.defineProperty(target, key, desc);
      },
    };
  }
  const save = target[key];
  (target as { [saved]: T[K] })[saved] = save;
  target[key] = replace;
  return {
    [Symbol.dispose]() {
      target[key] = save;
    },
  };
}

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg"></svg>`;
  const dataScheme = `data:image/png;base64,AAAA`;
  function decoration(
    spec: {
      text: string;
      language?: string;
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
      previewTitle?: string;
      contentType?: string;
      settingsCaption?: string;
    } = {},
  ) {
    using _0 = mock(vscode.env, 'language', spec.language ?? 'none');
    using _1 = mock(
      vscode.workspace,
      'getConfiguration',
      () =>
        ({
          currentColor: spec.currentColor,
          preset: spec.preset,
        }) as unknown as vscode.WorkspaceConfiguration,
    );
    using _2 = mock(vscode.window, 'activeColorTheme', {
      kind: spec.colorThemeKind ?? vscode.ColorThemeKind.Light,
    });
    const text =
      spec.width || spec.height
        ? spec.text.replace(
            /(?<=<svg)(?=\s)/,
            `${spec.width ? ` width="${spec.width}"` : ''}${spec.height ? ` height="${spec.height}"` : ''}`,
          )
        : spec.text;
    const document = new MockTextDocument(text);
    const [decoration, ...rest] = new SvgPreviewOnCode().svgPreviewDecorations(
      document,
    );
    assert.equal(rest.length, 0);
    assert.ok(decoration);
    assert.ok(decoration.hoverMessage instanceof vscode.MarkdownString);
    assert.match(
      (decoration.hoverMessage as vscode.MarkdownString).value,
      /^### (.*)\n\n!\[\]\(data:(.*?);base64,([A-Za-z0-9+/]+=*)\)\n\n\[\$\(gear\) (.*)\]\(command:workbench.action.openSettings\?\["@ext:sugoroku-y.svg-preview-on-code"\]\)$/,
    );
    const previewTitle = RegExp.$1;
    const contentType = RegExp.$2;
    const decoded = atob(RegExp.$3);
    const settingsCaption = RegExp.$4;
    if (contentType === 'image/svg+xml') {
      const parser = new XMLParser({
        preserveOrder: true,
        ignoreAttributes: false,
        attributeNamePrefix: '$$',
      });
      const svg = parser.parse(decoded);
      const attributes = svg[0][':@'];
      assert.equal(attributes.$$color, expect.currentColor ?? 'black');
      assert.equal(attributes.$$xmlns, 'http://www.w3.org/2000/svg');
      assert.equal(attributes.$$width, expect.width ?? 50);
      assert.equal(attributes.$$height, expect.height ?? 50);
      if (spec.preset) {
        for (const [name, value] of Object.entries(spec.preset)) {
          assert.equal(attributes[`$$${name}`], value);
        }
      }
      assert.equal(
        Object.keys(attributes).length,
        4 + Object.keys(spec.preset ?? {}).length,
      );
    }
    assert.equal(decoration.range.start.line, 0);
    assert.equal(decoration.range.start.character, 0);
    assert.equal(decoration.range.end.line, 0);
    assert.equal(decoration.range.end.character, text.length);
    if (expect.previewTitle) {
      assert.equal(previewTitle, expect.previewTitle);
    }
    if (expect.contentType) {
      assert.equal(contentType, expect.contentType);
    }
    if (expect.settingsCaption) {
      assert.equal(settingsCaption, expect.settingsCaption);
    }
  }

  test('svg: currentColor: red', async () => {
    decoration({ text: svg, currentColor: 'red' }, { currentColor: 'red' });
  });
  test('svg: currentColor: blue', async () => {
    decoration({ text: svg, currentColor: 'blue' }, { currentColor: 'blue' });
  });
  test('svg: dark mode', async () => {
    decoration(
      { text: svg, colorThemeKind: vscode.ColorThemeKind.Dark },
      { currentColor: 'white' },
    );
  });
  test('svg: light mode', async () => {
    decoration({ text: svg, colorThemeKind: vscode.ColorThemeKind.Light });
  });
  test('svg: high contrast dark mode', async () => {
    decoration(
      { text: svg, colorThemeKind: vscode.ColorThemeKind.HighContrast },
      { currentColor: 'white' },
    );
  });
  test('svg: high contrast light mode', async () => {
    decoration({
      text: svg,
      colorThemeKind: vscode.ColorThemeKind.HighContrastLight,
    });
  });
  test('svg: width 100', async () => {
    decoration({ text: svg, width: 100 });
  });
  test('svg: height 100', async () => {
    decoration({ text: svg, height: 100 }, { height: 50, width: 50 });
  });
  test('svg: 100x25', async () => {
    decoration({ text: svg, width: 100, height: 25 }, { height: 12.5 });
  });
  test('svg: 25x100', async () => {
    decoration({ text: svg, width: 25, height: 100 }, { width: 12.5 });
  });
  test('svg: preset: {stroke:currentColor}', async () => {
    decoration(
      { text: svg, preset: { stroke: 'currentColor', 'stroke-width': 2 } },
      { preset: { stroke: 'currentColor', 'stroke-width': 2 } },
    );
  });
  test('svg: language: none', async () => {
    decoration(
      { text: svg },
      { previewTitle: 'SVG Preview', settingsCaption: 'Settings' },
    );
  });
  test('svg: language: ja', async () => {
    decoration(
      { text: svg, language: 'ja' },
      { previewTitle: 'SVG プレビュー', settingsCaption: '設定' },
    );
  });
  test('data url: language: none', async () => {
    decoration(
      { text: dataScheme },
      {
        contentType: 'image/png',
        previewTitle: 'Data URL Preview',
        settingsCaption: 'Settings',
      },
    );
  });
  test('data url: language: ja', async () => {
    decoration(
      { text: dataScheme, language: 'ja' },
      {
        contentType: 'image/png',
        previewTitle: 'Data URL プレビュー',
        settingsCaption: '設定',
      },
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

  test('actual edit', async () => {
    const extension = vscode.extensions.getExtension(
      'sugoroku-y.svg-preview-on-code',
    );
    assert.ok(extension?.isActive);
    const e: SvgPreviewOnCode = await extension.activate();
    const yields: unknown[][] = [];
    using _ = mock(
      e,
      'svgPreviewDecorations',
      function* (this: typeof e, document) {
        const ys: unknown[] = [];
        yields.push(ys);
        const g = (
          this as unknown as { [saved]: typeof e.svgPreviewDecorations }
        )[saved](document);
        for (const e of g) {
          ys.push(e);
          yield e;
        }
      },
    );
    const document = await vscode.workspace.openTextDocument();
    const editor = await vscode.window.showTextDocument(document);
    assert.deepEqual(yields, [[]]);
    await new Promise((r) => setTimeout(r, 1000));
    await editor.edit((builder) => {
      builder.insert(document.positionAt(0), svg);
    });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(yields.length, 2);
    assert.equal(yields[1].length, 1);
    assert.equal(
      JSON.stringify(yields[1][0]),
      '{"range":[{"line":0,"character":0},{"line":0,"character":46}],"hoverMessage":{}}',
    );
    assert.equal(
      (yields[1][0] as any).hoverMessage.value,
      `### SVG Preview

![](data:image/svg+xml;base64,PHN2ZyBjb2xvcj0id2hpdGUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgd2lkdGg9IjUwIiBoZWlnaHQ9IjUwIi8+)

[$(gear) Settings](command:workbench.action.openSettings?["@ext:sugoroku-y.svg-preview-on-code"])`,
    );
    await editor.edit((builder) => {
      builder.delete(
        new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length),
        ),
      );
      builder.insert(document.positionAt(0), dataScheme);
    });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(yields.length, 3);
    assert.equal(yields[2].length, 1);
    assert.equal(
      JSON.stringify(yields[2][0]),
      '{"range":[{"line":0,"character":0},{"line":0,"character":26}],"hoverMessage":{}}',
    );
    assert.equal(
      (yields[2][0] as any).hoverMessage.value,
      `### Data URL Preview

![](data:image/png;base64,AAAA)

[$(gear) Settings](command:workbench.action.openSettings?["@ext:sugoroku-y.svg-preview-on-code"])`,
    );
  }).timeout(10000);
});
