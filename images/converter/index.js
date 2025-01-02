// @ts-check
/** @import {LocalizeFunction, LocalizeParameter, ValidationLocaleMaps} from './LocaleMap' */

const { existsSync } = require('fs');
const { readFile, mkdir, writeFile } = require('fs/promises');
const { dirname, extname } = require('path');
const { launch } = require('puppeteer');
const yargs = require('yargs');

/**
 * 指定されたロケールマップからローカライズ関数を生成する。
 *
 * @template {Record<string, Record<string, string>>} MAPS
 * @param {ValidationLocaleMaps<MAPS>} map - ロケールマップ
 * @param {string} [locale] - オプションのロケール
 * @returns {LocalizeFunction<MAPS>} - ローカライズ関数を返す。
 */
function localizer(map, locale) {
  localize.locale = locale;
  return localize;

  /**
   * 指定されたメッセージをローカライズします。
   * @template {keyof MAPS[keyof MAPS] & string} KEY
   * @param {KEY} message - ローカライズするメッセージ
   * @param {LocalizeParameter<KEY>} _ - メッセージのパラメータ
   */
  function localize(message, ...[params]) {
    // ロケールを取得
    const locale = localize.locale ?? '';
    // 言語コードを取得
    const language = locale.match(/^(\w+)(?=_)/)?.[0] ?? '';
    const localeMap = map[locale];
    // ロケールマップと言語マップを取得
    const languageMap = map[language];
    // ローカライズされたメッセージを取得
    const localized = localeMap?.[message] ?? languageMap?.[message] ?? message;
    // メッセージ内のプレースホルダーを置換
    return localized.replace(/\$(?:\$|\{([^${}]*)\})/g, (match, key) =>
      key ? (params?.[key] ?? '') : match === '$$' ? '$' : match,
    );
  }
}

// ローカライズ関数を初期化
const localize = localizer({
  ja: {
    'Convert the image file to a specified type of image file.':
      '画像ファイルを指定されたタイプの画像ファイルに変換します。',
    'The source image file to be converted from.': '変換元の画像ファイル。',
    'The destination image file to be converted to.\nIf omitted, use the filename of source with the extension changed according to the image type.':
      '変換先の画像ファイル。\n省略時は拡張子を画像の種類に応じて変更したソースのファイル名を使用します。',
    'The size of the image': '画像のサイズ',
    'The type of the image': '画像の種類',
    'Invalid size(${size}): Please specify in WxH format':
      '不正なサイズです(${size}): WxH形式で指定してください。',
    'The source file is not supported image type: ${source}':
      '変換元ファイルがサポートしている画像の種類ではありません: ${source}',
    'The destination file is not ${type}: ${destination}':
      '変換先ファイルが${type}ではありません: ${destination}',
    'loading the image file: ${source}':
      'imageファイルを読み込んでいます: ${source}',
    'converted the ${sourceType} file to ${type}: ${destination}':
      '${sourceType}ファイルを${type}ファイルに変換しました: ${destination}',
    'The source file not found: ${source}':
      '変換元ファイルが見つかりません: ${source}',
    'Failed to create directory: ${directory}':
      'ディレクトリの作成に失敗しました: ${directory}',
    'Failed to load the image file: ${source}':
      '画像ファイルの読み込みに失敗しました: ${source}',
    'Failed to write the image file: ${destination}':
      '画像ファイルの書き込みに失敗しました: ${destination}',
    'Unsupported the image type: ${type}':
      'サポートされていない画像の種類です: ${type}',
    'Converting...': '変換中...',
    'The source and destination files are identical. Please specify a different name for the files.: ${source}':
      '変換元と変換先が同じです。別のファイル名を指定してください。: ${source}',
  },
});
// ロケールのデフォルトはyargsのロケールから取得
localize.locale = yargs.locale();

/** 
 * chromeが出力可能な画像の種類とその拡張子のマップ
 * @type {Record<'png' | 'jpeg' | 'webp', {re: RegExp; ext: string}>}
 */
const imageTypes = {
  png: {
    re: /\.png$/i,
    ext: '.png',
  },
  jpeg: {
    re: /\.(?:jpeg?|jpg|jfif?)$/i,
    ext: '.jpg',
  },
  webp: {
    re: /\.webp$/i,
    ext: '.webp',
  },
};

/**
 * chromeが読み込める画像形式の拡張子とMIMEタイプの対応
 */
const mediaTypes = {
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/x-ms-bmp',
  gif: 'image/gif',
  ico: 'image/vnd.microsoft.icon',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  jfif: 'image/jpeg',
  jfi: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  webp: 'image/webp',
  xbm: 'image/x-bitmap',
};

/** コマンドライン引数の解析結果 */
const args = yargs
  .command(
    '* <source> [<destination>]',
    localize('Convert the image file to a specified type of image file.'),
  )
  .positional('source', {
    type: 'string',
    describe: localize('The source image file to be converted from.'),
    demandOption: true,
  })
  .positional('destination', {
    type: 'string',
    describe: localize(
      'The destination image file to be converted to.\nIf omitted, use the filename of source with the extension changed according to the image type.',
    ),
    demandOption: false,
  })
  .options({
    size: {
      type: 'string',
      describe: localize('The size of the image'),
      group: 'Images',
    },
    type: {
      type: 'string',
      describe: localize('The type of the image'),
      choices: ['webp', 'jpeg', 'png'],
      group: 'Images',
    },
  })
  .version(false)
  .strict()
  .check(({ size, type, source, destination }) => {
    if (size && !/^\d+(?:x\d+)?$/.test(size)) {
      throw new Error(
        localize('Invalid size(${size}): Please specify in WxH format', {
          size,
        }),
      );
    }
    // chromeで扱える画像ファイルの拡張子でなければエラー
    if (extname(source).slice(1).toLowerCase() in mediaTypes) {
      throw new Error(
        localize('Unsupported the image type: ${type}', { type: source }),
      );
    }
    if (destination) {
      const destType = Object.entries(imageTypes).find(([, { re }]) =>
        re.test(destination),
      )?.[0];
      if (!destType) {
        throw new Error(
          localize('Unsupported the image type: ${type}', {
            type: destination,
          }),
        );
      }
      if (type && destType !== type) {
        throw new Error(
          localize('The destination file is not ${type}: ${destination}', {
            destination,
            type,
          }),
        );
      }
    }
    if (!existsSync(source)) {
      throw new Error(
        localize('The source file not found: ${source}', { source }),
      );
    }
    return true;
  })
  .parseSync();

(async () => {
  console.log(
    localize('Convert the image file to a specified type of image file.'),
  );
  const { source, type: _type, destination: _destination, size } = args;
  // typeとdestinationについてはyargsでも省略時の値を生成できないのでここで処理
  const type =
    _type ??
    (_destination
      ? // destinationが指定されていればその拡張子から種類を判別
        (Object.entries(imageTypes).find(([, { re }]) =>
          re.test(_destination),
        )?.[0] ??
        // yargsのcheckでdestinationの拡張子をチェックしているのでここには来ない
        error`unreachable`)
      : // destinationが指定されていなければPNG
        'png');
  const destination =
    _destination ?? // destinationが指定されていなければsourceの拡張子をtypeにあわせて変更
    source.replace(/\.\w+$/i, imageTypes[type].ext);
  if (destination === source) {
    throw new Error(
      localize(
        'The source and destination files are identical. Please specify a different name for the files.: ${source}',
        { source },
      ),
    );
  }
  // サイズ指定があれば幅と高さを取得
  const [, width, height = width] =
    (size && /^(\d+)(?:x(\d+))?$/.exec(size)) || [];
  // puppeteerの準備
  const browser = await launch();
  const page = await browser.newPage();
  console.log(localize('loading the image file: ${source}', { source }));
  const svgUrl = dataUrl(
    mediaTypes[extname(source).slice(1).toLowerCase()] ??
      // yargsでチェック済なのでsourceの拡張子はmediaTypesに必ずある
      error`unreachable`,
    await readFile(source).catch((cause) => {
      throw new Error(
        localize('Failed to load the image file: ${source}', { source }),
        { cause },
      );
    }),
  );
  // 空っぽのHTMLを表示
  await page.goto(dataUrl('text/html', '<html><body></body></html>'));
  console.log(localize('Converting...'));
  // 変換元画像をキャンバスに描画してDataURLに変換
  const pngUrl = await page.evaluate(
    async (svgUrl, width, height, type) => {
      const image = new Image();
      image.src = svgUrl;
      try {
        await new Promise(
          /** @param {(v: void) => void} resolve */
          (resolve, reject) => {
            image.addEventListener('load', () => resolve());
            image.addEventListener('error', () => reject(new Error()));
          },
        );
      } catch {
        return { error: 'loading' };
      }
      const canvas = document.createElement('canvas');
      canvas.width = width ? Number(width) : image.naturalWidth;
      canvas.height = height ? Number(height) : image.naturalHeight;
      const context = canvas.getContext('2d') ?? error`unreachable`;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL(`image/${type}`);
    },
    svgUrl,
    width,
    height,
    type,
  );
  if (typeof pngUrl !== 'string') {
    console.log(pngUrl);
    throw new Error(
      localize('Failed to load the image file: ${source}', { source }),
    );
  }
  const [, destinationType, data] =
    /^data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/]+=*)$/.exec(pngUrl) ??
    error`Unsupported url: ${pngUrl}`;
  if (destinationType !== type) {
    throw new Error(localize('Unsupported the image type: ${type}', { type }));
  }
  // DataURLからデコードしてファイルに保存
  const directory = dirname(destination);
  try {
    await mkdir(directory, { recursive: true });
  } catch (cause) {
    throw new Error(
      localize('Failed to create directory: ${directory}', { directory }),
      { cause },
    );
  }
  try {
    await writeFile(destination, Buffer.from(data, 'base64'));
  } catch (cause) {
    throw new Error(
      localize('Failed to write the image file: ${destination}', {
        destination,
      }),
      { cause },
    );
  }
  console.log(
    localize('converted the ${sourceType} file to ${type}: ${destination}', {
      destination,
      type,
      sourceType: extname(source).slice(1).toLowerCase(),
    }),
  );
  // 後始末
  await page.close();
  await browser.close();
  process.exit(0);
})();

/**
 * 例外を発生させるタグ付きテンプレートリテラル
 * @param {[TemplateStringsArray, ...unknown[]]} args
 * @returns {never}
 */
function error(...args) {
  throw new Error(args[0].reduce((r, e, i) => `${r}${args[i]}${e}`));
}

/**
 * Data URLを生成する
 * @param {string} type
 * @param {string | Uint8Array} source
 * @returns
 */
function dataUrl(type, source) {
  return `data:${type};base64,${Buffer.from(source).toString('base64')}`;
}
