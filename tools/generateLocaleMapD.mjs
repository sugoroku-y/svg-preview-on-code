// @ts-check
import { readFile, writeFile, readdir } from 'fs/promises';
(async () => {
  /** @type {Record<string, string>} */
  const localeMap = {};
  for (const name of await readdir('.')) {
    if (!/^package\.nls(?:\.\w+)?\.json$/.test(name)) {
      continue;
    }
    Object.assign(localeMap, JSON.parse(await readFile(name, 'utf8')));
  }
  const content = `
// このファイルは自動生成するので手動では編集せず
// package.nls.jsonなどを編集したあと、
// \`npm run precompile\`を実行すること
export type LocaleMapKey =${Object.keys(localeMap)
    .map(
      (key) => `
  | '${key}'`,
    )
    .join('')};
export type LocaleMap = Record<LocaleMapKey, string>;
`.slice(1);
  await writeFile('src/LocaleMap.d.ts', content);
})();
