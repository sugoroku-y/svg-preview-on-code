/* eslint-disable @typescript-eslint/no-require-imports */
import * as vscode from 'vscode';
import type { LocaleMap, LocaleMapKey } from './LocaleMap';

let cache: LocaleMap;
let language: string;

export function localeString(key: LocaleMapKey): string {
  if (language !== vscode.env.language) {
    language = vscode.env.language;
    cache = {
      ...(require('../package.nls.json') as LocaleMap),
      ...(() => {
        try {
          // 多言語対応していれば読み込み
          return require(`../package.nls.${language}.json`) as LocaleMap;
        } catch (ex) {
          if (
            ex instanceof Error &&
            'code' in ex &&
            ex.code === 'MODULE_NOT_FOUND'
          ) {
            // package.nls.*.jsonが見つからないエラーは無視
            return;
          }
          // その他のエラーもログを出すだけ
          console.error(
            `Error occurred in loading package.nls.${language}.json:`,
            ex,
          );
        }
      })(),
    };
  }
  return cache[key];
}
