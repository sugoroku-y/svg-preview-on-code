import * as assert from 'assert';
import * as vscode from 'vscode';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { SvgPreviewOnCode } from '../SvgPreviewOnCode';
import { resolve } from 'path';
import { XMLParser } from 'fast-xml-parser';

type Accessiblize<T, K extends PropertyKey> = Omit<T, K> &
  Record<
    K,
    // @ts-expect-error privateメンバーにアクセスするために必要
    T[K]
  >;

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
  offsetAt(_position: vscode.Position): number {
    throw new Error('Method not implemented.');
  }
  positionAt(offset: number): vscode.Position {
    let line = 0;
    let bol = 0,
      eol = this.lines[0].length + 1;
    for (;;) {
      if (offset < eol) {
        break;
      }
      ++line;
      bol = eol;
      eol += this.lines[line].length + 1;
    }
    return new vscode.Position(line, offset - bol);
  }
  getText(_range?: vscode.Range): string {
    return this.lines.join('\n');
  }
  getWordRangeAtPosition(
    _position: vscode.Position,
    _regex?: RegExp,
  ): vscode.Range | undefined {
    throw new Error('Method not implemented.');
  }
  validateRange(_range: vscode.Range): vscode.Range {
    throw new Error('Method not implemented.');
  }
  validatePosition(_position: vscode.Position): vscode.Position {
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
  for (let o = target; o; o = Object.getPrototypeOf(o) as object) {
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

  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const dataScheme = 'data:image/png;base64,AAAA';
  function decoration(
    spec: {
      text: string;
      language?: string;
      currentColor?: string;
      colorThemeKind?: vscode.ColorThemeKind;
      preset?: object;
      size?: number;
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
          size: spec.size,
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
    const e = new SvgPreviewOnCode();
    Object.assign(e, {
      id: 'sugoroku-y.svg-preview-on-code',
      section: 'svg-preview-on-code',
    });
    const [decoration, ...rest] = e.svgPreviewDecorations(document);
    assert.equal(rest.length, 0);
    assert.ok(decoration);
    assert.ok(Array.isArray(decoration.hoverMessage));
    const dataUrl = expect.previewTitle?.match(/^Data URL/);
    assert.equal(decoration.hoverMessage.length, dataUrl ? 2 : 3);
    assert.ok(decoration.hoverMessage[0] instanceof vscode.MarkdownString);
    assert.match(decoration.hoverMessage[0].value, /^### (.*)$/);
    const previewTitle = RegExp.$1;
    if (expect.previewTitle) {
      assert.equal(previewTitle, expect.previewTitle);
    }
    assert.ok(decoration.hoverMessage[1] instanceof vscode.MarkdownString);
    assert.match(
      decoration.hoverMessage[1].value,
      /^!\[\]\(data:(.*?);base64,([A-Za-z0-9+/]+=*)\)$/,
    );
    const contentType = RegExp.$1;
    const decoded = atob(RegExp.$2);
    if (expect.contentType) {
      assert.equal(contentType, expect.contentType);
    }
    if (contentType === 'image/svg+xml') {
      const parser = new XMLParser({
        preserveOrder: true,
        ignoreAttributes: false,
        attributeNamePrefix: '$$',
      });
      const svg = parser.parse(decoded) as [
        { ':@': Record<`$$${string}`, number | string>; svg: unknown[] },
      ];
      const attributes = svg[0][':@'];
      assert.equal(attributes.$$color, expect.currentColor ?? 'black');
      assert.equal(attributes.$$xmlns, 'http://www.w3.org/2000/svg');
      assert.equal(attributes.$$width, expect.width);
      assert.equal(attributes.$$height, expect.height);
      if (spec.preset) {
        for (const [name, value] of Object.entries(spec.preset)) {
          assert.equal(attributes[`$$${name}`], value);
        }
      }
      assert.equal(
        Object.keys(attributes).length,
        2 +
          (spec.size ? 2 : (spec.width ? 1 : 0) + (spec.height ? 1 : 0)) +
          Object.keys(spec.preset ?? {}).length,
      );
    }
    if (!dataUrl) {
      assert.ok(decoration.hoverMessage[2] instanceof vscode.MarkdownString);
      assert.match(
        decoration.hoverMessage[2].value,
        /^\[\$\(gear\) (.*)\]\(command:workbench.action.openSettings\?\["@ext:sugoroku-y.svg-preview-on-code"\]\)$/,
      );
      if (expect.settingsCaption) {
        const settingsCaption = RegExp.$1;
        assert.equal(settingsCaption, expect.settingsCaption);
      }
    }
    assert.equal(decoration.range.start.line, 0);
    assert.equal(decoration.range.start.character, 0);
    assert.equal(decoration.range.end.line, 0);
    assert.equal(decoration.range.end.character, text.length);
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
    decoration({ text: svg, width: 100 }, { width: 100 });
  });
  test('svg: height 100', async () => {
    decoration({ text: svg, height: 100 }, { height: 100 });
  });
  test('svg: 100x25', async () => {
    decoration(
      { text: svg, width: 100, height: 25 },
      { width: 100, height: 25 },
    );
  });
  test('svg: 25x100', async () => {
    decoration(
      { text: svg, width: 25, height: 100 },
      { width: 25, height: 100 },
    );
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
        settingsCaption: undefined,
      },
    );
  });
  test('data url: language: ja', async () => {
    decoration(
      { text: dataScheme, language: 'ja' },
      {
        contentType: 'image/png',
        previewTitle: 'Data URL プレビュー',
        settingsCaption: undefined,
      },
    );
  });

  test('Changelog', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { version } = require('../../package.json') as { version: string };
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
    using _l = mock(vscode.env, 'language', 'en');
    using _c = mock(
      vscode.workspace,
      'getConfiguration',
      () => ({}) as unknown as vscode.WorkspaceConfiguration,
    );
    using _t = mock(vscode.window, 'activeColorTheme', {
      kind: vscode.ColorThemeKind.Light,
    });
    const extension = vscode.extensions.getExtension(
      'sugoroku-y.svg-preview-on-code',
    );
    assert.ok(extension?.isActive);
    const e = (await extension.activate()) as Accessiblize<
      SvgPreviewOnCode,
      'reset'
    >;
    e.reset();
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
    await using document = await openTextDocument();
    const editor = await vscode.window.showTextDocument(document);
    assert.deepEqual(yields, [[]]);
    await new Promise((r) => setTimeout(r, 1000));
    await editor.edit((builder) => {
      builder.insert(document.positionAt(0), svg);
    });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(yields.length, 2);
    assert.equal(yields[1].length, 1);
    const second = yields[1][0];
    assert.ok(typeof second === 'object' && second);
    assert.ok('range' in second && second.range instanceof vscode.Range);
    assert.ok('hoverMessage' in second && Array.isArray(second.hoverMessage));
    assert.equal(
      JSON.stringify(second.range),
      '[{"line":0,"character":0},{"line":0,"character":46}]',
    );
    assert.equal(second.hoverMessage.length, 3);
    assert.ok(second.hoverMessage[0] instanceof vscode.MarkdownString);
    assert.equal(second.hoverMessage[0].value, '### SVG Preview');
    assert.ok(second.hoverMessage[1] instanceof vscode.MarkdownString);
    assert.equal(
      second.hoverMessage[1].value,
      '![](data:image/svg+xml;base64,PHN2ZyBjb2xvcj0iYmxhY2siIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIvPg==)',
    );
    assert.ok(second.hoverMessage[2] instanceof vscode.MarkdownString);
    assert.equal(
      second.hoverMessage[2].value,
      '[$(gear) Settings](command:workbench.action.openSettings?["@ext:sugoroku-y.svg-preview-on-code"])',
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
    const third = yields[2][0];
    assert.ok(typeof third === 'object' && third);
    assert.ok('range' in third && third.range instanceof vscode.Range);
    assert.ok('hoverMessage' in third && Array.isArray(third.hoverMessage));
    assert.equal(
      JSON.stringify(third.range),
      '[{"line":0,"character":0},{"line":0,"character":26}]',
    );
    assert.equal(third.hoverMessage.length, 2);
    assert.ok(third.hoverMessage[0] instanceof vscode.MarkdownString);
    assert.equal(third.hoverMessage[0].value, '### Data URL Preview');
    assert.ok(third.hoverMessage[1] instanceof vscode.MarkdownString);
    assert.equal(
      third.hoverMessage[1].value,
      '![](data:image/png;base64,AAAA)',
    );
  }).timeout(10000);

  test('actual edit2', async () => {
    using _l = mock(vscode.env, 'language', 'en');
    using _c = mock(
      vscode.workspace,
      'getConfiguration',
      () => ({}) as unknown as vscode.WorkspaceConfiguration,
    );
    using _t = mock(vscode.window, 'activeColorTheme', {
      kind: vscode.ColorThemeKind.Light,
    });
    const extension = vscode.extensions.getExtension(
      'sugoroku-y.svg-preview-on-code',
    );
    assert.ok(extension?.isActive);
    const e = (await extension.activate()) as Accessiblize<
      SvgPreviewOnCode,
      'reset'
    >;
    e.reset();
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
    await using document = await openTextDocument();
    const editor = await vscode.window.showTextDocument(document);
    assert.deepEqual(yields, [[]]);
    await editor.edit((builder) => {
      builder.insert(document.positionAt(0), '<svg></svg>');
    });
    await new Promise((r) => setTimeout(r, 500));
    assert.deepEqual(yields, [[], []]);
  }).timeout(10000);
  test('change Theme', async () => {
    using _l = mock(vscode.env, 'language', 'en');
    using _c = mock(
      vscode.workspace,
      'getConfiguration',
      () => ({ size: 25 }) as unknown as vscode.WorkspaceConfiguration,
    );
    using _t = mock(vscode.window, 'activeColorTheme', {
      kind: vscode.ColorThemeKind.Light,
    });
    const extension = vscode.extensions.getExtension(
      'sugoroku-y.svg-preview-on-code',
    );
    assert.ok(extension?.isActive);
    const e = (await extension.activate()) as Accessiblize<
      SvgPreviewOnCode,
      'reset'
    >;
    e.reset();
    assert.throws(() => e.activate({} as vscode.ExtensionContext));
    await using document = await openTextDocument();
    const editor = await vscode.window.showTextDocument(document);
    await editor.edit((builder) => {
      builder.insert(document.positionAt(0), svg);
    });
    await new Promise((r) => setTimeout(r, 500));
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '\n\n<svg ><!--</svg>',
      );
    });
    await new Promise((r) => setTimeout(r, 500));
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg a=""></svg>\n\n',
      );
    });
    await new Promise((r) => setTimeout(r, 500));
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg a="></svg>\n\n',
      );
    });
    await new Promise((r) => setTimeout(r, 500));
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg ></svg>\n\n',
      );
    });
    await new Promise((r) => setTimeout(r, 500));
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><path d="M0 0a5 5 0 0 0 5 5 10 10 0 0 1 10 10 15 15 0 0 0 15 15 20 20 0 0 1 20 20" fill="none" stroke="currentColor"/></svg>\n\n',
      );
    });
    await new Promise((r) => setTimeout(r, 500));
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="100" height="25"><path d="M0 0a5 5 0 0 0 5 5 10 10 0 0 1 10 10 15 15 0 0 0 15 15 20 20 0 0 1 20 20" fill="none" stroke="currentColor"/></svg>\n\n',
      );
    });
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" width="25" height="100"><path d="M0 0a5 5 0 0 0 5 5 10 10 0 0 1 10 10 15 15 0 0 0 15 15 20 20 0 0 1 20 20" fill="none" stroke="currentColor"/></svg>\n\n',
      );
    });
    await new Promise((r) => setTimeout(r, 500));
    await editor.edit((builder) => {
      builder.delete(
        new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length),
        ),
      );
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><path d="M0 0a5 5 0 0 0 5 5 10 10 0 0 1 10 10 15 15 0 0 0 15 15 20 20 0 0 1 20 20" fill="none" stroke="currentColor"/></svg>\n\n',
      );
    });
    await new Promise((r) => setTimeout(r, 500));
    await vscode.commands.executeCommand(
      'workbench.action.toggleLightDarkThemes',
    );
    await editor.edit((builder) => {
      builder.delete(
        new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length),
        ),
      );
    });
    await new Promise((r) => setTimeout(r, 500));
    await vscode.commands.executeCommand(
      'workbench.action.toggleLightDarkThemes',
    );
    await new Promise((r) => setTimeout(r, 500));
  }).timeout(10000);

  test('duplicate deactivate', async () => {
    const extension = vscode.extensions.getExtension(
      'sugoroku-y.svg-preview-on-code',
    );
    assert.ok(extension?.isActive);
    const e = (await extension.activate()) as Accessiblize<
      SvgPreviewOnCode,
      'deactivate'
    >;
    e.deactivate();
  });
});

async function openTextDocument(): Promise<
  vscode.TextDocument & AsyncDisposable
> {
  const document = await vscode.workspace.openTextDocument();
  return new Proxy(document, {
    get(...args) {
      if (args[1] === Symbol.asyncDispose) {
        return async function dispose(this: vscode.TextDocument) {
          await vscode.window.tabGroups.close([
            ...(function* (document) {
              for (const { tabs } of vscode.window.tabGroups.all) {
                for (const tab of tabs) {
                  if (
                    tab.input instanceof vscode.TabInputText &&
                    String(tab.input.uri) === String(document.uri)
                  ) {
                    yield tab;
                  }
                }
              }
            })(this),
          ]);
        };
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return Reflect.get(...args);
    },
  }) as vscode.TextDocument & AsyncDisposable;
}
