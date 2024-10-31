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
    const size =
      vscode.workspace
        .getConfiguration('svg-preview-on-code')
        .get<number>('size') ?? 50;
    editor.setDecorations(decorationType, [
      ...svgPreviewDecorations(editor.document, size),
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

function isDarkMode() {
  switch (vscode.window.activeColorTheme.kind) {
    case vscode.ColorThemeKind.Dark:
    case vscode.ColorThemeKind.HighContrast:
      return true;
  }
  return false;
}

export function* svgPreviewDecorations(
  document: vscode.TextDocument,
  size: number,
): Generator<vscode.DecorationOptions, void, undefined> {
  const currentMode = isDarkMode() ? 'dark' : 'light';
  const previous = urlCache.get(document);
  // モードが変わったらキャッシュは使わない
  const previousMap = previous?.mode === currentMode ? previous.map : undefined;
  const nextMap = new Map<string, string>();
  let comingNew = false;
  const config = vscode.workspace.getConfiguration('svg-preview-on-code');
  const currentColor =
    config.get<string>('currentColor') ?? (isDarkMode() ? 'white' : 'black');
  const preset = config.get<Record<string, unknown>>('preset');
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
        const cached = previousMap?.get(match);
        if (cached) {
          nextMap.set(match, cached);
          return cached;
        }
        const svg = (() => {
          try {
            return parser.parse(match);
          } catch {
            // エラーが発生しても握りつぶす
            return undefined;
          }
        })();
        if (!svg) {
          return undefined;
        }
        const svgAttributes = svg[0][':@'];
        const w = Number(svgAttributes.$$width);
        const h = Number(svgAttributes.$$height);
        if (!w) {
          if (!h) {
            svgAttributes.$$width = size;
            svgAttributes.$$height = size;
          } else {
            svgAttributes.$$width = size;
          }
        } else if (!h) {
          svgAttributes.$$height = size;
        } else {
          if (w > h) {
            svgAttributes.$$width = size;
            svgAttributes.$$height = `${(h * size) / w}`;
          } else {
            svgAttributes.$$width = `${(w * size) / h}`;
            svgAttributes.$$height = size;
          }
        }
        svgAttributes.$$style = `color: ${currentColor};${
          svgAttributes.$$style ?? ''
        }`;
        if (preset) {
          for (const [name, value] of Object.entries(preset)) {
            svgAttributes[`$$${name}`] ??= value;
          }
        }

        const newUrl = `data:image/svg+xml;base64,${Buffer.from(
          builder.build(svg),
        ).toString('base64')}`;
        // 生成した画像URLはキャッシュしておく
        nextMap.set(match, newUrl);
        comingNew = true;
        return newUrl;
      })();
      if (!url) {
        continue;
      }
      const decoration = {
        range: new vscode.Range(start, end),
        hoverMessage: new vscode.MarkdownString(`![](${url}|width=${size})`),
      } satisfies vscode.DecorationOptions;
      yield decoration;
    } catch (ex) {
      // エラーが発生してもログに出すだけにする
      console.error(ex);
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
