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
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('svg-preview-on-code')) {
      for (const editor of vscode.window.visibleTextEditors) {
        const document = editor.document;
        if (!urlCache.has(document)) {
          continue;
        }
        urlCache.delete(document);
        update(editor);
      }
    }
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
    const currentColor = config.get<string>('currentColor');
    const preset = config.get<Record<string, unknown>>('preset');
    const size = config.get<number>('size');
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
  /**
   * VS Codeがダークモードであれば`'dark'`、ライトモードであれば`'light'`。
   */
  currentMode: 'dark' | 'light';
  /**
   * プレビューのサイズ。 svg-preview-on-code.sizeの設定値。
   * @default 50
   */
  size?: number;
  /**
   * svg要素に追加する属性。svg-preview-on-code.presetの設定値。
   */
  preset?: object;
  /**
   * svg要素のcolor属性に指定する値。svg-preview-on-code.currentColorの設定値。
   * @default ダークモードであれば`'white'`、ライトモードであれば`'black'`
   */
  currentColor?: string;
}

/**
 * SVGのプレゼンテーション属性かどうかを判定するためのテーブル
 * @see {@link https://developer.mozilla.org/ja/docs/Web/SVG/Attribute#プレゼンテーション属性 プレゼンテーション属性}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute#presentation_attributes Presentation Attributes}
 */
const SVG_PRESENTATION_ATTRIBUTES = {
  'alignment-baseline': true,
  'baseline-shift': true,
  clip: true,
  'clip-path': true,
  'clip-rule': true,
  color: true,
  'color-interpolation': true,
  'color-interpolation-filters': true,
  'color-rendering': true,
  cursor: true,
  d: true,
  direction: true,
  display: true,
  'dominant-baseline': true,
  fill: true,
  'fill-opacity': true,
  'fill-rule': true,
  filter: true,
  'flood-color': true,
  'flood-opacity': true,
  'font-family': true,
  'font-size': true,
  'font-size-adjust': true,
  'font-stretch': true,
  'font-style': true,
  'font-variant': true,
  'font-weight': true,
  'glyph-orientation-horizontal': true,
  'glyph-orientation-vertical': true,
  'image-rendering': true,
  'letter-spacing': true,
  'lighting-color': true,
  'marker-end': true,
  'marker-mid': true,
  'marker-start': true,
  mask: true,
  opacity: true,
  overflow: true,
  'pointer-events': true,
  'shape-rendering': true,
  'stop-color': true,
  'stop-opacity': true,
  stroke: true,
  'stroke-dasharray': true,
  'stroke-dashoffset': true,
  'stroke-linecap': true,
  'stroke-linejoin': true,
  'stroke-miterlimit': true,
  'stroke-opacity': true,
  'stroke-width': true,
  'text-anchor': true,
  'text-decoration': true,
  'text-rendering': true,
  transform: true,
  'transform-origin': true,
  'unicode-bidi': true,
  'vector-effect': true,
  visibility: true,
  'word-spacing': true,
  'writing-mode': true,
} as const;

export function* svgPreviewDecorations(
  document: vscode.TextDocument,
  { size, preset: _preset, currentMode, currentColor }: VSCodeConfiguration,
): Generator<vscode.DecorationOptions, void, undefined> {
  const preset: Record<string, string | number> | undefined =
    Object.fromEntries([
      [
        // currentColorに使用される色を指定する
        '$$color',
        currentColor || (currentMode === 'dark' ? 'white' : 'black'),
      ],
      ...(_preset
        ? Object.entries(_preset).flatMap(([name, value]) =>
            // SVGのプレゼンテーション属性のみ受け付ける
            name in SVG_PRESENTATION_ATTRIBUTES &&
            // 値は文字列/数値のみ
            ['string', 'number'].includes(typeof value)
              ? [
                  [
                    // fast-xml-parserの仕様で
                    `$$${name}`,
                    value,
                  ],
                ]
              : [],
          )
        : []),
    ]);
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
    // タグ前後の空白を除去したものをキャッシュのキーにする
    const normalized = match.replace(/(?<=>)\s+|\s+(?=<)/g, '');
    const start = document.positionAt(index);
    const end = document.positionAt(index + match.length);
    try {
      const url = (() => {
        // dataスキームはそのまま使用
        if (match.startsWith('data:')) {
          return match;
        }
        // キャッシュにあればそちらを使う
        const cached = previousMap?.get(normalized);
        if (cached) {
          if (cached === 'error') {
            // 前回何らかの問題があったものは最初からエラーにする
            throw IgnoreError;
          }
          nextMap.set(normalized, cached);
          return cached;
        }
        // 無ければsvgをparse
        const svg = (() => {
          try {
            return parser.parse(normalized);
          } catch {
            // parseで発生するエラーは無視するエラーに置き換えて投げ直す
            throw IgnoreError;
          }
        })();
        // ルートsvg要素の属性だけを操作する
        const svgAttributes = svg[0][':@'];
        if (svgAttributes.$$xmlns !== 'http://www.w3.org/2000/svg') {
          // 名前空間がSVGのものでなければ無視する
          throw IgnoreError;
        }
        svg[0][':@'] = {
          // svg要素に属性を追加
          ...preset,
          // 元々指定されている属性が優先
          ...svgAttributes,
        };
        // Base64エンコードしてDataスキームURIにする
        const newUrl = `data:image/svg+xml;base64,${Buffer.from(
          builder.build(svg),
        ).toString('base64')}`;
        // 生成した画像URLはキャッシュしておく
        nextMap.set(normalized, newUrl);
        comingNew = true;
        return newUrl;
      })();
      // svgもしくはDataスキームURIの範囲にプレビューを追加
      const range = new vscode.Range(start, end);
      // supportHtmlを有効にしてimgタグをMarkdown文字列として追加
      const hoverMessage = new vscode.MarkdownString();
      hoverMessage.supportHtml = true;
      hoverMessage.appendMarkdown(`<img src="${url}" height="${size ?? 50}">`);
      yield { range, hoverMessage };
    } catch (ex) {
      // 生成失敗したこともキャッシュする
      nextMap.set(normalized, 'error');
      comingNew = true;
      if (ex !== IgnoreError) {
        // 無視するエラーでなくてもログに出すだけ
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
