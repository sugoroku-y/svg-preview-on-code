import {
  type DecorationOptions,
  type ExtensionContext,
  type TextDocument,
  type TextEditor,
  ColorThemeKind,
  MarkdownString,
  Range,
  WorkspaceConfiguration,
  window,
  workspace,
} from 'vscode';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import {
  isSvgPresentationAttribute,
  type SvgPresentationAttribute,
} from './SvgPresentationAttribute';
import { localeString } from './localeString';

type UnionToIntersection<U> = (U extends U ? (a: U) => 0 : never) extends (
  a: infer R,
) => 0
  ? R
  : never;
type TypedConfiguration<T extends object> = Readonly<Partial<T>> &
  UnionToIntersection<
    {
      [K in keyof T]: {
        get(section: K): T[K] | undefined;
        get(section: K, defaultValue: T[K]): T[K];
      };
    }[keyof T]
  > &
  WorkspaceConfiguration;
type Configuration = TypedConfiguration<{
  disable: boolean;
  preset: Record<string, string | number>;
  currentColor: string;
  size: number;
}>;

export class SvgPreviewOnCode {
  private readonly id: string;
  private readonly section: string;
  private urlCache!: WeakMap<TextDocument, Map<string, string>>;
  private preset!: Partial<
    Record<`$$${SvgPresentationAttribute}`, string | number>
  >;
  private size?: number;
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
  private readonly decorationType = window.createTextEditorDecorationType({});

  constructor(context: ExtensionContext) {
    // この拡張が不要になったときの後始末
    context.subscriptions.push(this);
    // この拡張のID
    this.id = context.extension.id;
    // この拡張の設定上のセクション名
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- extension.idには必ず`.`があるのでnullにはならない
    [this.section] = this.id.match(/(?<=\.).*$/)!;

    // 設定などからの読み込み
    this.reset();
    // プレビューを設定
    this.update(window.activeTextEditor);

    // ドキュメントを切り替え時に再設定
    window.onDidChangeActiveTextEditor(
      (editor) => {
        this.update(editor);
      },
      null,
      context.subscriptions,
    );
    // ドキュメントの変更の場合は0.5秒後に再設定
    workspace.onDidChangeTextDocument(
      (ev) => {
        const editor = window.activeTextEditor;
        if (!editor) {
          return;
        }
        if (ev.document !== editor.document) {
          return;
        }
        // 前回の変更から0.5秒たっていなければタイマーをリセット
        this.clearTimeout();
        // 0.5秒後に再設定
        this.timeout = setTimeout(() => {
          this.update(editor);
        }, 500);
      },
      null,
      context.subscriptions,
    );
    // 配色テーマ切り替えで再設定
    window.onDidChangeActiveColorTheme(
      () => {
        this.updateVisibleEditors();
      },
      null,
      context.subscriptions,
    );
    // 言語の切り替えでも再設定
    workspace.onDidOpenTextDocument(
      (document) => {
        // onDidOpenTextDocumentはドキュメントを開くときだけではなく言語(JavaScriptやCなど)が切り替えられるときにも呼び出される
        // ドキュメントを開くときにはactiveTextEditor.documentは未設定のため、それがイベントのdocumentと一致するなら言語の切り替えと見なすことができる
        if (window.activeTextEditor?.document === document) {
          this.update(window.activeTextEditor);
        }
      },
      null,
      context.subscriptions,
    );
    // 設定値の変更でも再設定
    workspace.onDidChangeConfiguration(
      (e) => {
        if (e.affectsConfiguration(this.section)) {
          this.updateVisibleEditors();
        }
      },
      null,
      context.subscriptions,
    );
  }

  dispose() {
    for (const document of workspace.textDocuments) {
      this.urlCache.delete(document);
    }
    this.decorationType.dispose();
  }

  private getConfiguration(document?: TextDocument) {
    return workspace.getConfiguration(this.section, document) as Configuration;
  }

  private reset() {
    const { size, preset, currentColor } = this.getConfiguration();
    this.size = size;
    this.urlCache = new WeakMap<TextDocument, Map<string, string>>();
    this.preset = {
      // currentColorに使用される色を指定する
      $$color:
        currentColor ||
        {
          [ColorThemeKind.Dark]: 'white',
          [ColorThemeKind.HighContrast]: 'white',
          [ColorThemeKind.Light]: 'black',
          [ColorThemeKind.HighContrastLight]: 'black',
        }[window.activeColorTheme.kind],
    };
    if (preset) {
      for (const [name, value] of Object.entries(preset)) {
        if (
          // SVGのプレゼンテーション属性のみ受け付ける
          isSvgPresentationAttribute(name) &&
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

  private update(editor: TextEditor | undefined) {
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
    for (const editor of window.visibleTextEditors) {
      if (!oldCache.has(editor.document)) {
        continue;
      }
      this.update(editor);
    }
  }

  private static readonly IgnoreError = {} as Error;

  private *svgPreviewDecorations(
    document: TextDocument,
  ): Generator<DecorationOptions, void, undefined> {
    if (this.getConfiguration(document).disable) {
      return;
    }
    const previousMap = this.urlCache.get(document);
    const nextMap = new Map<string, string>();
    let comingNew = false;
    for (const { index, 0: match, 1: svg } of document
      .getText()
      .matchAll(
        /(<svg\s[^>]*>.*?<\/svg>)|\bdata:image\/\w+(?:\+\w+)?;base64,[A-Za-z0-9+/]+=*/gs,
      )) {
      // タグ前後の空白を除去したものをキャッシュのキーにする(dataスキームはキャッシュ対象外)
      const normalized = svg?.replace(/(?<=>)\s+|\s+(?=<)/g, '');
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
              return this.parser.parse(normalized) as [
                {
                  ':@'?: Record<`$$${string}`, string | number>;
                  svg: unknown[];
                },
              ];
            } catch {
              // parseで発生するエラーは無視するエラーに置き換えて投げ直す
              throw SvgPreviewOnCode.IgnoreError;
            }
          })();
          // ルートsvg要素の属性だけを操作する
          const svgAttributes = svg[0][':@'];
          if (svgAttributes?.$$xmlns !== 'http://www.w3.org/2000/svg') {
            // 名前空間がSVGのものでなければ無視する
            throw SvgPreviewOnCode.IgnoreError;
          }
          let size: { $$width: number; $$height: number } | undefined;
          if (this.size) {
            const width = Number(svgAttributes.$$width) || undefined;
            const height = Number(svgAttributes.$$height) || undefined;
            size =
              !width || !height
                ? { $$width: this.size, $$height: this.size }
                : width < height
                  ? {
                      $$width: (width / height) * this.size,
                      $$height: this.size,
                    }
                  : {
                      $$width: this.size,
                      $$height: (height / width) * this.size,
                    };
          }

          svg[0][':@'] = {
            // svg要素に属性を追加
            ...this.preset,
            // 元々指定されている属性が優先
            ...svgAttributes,
            // sizeに合わせて調整した幅と高さを優先
            ...size,
          };
          // Base64エンコードしてDataスキームURIにする
          const newUrl = `data:image/svg+xml;base64,${Buffer.from(
            this.builder.build(svg) as string,
          ).toString('base64')}`;
          // 生成した画像URLはキャッシュしておく
          nextMap.set(normalized, newUrl);
          comingNew = true;
          return newUrl;
        })();
        // svgもしくはDataスキームURIの範囲にプレビューを追加
        const start = document.positionAt(index);
        const end = document.positionAt(index + match.length);
        const range = new Range(start, end);
        // Markdown文字列として追加
        const hoverMessage = [
          new MarkdownString(
            `### ${normalized ? 'SVG' : 'Data URL'} ${localeString('preview.preview')}`,
          ),
          new MarkdownString(`![](${url})`),
        ];
        if (normalized) {
          // 設定のリンクはsvgのときだけ
          const link = new MarkdownString(
            `[$(gear) ${localeString('preview.settings')}](command:workbench.action.openSettings?["@ext:${this.id}"])`,
            true,
          );
          link.isTrusted = {
            enabledCommands: ['workbench.action.openSettings'],
          };
          hoverMessage.push(link);
        }
        yield { range, hoverMessage };
      } catch (ex) {
        if (normalized) {
          // 生成失敗したこともキャッシュする
          nextMap.set(normalized, 'error');
          if (!previousMap?.has(normalized)) {
            comingNew = true;
          }
        }
        /* c8 ignore next 4 IgnoreError以外の例外をテストで発生させられないのでカバレッジ計測からは除外 */
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
