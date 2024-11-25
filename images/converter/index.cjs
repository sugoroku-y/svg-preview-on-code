// @ts-check
const { readFile, rename, rm } = require('fs/promises');
const { join, resolve, dirname } = require('path');
const { launch } = require('puppeteer');
const yargs = require('yargs');

const args = yargs
  .command('* <source> [<destination>]', 'convert svg file to png file')
  .positional('source', {
    type: 'string',
    describe: 'The source SVG file to be converted from.',
    demandOption: true,
  })
  .positional('destination', {
    type: 'string',
    describe: 'The destination PNG file to be converted to.',
    demandOption: false,
  })
  .options({
    size: {
      type: 'string',
      describe: 'The size of the PNG image',
      demandOption: true,
      default: '192x192',
    },
  })
  .check(({ size, source, destination }) => {
    if (!/^\d+(?:x\d+)?$/.test(size)) {
      throw new Error(`Invalid size(${size}): Please specify in WxH format`);
    }
    if (!/\.svg$/i.test(source)) {
      throw new Error(`source file is not SVG: ${source}`);
    }
    if (destination && !/\.png$/i.test(destination)) {
      throw new Error(`destination file is not PNG: ${destination}`);
    }
    return true;
  })
  .parseSync();

(async () => {
  const { source } = args;
  const destination = args.destination ?? source.replace(/\.svg$/i, '.png');
  const [, width, height = width] =
    /^(\d+)(?:x(\d+))?$/.exec(args.size) ??
    (() => {
      throw new Error('unreachable');
    })();
  // puppeteerの準備
  const browser = await launch({ timeout: 600000 });
  const page = await browser.newPage();
  await page.goto(
    // dataスキームURLでローカルのファイルを読み込む
    `data:text/html;base64,${(await readFile(join(__dirname, 'index.html'))).toString('base64')}`,
  );
  console.log('loading HTML complete');
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
    throw new Error('file selector not found');
  }
  // フォーカスを移動させないとサイズが反映されない
  await file.focus();
  console.log(`size: ${width}x${height}`);
  // ファイルの選択
  await file.uploadFile(resolve(source));
  console.log('loading svg file:', source);
  // 変換した画像をダウンロード
  const download = await page.waitForSelector('a[href]#download');
  if (!download) {
    throw new Error('download link not found');
  }

  await downloadFile(page, download, resolve(destination));
  console.log('converted svg file to:', destination);
  // 後始末
  await page.close();
  await browser.close();
  process.exit(0);

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
    // ダウンロード開始
    const [guid] = await Promise.all([
      new Promise(
        /**
         * @param {(value: string) => unknown} rslv
         * @param {(ex: unknown) => unknown} rjct
         */
        (rslv, rjct) => {
          cdp.on('Browser.downloadProgress', (params) => {
            switch (params.state) {
              case 'completed':
                // ダウンロード完了後のファイルをリネームするために必要なのでguidを返す
                rslv(params.guid);
                break;
              case 'canceled':
                rjct(new Error('download canceled'));
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
        },
      ),
      download.click(),
    ]);
    // 既に存在していれば削除
    // - forceを指定しているので存在していなくてもエラーにならない
    // - recursiveを指定しているので同名のフォルダが存在していても削除できる
    // - 同名のファイル/フォルダが使用中の場合はエラー
    await rm(destination, { recursive: true, force: true });
    // 存在していない状態にできたらリネーム
    await rename(join(downloadPath, guid), destination);
  }
})();
