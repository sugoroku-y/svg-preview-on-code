import * as vscode from 'vscode';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const urlCache = new WeakMap<
  vscode.TextDocument,
  { mode: 'dark' | 'light'; map: Map<string, string> }
>();

export function activate(context: vscode.ExtensionContext) {
  let timeout: NodeJS.Timeout | undefined;

  const decorationType = vscode.window.createTextEditorDecorationType({});
  update(vscode.window.activeTextEditor);
  vscode.window.onDidChangeActiveTextEditor(
    update,
    null,
    context.subscriptions,
  );
  vscode.workspace.onDidChangeTextDocument(
    (ev) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      if (ev.document !== editor.document) {
        return;
      }
      resetTimeout();
      timeout = setTimeout(() => {
        update(editor);
      }, 500);
    },
    null,
    context.subscriptions,
  );
  vscode.window.onDidChangeActiveColorTheme(() => {
    update(vscode.window.activeTextEditor);
  });

  function update(editor: vscode.TextEditor | null | undefined) {
    resetTimeout();
    if (!editor) {
      return;
    }
    const currentMode = (() => {
      switch (vscode.window.activeColorTheme.kind) {
        case vscode.ColorThemeKind.Dark:
        case vscode.ColorThemeKind.HighContrast:
          return 'dark';
      }
      return 'light';
    })();
    const config = vscode.workspace.getConfiguration('svg-preview-on-code');
    const currentColor =
      config.get<string>('currentColor') ||
      (currentMode === 'dark' ? 'white' : 'black');
    const preset = config.get<Record<string, unknown>>('preset');
    const size = config.get<number>('size') ?? 50;
    editor.setDecorations(decorationType, [
      ...svgPreviewDecorations(editor.document, {
        size,
        preset,
        currentColor,
        currentMode,
      }),
    ]);
  }
  function resetTimeout() {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  }
}

export function deactivate() {}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '$$',
});

const builder = new XMLBuilder({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '$$',
});

const IgnoreError = {};

interface VSCodeConfiguration {
  size: number;
  preset?: object;
  currentColor: string;
  currentMode: 'dark' | 'light';
}

export function* svgPreviewDecorations(
  document: vscode.TextDocument,
  { size, preset, currentColor, currentMode }: VSCodeConfiguration,
): Generator<vscode.DecorationOptions, void, undefined> {
  const previous = urlCache.get(document);
  // モードが変わったらキャッシュは使わない
  const previousMap = previous?.mode === currentMode ? previous.map : undefined;
  const nextMap = new Map<string, string>();
  let comingNew = false;
  for (const { index, 0: match } of document
    .getText()
    .matchAll(
      /<svg.*?>.*?<\/svg>|\bdata:image\/\w+(?:\+\w+)?;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/gs,
    )) {
    const start = document.positionAt(index);
    const end = document.positionAt(index + match.length);
    try {
      const url = (() => {
        if (match.startsWith('data:')) {
          return match;
        }
        // タグ前後の空白を除去
        const normalized = match.replace(/(?<=>)\s+|\s+(?=<)/g, '');
        // キャッシュにあればそちらを使う
        const cached = previousMap?.get(normalized);
        if (cached) {
          nextMap.set(normalized, cached);
          return cached;
        }
        const svg = (() => {
          try {
            return parser.parse(normalized);
          } catch {
            // ここでは無視するエラーに置き換えて投げ直す
            throw IgnoreError;
          }
        })();
        const svgAttributes = svg[0][':@'];
        svgAttributes.$$color = currentColor;
        if (preset) {
          for (const [name, value] of Object.entries(preset)) {
            if (!/^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/.test(name)) {
              // aaaもしくはaaa-bbb形式の属性のみ受け付ける
              continue;
            }
            svgAttributes[`$$${name}`] ??= value;
          }
        }

        const newUrl = `data:image/svg+xml;base64,${Buffer.from(
          builder.build(svg),
        ).toString('base64')}`;
        // 生成した画像URLはキャッシュしておく
        nextMap.set(normalized, newUrl);
        comingNew = true;
        return newUrl;
      })();
      const range = new vscode.Range(start, end);
      const hoverMessage = new vscode.MarkdownString();
      hoverMessage.supportHtml = true;
      hoverMessage.appendMarkdown(`<img src="${url}" height="${size}">`);
      yield { range, hoverMessage };
    } catch (ex) {
      if (ex !== IgnoreError) {
        // エラーが発生してもログに出すだけにする
        console.error(ex);
      }
    }
  }
  if (nextMap.size) {
    if (comingNew || nextMap.size !== previousMap?.size) {
      // 変化があったときだけ更新
      urlCache.set(document, { mode: currentMode, map: nextMap });
    }
  } else if (previous) {
    // ひとつも無くなったら削除
    urlCache.delete(document);
  }
}
