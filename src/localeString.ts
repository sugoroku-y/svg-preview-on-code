/* eslint-disable @typescript-eslint/no-require-imports */
import * as vscode from 'vscode';

let cache: Record<string, string>;
let language: string;

export function localeString(key: string): string {
  if (language !== vscode.env.language) {
    language = vscode.env.language;
    cache = {
      ...(require('../package.nls.json') as Record<string, string>),
      ...(() => {
        try {
          // 多言語対応していれば読み込み
          return require(`../package.nls.${language}.json`) as Record<
            string,
            string
          >;
        } catch (ex) {
          if (
            ex instanceof Error &&
            'code' in ex &&
            ex.code === 'MODULE_NOT_FOUND'
          ) {
            // package.nls.*.jsonが見つからないエラーは無視
            return;
          }
          /* c8 ignore next 4 MODULE_NOT_FOUND以外の例外をテストで発生させられないのでカバレッジ計測からは除外 */
          // その他のエラーはログを出して投げ直す
          console.error(ex);
          throw ex;
        }
      })(),
    };
  }
  return cache[key];
}
