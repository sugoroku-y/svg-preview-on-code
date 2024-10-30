import * as vscode from 'vscode';
import {XMLParser, XMLBuilder} from 'fast-xml-parser';

const urlCache = new WeakMap<vscode.TextDocument, Map<string, string>>();

export function activate(context: vscode.ExtensionContext) {
  let timeout: NodeJS.Timeout | undefined;

  const decorationType = vscode.window.createTextEditorDecorationType({});
  update(vscode.window.activeTextEditor);
  vscode.window.onDidChangeActiveTextEditor(
    update,
    null,
    context.subscriptions
  );
  vscode.workspace.onDidChangeTextDocument(
    ev => {
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
    context.subscriptions
  );

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

export function* svgPreviewDecorations(
  document: vscode.TextDocument,
  size: number
): Generator<vscode.DecorationOptions, void, undefined> {
  const previousMap = urlCache.get(document);
  const nextMap = new Map<string, string>();
  for (const {index, 0: match} of document
    .getText()
    .matchAll(
      /<svg.*?>.*?<\/svg>|\bdata:image\/\w+(?:\+\w+)?;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/gs
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
        const svg = parser.parse(match);
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
        const config = vscode.workspace.getConfiguration('svg-preview-on-code');
        const currentColor = config.get<string>('currentColor');
        if (typeof currentColor === 'string') {
          svgAttributes.$$style = `color: ${currentColor};${
            svgAttributes.$$style ?? ''
          }`;
        }
        const preset = config.get<Record<string, unknown>>('preset');
        for (const [name, value] of Object.entries(preset || {})) {
          svgAttributes[`$$${name}`] ??= value;
        }

        const newUrl = `data:image/svg+xml;base64,${Buffer.from(
          builder.build(svg)
        ).toString('base64')}`;
        // 精製した画像はキャッシュしておく
        nextMap.set(match, newUrl);
        return newUrl;
      })();
      const decoration = {
        range: new vscode.Range(start, end),
        hoverMessage: new vscode.MarkdownString(`![](${url}|width=${size})`),
      } satisfies vscode.DecorationOptions;
      yield decoration;
    } catch {
      // エラーが発生しても握りつぶす
    }
  }
  if (nextMap.size) {
    urlCache.set(document, nextMap);
  } else if (previousMap) {
    urlCache.delete(document);
  }
}
