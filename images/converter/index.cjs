// @ts-check
const { readFile, rename, rm } = require('fs/promises');
const { join, resolve, dirname } = require('path');
const { launch } = require('puppeteer');
const yargs = require('yargs');

/**
 *
 * @template {Record<string, Record<string, string>>} MAP
 * @param {import('./LocaleMap').ValidationLocaleMaps<MAP>} map
 * @param {string} locale
 * @returns {import('./LocaleMap').Localizer<MAP>}
 */
function localizer(map, locale) {
  localize.locale = locale;
  function localize(message, params) {
    const localeMap = map[localize.locale];
    const languageMap = map[localize.locale.match(/^(\w+)(?=_)/)?.[0] ?? ''];
    const localized = localeMap?.[message] ?? languageMap?.[message] ?? message;
    return localized.replace(/\$(?:\$|\{([^${}]*)\})/g, (_, key) =>
      key != null ? (params?.[key] ?? '') : '$',
    );
  }
  return localize;
}

const localize = localizer(
  {
    ja: {
      'convert svg file to png file': 'SVGファイルをPNG画像に変換します',
      'The source SVG file to be converted from.': '変換元のSVGファイル。',
      'The destination PNG file to be converted to.\nIf omitted, use the filename with the extension of the source changed to png.':
        '変換先のPNGファイル。\n省略時は変換元の拡張子をpngに変更したファイル名を使用します。',
      'The size of the PNG image': 'PNG画像のサイズ',
      'Invalid size(${size}): Please specify in WxH format':
        '不正なサイズです(${size}): WxH形式で指定してください。',
      'The source file is not SVG: ${source}':
        '変換元ファイルがSVGではありません: ${source}',
      'The destination file is not PNG: ${destination}':
        '変換先ファイルがPNGではありません: ${destination}',
      'loading HTML complete': 'HTMLの読み込みが完了しました',
      'file selector not found': 'ファイル選択フィールドが見つかりません',
      'loading svg file: ${source}': 'SVGファイルを読み込んでいます: ${source}',
      'download link not found': 'ダウンロードリンクが見つかりません',
      'converted svg file to: ${destination}':
        'SVGファイルをPNGファイルに変換しました: ${destination}',
      'download canceled': 'ダウンロード中止',
    },
  },
  yargs.locale(),
);

const args = yargs
  .command(
    '* <source> [<destination>]',
    localize('convert svg file to png file'),
  )
  .positional('source', {
    type: 'string',
    describe: localize('The source SVG file to be converted from.'),
    demandOption: true,
  })
  .positional('destination', {
    type: 'string',
    describe: localize(
      'The destination PNG file to be converted to.\nIf omitted, use the filename with the extension of the source changed to png.',
    ),
    demandOption: false,
  })
  .options({
    size: {
      type: 'string',
      describe: localize('The size of the PNG image'),
      default: '192x192',
      group: 'Images',
    },
  })
  .version(false)
  .strict()
  .check(({ size, source, destination }) => {
    if (!/^\d+(?:x\d+)?$/.test(size)) {
      throw new Error(
        localize('Invalid size(${size}): Please specify in WxH format', {
          size,
        }),
      );
    }
    if (!/\.svg$/i.test(source)) {
      throw new Error(
        localize('The source file is not SVG: ${source}', { source }),
      );
    }
    if (destination && !/\.png$/i.test(destination)) {
      throw new Error(
        localize('The destination file is not PNG: ${destination}', {
          destination,
        }),
      );
    }
    return true;
  })
  .parseSync();

(async () => {
  const {
    source,
    destination = source.replace(/\.svg$/i, '.png'),
    size,
  } = args;
  const [, width, height = width] =
    /^(\d+)(?:x(\d+))?$/.exec(size) ??
    (() => {
      // 正規表現でのチェックはyargs内で行っているのでここには来ない
      throw new Error('unreachable');
    })();
  // puppeteerの準備
  const browser = await launch();
  const page = await browser.newPage();
  await page.goto(
    // dataスキームURLでローカルのファイルを読み込む
    `data:text/html;base64,${(await readFile(join(__dirname, 'index.html'))).toString('base64')}`,
  );
  console.log(localize('loading HTML complete'));
  // 画像サイズを指定($evalで一旦クリアしてからtypeで入力)
  await page.$eval('input#width', (element) => {
    element.value = '';
  });
  await page.type('input#width', width);
  await page.$eval('input#height', (element) => {
    element.value = '';
  });
  await page.type('input#height', height);
  const file = await page.$('input#file');
  if (!file) {
    throw new Error(localize('file selector not found'));
  }
  // フォーカスを移動させないとサイズが反映されない
  await file.focus();
  console.log(`size: ${width}x${height}`);
  // ファイルの選択
  await file.uploadFile(resolve(source));
  console.log(localize('loading svg file: ${source}', { source }));
  // 変換した画像をダウンロード
  const download = await page.waitForSelector('a[href]#download');
  if (!download) {
    throw new Error(localize('download link not found'));
  }
  await downloadFile(page, download, resolve(destination));
  console.log(
    localize('converted svg file to: ${destination}', { destination }),
  );
  // 後始末
  await page.close();
  await browser.close();
  process.exit(0);
})();

/**
 *
 * @param {import('puppeteer').Page} page
 * @param {import('puppeteer').ElementHandle<HTMLAnchorElement>} download
 * @param {string} destination
 */
async function downloadFile(page, download, destination) {
  const downloadPath = dirname(destination);
  // ダウンロード先指定やダウンロード完了のイベントの準備
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {
    // allowAndNameを指定すると`${downloadPath}/${params.guid}`に保存される
    behavior: 'allowAndName',
    downloadPath,
    // イベントBrowser.downloadProgressを発行する
    eventsEnabled: true,
  });
  // ダウンロード
  const [guid] = await Promise.all([downloading(cdp), download.click()]);
  // 既に存在していれば削除
  // - forceを指定しているので存在していなくてもエラーにならない
  // - recursiveを指定しているので同名のフォルダが存在していても削除できる
  // - 同名のファイル/フォルダが使用中の場合はエラー
  await rm(destination, { recursive: true, force: true });
  // 存在していない状態にできたらリネーム
  await rename(join(downloadPath, guid), destination);
}

/**
 *
 * @param {import('puppeteer').CDPSession} cdp
 * @returns {Promise<string>}
 */
function downloading(cdp) {
  return new Promise((resolve, reject) => {
    cdp.on('Browser.downloadProgress', (params) => {
      switch (params.state) {
        case 'completed':
          // ダウンロード完了後のファイルをリネームするために必要なのでguidを返す
          resolve(params.guid);
          break;
        case 'canceled':
          reject(new Error(localize('download canceled')));
          break;
        case 'inProgress':
          if (
            params.totalBytes !== 0 &&
            params.receivedBytes < params.totalBytes
          ) {
            console.log(`${params.receivedBytes}/${params.totalBytes}`);
          }
          break;
      }
    });
  });
}
