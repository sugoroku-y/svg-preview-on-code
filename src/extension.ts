import * as vscode from 'vscode';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export class SvgPreviewOnCode {
  private activated = false;
  private urlCache!: WeakMap<vscode.TextDocument, Map<string, string>>;
  private preset!: Record<string, string | number>;
  private size!: number;
  private timeout?: NodeJS.Timeout;

  private readonly parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '$$',
  });

  private readonly builder = new XMLBuilder({
    preserveOrder: true,
    suppressEmptyNode: true,
    ignoreAttributes: false,
    attributeNamePrefix: '$$',
  });
  private readonly decorationType =
    vscode.window.createTextEditorDecorationType({});

  constructor() {
    this.reset();
  }

  activate(context: vscode.ExtensionContext) {
    if (this.activated) {
      throw new Error();
    }
    this.activated = true;
    const instance = this;
    context.subscriptions.push({
      dispose() {
        instance.deactivate();
      },
    });

    this.update(vscode.window.activeTextEditor);

    vscode.window.onDidChangeActiveTextEditor(
      (editor) => {
        this.update(editor);
      },
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
        this.clearTimeout();
        this.timeout = setTimeout(() => {
          this.update(editor);
        }, 500);
      },
      null,
      context.subscriptions,
    );
    vscode.window.onDidChangeActiveColorTheme(
      () => {
        this.updateVisibleEditors();
      },
      null,
      context.subscriptions,
    );
    vscode.workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration('svg-preview-on-code')) {
          this.updateVisibleEditors();
        }
      },
      null,
      context.subscriptions,
    );
  }

  private deactivate() {
    if (!this.activated) {
      return;
    }
    this.activated = false;
    for (const document of vscode.workspace.textDocuments) {
      this.urlCache.delete(document);
    }
    this.decorationType.dispose();
  }

  private reset() {
    const config = vscode.workspace.getConfiguration('svg-preview-on-code');
    const currentColor = config.currentColor;
    this.size = config.size ?? 50;
    this.urlCache = new WeakMap<vscode.TextDocument, Map<string, string>>();
    this.preset = {
      // currentColorに使用される色を指定する
      $$color:
        currentColor ||
        {
          [vscode.ColorThemeKind.Dark]: 'white',
          [vscode.ColorThemeKind.HighContrast]: 'white',
          [vscode.ColorThemeKind.Light]: 'black',
          [vscode.ColorThemeKind.HighContrastLight]: 'black',
        }[vscode.window.activeColorTheme.kind],
    };
    if (config.preset) {
      for (const [name, value] of Object.entries(config.preset)) {
        if (
          // SVGのプレゼンテーション属性のみ受け付ける
          name in SVG_PRESENTATION_ATTRIBUTES &&
          // 値は文字列/数値のみ
          (typeof value === 'string' || typeof value === 'number')
        ) {
          // fast-xml-parserに指定したプリフィックスをつける
          this.preset[`$$${name}`] = value;
        }
      }
    }
  }

  private clearTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  private update(editor: vscode.TextEditor | undefined) {
    this.clearTimeout();
    if (!editor) {
      return;
    }
    editor.setDecorations(this.decorationType, [
      ...this.svgPreviewDecorations(editor.document),
    ]);
  }
  private updateVisibleEditors() {
    const oldCache = this.urlCache;
    this.reset();
    for (const editor of vscode.window.visibleTextEditors) {
      if (!oldCache.has(editor.document)) {
        continue;
      }
      this.update(editor);
    }
  }

  private static readonly IgnoreError = {};

  *svgPreviewDecorations(
    document: vscode.TextDocument,
  ): Generator<vscode.DecorationOptions, void, undefined> {
    const previousMap = this.urlCache.get(document);
    const nextMap = new Map<string, string>();
    let comingNew = false;
    for (const { index, 0: match } of document
      .getText()
      .matchAll(
        /<svg.*?>.*?<\/svg>|\bdata:image\/\w+(?:\+\w+)?;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}[A-Za-z0-9+/=]=)?/gs,
      )) {
      const normalized = match.startsWith('data:')
        ? // dataスキームはキャッシュ対象外
          undefined
        : // タグ前後の空白を除去したものをキャッシュのキーにする
          match.replace(/(?<=>)\s+|\s+(?=<)/g, '');
      try {
        const url = (() => {
          // dataスキームはそのまま使用
          if (!normalized) {
            return match;
          }
          // キャッシュにあればそちらを使う
          const cached = previousMap?.get(normalized);
          if (cached) {
            if (cached === 'error') {
              // 前回何らかの問題があったものは最初からエラーにする
              throw SvgPreviewOnCode.IgnoreError;
            }
            nextMap.set(normalized, cached);
            return cached;
          }
          // 無ければsvgをparse
          const svg = (() => {
            try {
              return this.parser.parse(normalized);
            } catch {
              // parseで発生するエラーは無視するエラーに置き換えて投げ直す
              throw SvgPreviewOnCode.IgnoreError;
            }
          })();
          // ルートsvg要素の属性だけを操作する
          const svgAttributes = svg[0][':@'];
          if (svgAttributes.$$xmlns !== 'http://www.w3.org/2000/svg') {
            // 名前空間がSVGのものでなければ無視する
            throw SvgPreviewOnCode.IgnoreError;
          }
          const width = Number(svgAttributes.$$width) || undefined;
          const height = Number(svgAttributes.$$height) || undefined;
          const [$$width, $$height] =
            !width || !height
              ? [this.size, this.size]
              : width < height
                ? [(width / height) * this.size, this.size]
                : [this.size, (height / width) * this.size];

          svg[0][':@'] = {
            // svg要素に属性を追加
            ...this.preset,
            // 元々指定されている属性が優先
            ...svgAttributes,
            // sizeに合わせて調整した幅と高さを優先
            $$width,
            $$height,
          };
          // Base64エンコードしてDataスキームURIにする
          const newUrl = `data:image/svg+xml;base64,${Buffer.from(
            this.builder.build(svg),
          ).toString('base64')}`;
          // 生成した画像URLはキャッシュしておく
          nextMap.set(normalized, newUrl);
          comingNew = true;
          return newUrl;
        })();
        // svgもしくはDataスキームURIの範囲にプレビューを追加
        const start = document.positionAt(index);
        const end = document.positionAt(index + match.length);
        const range = new vscode.Range(start, end);
        // supportHtmlを有効にしてimgタグをMarkdown文字列として追加
        const hoverMessage = new vscode.MarkdownString();
        hoverMessage.supportHtml = true;
        hoverMessage.supportThemeIcons = true;
        hoverMessage.isTrusted = {
          enabledCommands: ['workbench.action.openSettings'],
        };
        hoverMessage.appendMarkdown(`
${normalized ? 'SVG' : 'Data URL'} Preview

![](${url})

[$(gear)](command:workbench.action.openSettings?["@ext:sugoroku-y.svg-preview-on-code"])
`);
        yield { range, hoverMessage };
      } catch (ex) {
        if (normalized) {
          // 生成失敗したこともキャッシュする
          nextMap.set(normalized, 'error');
          comingNew = true;
        }
        if (ex !== SvgPreviewOnCode.IgnoreError) {
          // 無視するエラーでなくてもログに出すだけ
          console.error(ex);
        }
      }
    }
    if (nextMap.size) {
      if (comingNew || nextMap.size !== previousMap?.size) {
        // 変化があったときだけ更新
        this.urlCache.set(document, nextMap);
      }
    } else if (previousMap) {
      // ひとつも無くなったら削除
      this.urlCache.delete(document);
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  new SvgPreviewOnCode().activate(context);
}

export function deactivate() {}

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
