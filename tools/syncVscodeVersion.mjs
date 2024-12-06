// @ts-check
import { readFile, writeFile } from 'fs/promises';

(async () => {
  /** @type {{engines:{vscode: string;};devDependencies:{'@types/vscode':string}}} */
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  packageJson.engines.vscode = packageJson.devDependencies['@types/vscode'];
  await writeFile(
    'package.json',
    JSON.stringify(packageJson, undefined, 2).concat('\n'),
    'utf8',
  );
})();
