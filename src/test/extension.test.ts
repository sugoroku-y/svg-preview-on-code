import * as assert from 'assert';
import * as vscode from 'vscode';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { SvgPreviewOnCode } from '../SvgPreviewOnCode';
import { resolve } from 'path';
import { XMLParser } from 'fast-xml-parser';
import { localeString } from '../localeString';
import type { LocaleMap, LocaleMapKey } from '../LocaleMap';

type Accessiblize<T, K extends PropertyKey> = Omit<T, K> & {
  // @ts-expect-error privateメンバーにアクセスするために必要
  [KK in K]: T[KK];
};

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

function mock<T extends object, K extends keyof T>(
  target: T,
  key: K,
  replace: T[K],
): { original: T[K]; [Symbol.dispose](): void } {
  const desc = getPropertyDescriptor(target, key);
  if (!desc) {
    throw new Error(`unknown property: '${String(key)}'`);
  }
  const original = target[key];
  if ((desc.get && !desc.set) || (!desc.get && !desc.set && !desc.writable)) {
    Object.defineProperty(target, key, { get: () => replace });
    return {
      original,
      [Symbol.dispose]() {
        Object.defineProperty(target, key, desc);
      },
    };
  }
  target[key] = replace;
  return {
    original,
    [Symbol.dispose]() {
      target[key] = original;
    },
  };
}

function mockGenerator<
  K extends PropertyKey,
  F extends (
    this: object,
    ...args: never
  ) => Generator<unknown, void, undefined>,
>(e: Record<K, F>, key: K) {
  const yields: unknown[][] = [];
  const mocked = Object.assign(
    mock(e, key, function* (this: typeof e, ...args) {
      const ys: unknown[] = [];
      yields.push(ys);
      const g = mocked.original.apply(this, args);
      for (const e of g) {
        ys.push(e);
        yield e;
      }
    } as F),
    { yields },
  );
  return mocked;
}

async function openTextDocument(): Promise<
  {
    document: vscode.TextDocument;
    editor: vscode.TextEditor;
  } & AsyncDisposable
> {
  const document = await vscode.workspace.openTextDocument();
  const editor = await vscode.window.showTextDocument(document);
  return {
    document,
    editor,
    async [Symbol.asyncDispose]() {
      const targets: vscode.Tab[] = [];
      for (const { tabs } of vscode.window.tabGroups.all) {
        for (const tab of tabs) {
          if (
            tab.input instanceof vscode.TabInputText &&
            String(tab.input.uri) === String(document.uri)
          ) {
            targets.push(tab);
          }
        }
      }
      await vscode.window.tabGroups.close(targets);
    },
  };
}

function timeout(elapse: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, elapse));
}

function getExtension<
  K extends 'svgPreviewDecorations' | 'deactivate' = 'svgPreviewDecorations',
>(): Accessiblize<SvgPreviewOnCode, K> {
  const extension = vscode.extensions.getExtension(
    'sugoroku-y.svg-preview-on-code',
  );
  assert.ok(extension?.isActive);
  return extension.exports as Accessiblize<SvgPreviewOnCode, K>;
}

function isDarkTheme(theme: vscode.ColorTheme) {
  return (
    theme.kind === vscode.ColorThemeKind.Dark ||
    theme.kind === vscode.ColorThemeKind.HighContrast
  );
}

class AsyncDisposableStack implements AsyncDisposable {
  private readonly stack: Array<Disposable | AsyncDisposable> = [];
  async [Symbol.asyncDispose]() {
    const errors: unknown[] = [];
    for (const disposable of this.stack.reverse()) {
      if (Symbol.asyncDispose in disposable) {
        try {
          await disposable[Symbol.asyncDispose]();
        } catch (ex) {
          errors.push(ex);
        }
        continue;
      }
      if (Symbol.dispose in disposable) {
        try {
          // eslint-disable-next-line @typescript-eslint/await-thenable -- 念の為await
          await disposable[Symbol.dispose]();
        } catch (ex) {
          errors.push(ex);
        }
        continue;
      }
    }
    this.stack.length = 0;
    if (!errors.length) {
      return;
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    throw new (class extends Error {
      errors = errors;
    })();
  }
  use(disposable: AsyncDisposable | Disposable | undefined): void {
    if (!disposable) {
      return;
    }
    this.stack.push(disposable);
  }
  adopt(disposer: () => unknown): void;
  adopt<T>(target: T, disposer: (target: T) => unknown): void;
  adopt(
    ...args:
      | [target: unknown, disposer: (target: unknown) => unknown]
      | [disposer: () => unknown]
  ): void {
    const [target, disposer] = args.length === 2 ? args : [undefined, args[0]];
    this.stack.push({
      [Symbol.dispose]() {
        disposer(target);
      },
    });
  }
  asyncAdopt(disposer: () => PromiseLike<unknown>): void;
  asyncAdopt<T>(target: T, disposer: (target: T) => PromiseLike<unknown>): void;
  asyncAdopt(
    ...args:
      | [target: unknown, disposer: (target: unknown) => PromiseLike<unknown>]
      | [disposer: () => PromiseLike<unknown>]
  ): void {
    const [target, disposer] = args.length === 2 ? args : [undefined, args[0]];
    this.stack.push({
      async [Symbol.asyncDispose]() {
        await disposer(target);
      },
    });
  }
}

async function ensureLightMode() {
  if (!isDarkTheme(vscode.window.activeColorTheme)) {
    return;
  }
  await vscode.commands.executeCommand(
    'workbench.action.toggleLightDarkThemes',
  );
  return {
    async [Symbol.asyncDispose]() {
      await vscode.commands.executeCommand(
        'workbench.action.toggleLightDarkThemes',
      );
    },
  };
}

async function resetConfiguration() {
  await vscode.workspace
    .getConfiguration()
    .update(
      'svn-preview-on-code',
      undefined,
      vscode.ConfigurationTarget.Global,
    );
}

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
  const dataScheme = 'data:image/png;base64,AAAA';
  async function decoration(
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
    await using stack = new AsyncDisposableStack();
    stack.use(mock(vscode.env, 'language', spec.language ?? 'none'));
    const config = vscode.workspace.getConfiguration();
    await config.update(
      'svg-preview-on-code.currentColor',
      spec.currentColor,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      'svg-preview-on-code.preset',
      spec.preset,
      vscode.ConfigurationTarget.Global,
    );
    await config.update(
      'svg-preview-on-code.size',
      spec.size,
      vscode.ConfigurationTarget.Global,
    );
    stack.asyncAdopt(resetConfiguration);
    stack.use(
      mock(vscode.window, 'activeColorTheme', {
        kind: spec.colorThemeKind ?? vscode.ColorThemeKind.Light,
      }),
    );
    const text =
      spec.width || spec.height
        ? spec.text.replace(
            /(?<=<svg)(?=\s)/,
            `${spec.width ? ` width="${spec.width}"` : ''}${spec.height ? ` height="${spec.height}"` : ''}`,
          )
        : spec.text;
    await using opened = await openTextDocument();
    const { document, editor } = opened;
    using mocked = mockGenerator(getExtension(), 'svgPreviewDecorations');
    await editor.edit((builder) => {
      builder.insert(document.positionAt(0), text);
    });
    await timeout(500);
    const [decoration, ...rest] = mocked
      .yields[0] as vscode.DecorationOptions[];
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
      if (expect.currentColor) {
        assert.equal(attributes.$$color, expect.currentColor);
      }
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
    await decoration(
      { text: svg, currentColor: 'red' },
      { currentColor: 'red' },
    );
  });
  test('svg: currentColor: blue', async () => {
    await decoration(
      { text: svg, currentColor: 'blue' },
      { currentColor: 'blue' },
    );
  });
  test('svg: dark mode', async () => {
    await decoration(
      { text: svg, colorThemeKind: vscode.ColorThemeKind.Dark },
      { currentColor: 'white' },
    );
  });
  test('svg: light mode', async () => {
    await decoration({
      text: svg,
      colorThemeKind: vscode.ColorThemeKind.Light,
    });
  });
  test('svg: high contrast dark mode', async () => {
    await decoration(
      { text: svg, colorThemeKind: vscode.ColorThemeKind.HighContrast },
      { currentColor: 'white' },
    );
  });
  test('svg: high contrast light mode', async () => {
    await decoration({
      text: svg,
      colorThemeKind: vscode.ColorThemeKind.HighContrastLight,
    });
  });
  test('svg: width 100', async () => {
    await decoration({ text: svg, width: 100 }, { width: 100 });
  });
  test('svg: height 100', async () => {
    await decoration({ text: svg, height: 100 }, { height: 100 });
  });
  test('svg: 100x25', async () => {
    await decoration(
      { text: svg, width: 100, height: 25 },
      { width: 100, height: 25 },
    );
  });
  test('svg: 25x100', async () => {
    await decoration(
      { text: svg, width: 25, height: 100 },
      { width: 25, height: 100 },
    );
  });
  test('svg: preset: {stroke:currentColor}', async () => {
    await decoration(
      { text: svg, preset: { stroke: 'currentColor', 'stroke-width': 2 } },
      { preset: { stroke: 'currentColor', 'stroke-width': 2 } },
    );
  });
  test('svg: language: none', async () => {
    await decoration(
      { text: svg },
      { previewTitle: 'SVG Preview', settingsCaption: 'Settings' },
    );
  });
  test('svg: language: ja', async () => {
    await decoration(
      { text: svg, language: 'ja' },
      { previewTitle: 'SVG プレビュー', settingsCaption: '設定' },
    );
  });
  test('data url: language: none', async () => {
    await decoration(
      { text: dataScheme },
      {
        contentType: 'image/png',
        previewTitle: 'Data URL Preview',
        settingsCaption: undefined,
      },
    );
  });
  test('data url: language: ja', async () => {
    await decoration(
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
    await using stack = new AsyncDisposableStack();
    stack.use(mock(vscode.env, 'language', 'en'));
    stack.use(await ensureLightMode());
    await resetConfiguration();
    using mocked = mockGenerator(getExtension(), 'svgPreviewDecorations');
    await using opened = await openTextDocument();
    const { document, editor } = opened;
    assert.deepEqual(mocked.yields, [[]]);
    await timeout(1000);
    await editor.edit((builder) => {
      builder.insert(document.positionAt(0), svg);
    });
    await timeout(500);
    assert.equal(mocked.yields.length, 2);
    assert.equal(mocked.yields[1].length, 1);
    const second = mocked.yields[1][0];
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
    await timeout(500);
    assert.equal(mocked.yields.length, 3);
    assert.equal(mocked.yields[2].length, 1);
    const third = mocked.yields[2][0];
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
    await using stack = new AsyncDisposableStack();
    stack.use(mock(vscode.env, 'language', 'en'));
    await resetConfiguration();
    stack.use(await ensureLightMode());
    using mocked = mockGenerator(getExtension(), 'svgPreviewDecorations');
    await using opened = await openTextDocument();
    const { document, editor } = opened;
    assert.deepEqual(mocked.yields, [[]]);
    await editor.edit((builder) => {
      builder.insert(document.positionAt(0), '<svg></svg>');
    });
    await timeout(500);
    assert.deepEqual(mocked.yields, [[], []]);
  }).timeout(10000);
  test('change Theme', async () => {
    await using stack = new AsyncDisposableStack();
    stack.use(mock(vscode.env, 'language', 'en'));
    await resetConfiguration();
    await vscode.workspace
      .getConfiguration()
      .update(
        'svg-preview-on-code.size',
        25,
        vscode.ConfigurationTarget.Global,
      );
    stack.asyncAdopt(resetConfiguration);
    stack.use(await ensureLightMode());
    assert.throws(() => getExtension().activate({} as vscode.ExtensionContext));
    await using opened = await openTextDocument();
    const { document, editor } = opened;
    await editor.edit((builder) => {
      builder.insert(document.positionAt(0), svg);
    });
    await timeout(500);
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '\n\n<svg ><!--</svg>',
      );
    });
    await timeout(500);
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg a=""></svg>\n\n',
      );
    });
    await timeout(500);
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg a="></svg>\n\n',
      );
    });
    await timeout(500);
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg ></svg>\n\n',
      );
    });
    await timeout(500);
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(document.getText().length),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50"><path d="M0 0a5 5 0 0 0 5 5 10 10 0 0 1 10 10 15 15 0 0 0 15 15 20 20 0 0 1 20 20" fill="none" stroke="currentColor"/></svg>\n\n',
      );
    });
    await timeout(500);
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
    await timeout(500);
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
    await timeout(500);
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
    await timeout(500);
    await vscode.commands.executeCommand(
      'workbench.action.toggleLightDarkThemes',
    );
    await timeout(500);
  }).timeout(10000);

  test('duplicate deactivate', async () => {
    getExtension<'deactivate'>().deactivate();
  });

  test('change language', async () => {
    await using opened = await openTextDocument();
    const { document, editor } = opened;
    const config = vscode.workspace.getConfiguration('svg-preview-on-code', {
      languageId: 'html',
    });
    await config.update(
      'disable',
      true,
      vscode.ConfigurationTarget.Global,
      true,
    );
    await using _ = {
      async [Symbol.asyncDispose]() {
        await config.update(
          'disable',
          undefined,
          vscode.ConfigurationTarget.Global,
          true,
        );
      },
    };
    vscode.commands.executeCommand(
      'workbench.action.editor.changeLanguageMode',
      'HTML',
    );
    await editor.edit((builder) => {
      builder.insert(
        document.positionAt(0),
        /* html */ `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M2.5 8.8a10 10 0 1 0 9.5-6.8m0 10l-7.2-10-1 4m1-4h4" />
        </svg>
        `,
      );
    });
    await timeout(500);
    vscode.commands.executeCommand(
      'workbench.action.editor.changeLanguageMode',
      'JavaScript',
    );
    await timeout(500);
  }).timeout(10000);
});

suite('nls', () => {
  (
    [
      ['ja', { 'preview.preview': 'プレビュー', 'preview.settings': '設定' }],
      ['en', { 'preview.preview': 'Preview', 'preview.settings': 'Settings' }],
      [
        'test-error',
        { 'preview.preview': 'Preview', 'preview.settings': 'Settings' },
      ],
      [
        'test-error2',
        { 'preview.preview': 'Preview', 'preview.settings': 'Settings' },
      ],
    ] as const satisfies [string, Partial<LocaleMap>][]
  ).forEach(([language, data]) => {
    for (const [key, value] of Object.entries(data) as [
      LocaleMapKey,
      string,
    ][]) {
      test(`locale string(${key}) for ${language}`, () => {
        using _ = mock(vscode.env, 'language', language);
        assert.equal(localeString(key), value);
      });
    }
  });
});
