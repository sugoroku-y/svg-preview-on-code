// @ts-check
/** @import {LocalizeFunction, LocalizeParameter, ValidationLocaleMaps} from './LocaleMap' */

const { existsSync } = require('fs');
const { readFile, mkdir, writeFile } = require('fs/promises');
const { dirname, extname } = require('path');
const { launch } = require('puppeteer');
const yargs = require('yargs');

/**
 *
 * @template {Record<string, Record<string, string>>} MAPS
 * @param {ValidationLocaleMaps<MAPS>} map
 * @param {string} [locale]
 * @returns {LocalizeFunction<MAPS>}
 */
function localizer(map, locale) {
  localize.locale = locale;
  return localize;

  /**
   * @template {keyof MAPS[keyof MAPS] & string} KEY
   * @param {KEY} message
   * @param {LocalizeParameter<KEY>} _
   */
  function localize(message, ...[params]) {
    const locale = localize.locale ?? '';
    const language = locale.match(/^(\w+)(?=_)/)?.[0] ?? '';
    const localeMap = map[locale];
    const languageMap = map[language];
    const localized = localeMap?.[message] ?? languageMap?.[message] ?? message;
    return localized.replace(/\$(?:\$|\{([^${}]*)\})/g, (match, key) =>
      key ? (params?.[key] ?? '') : match === '$$' ? '$' : match,
    );
  }
}

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
localize.locale = yargs.locale();

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
    if (
      // chromeで扱える画像ファイルの拡張子でなければエラー
      !/\.(?:xbm|tif|jfif|ico|tiff|gif|svgz?|p?jpe?g|webp|a?png|bmp|pjp|avif)$/i.test(
        source,
      )
    ) {
      throw new Error(
        localize('Unsupported the image type: ${type}', { type: source }),
      );
    }
    if (destination) {
      const match = /\.(png|jpe?g|webp)$/i.exec(destination);
      if (!match) {
        throw new Error(
          localize('Unsupported the image type: ${type}', {
            type: destination,
          }),
        );
      }
      if (type && type.charAt(0) !== match[1].charAt(0).toLowerCase()) {
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
  const type =
    _type ??
    (_destination
      ? // destinationが指定されていればその拡張子から種類を判別
        /\.png$/i.test(_destination)
        ? 'png'
        : /\.jpe?g$/i.test(_destination)
          ? 'jpeg'
          : /\.webp$/i.test(_destination)
            ? 'webp'
            : // yargsのcheckでdestinationの拡張子をチェックしているのでここには来ない
              error`unreachable`
      : // destinationが指定されていなければPNG
        'png');
  const destination =
    _destination ?? // destinationが指定されていなければsourceの拡張子をtypeにあわせて変更
    source.replace(
      /\.\w+$/i,
      { png: '.png', webp: '.webp', jpeg: '.jpg' }[type],
    );
  if (destination === source) {
    throw new Error(
      localize(
        'The source and destination files are identical. Please specify a different name for the files.: ${source}',
        { source },
      ),
    );
  }
  const [, width, height = width] =
    (size && /^(\d+)(?:x(\d+))?$/.exec(size)) || [];
  // puppeteerの準備
  const browser = await launch();
  const page = await browser.newPage();
  console.log(localize('loading the image file: ${source}', { source }));
  const sourceType =
    source.match(/(?<=\.)\w+$/i)?.[0].toLowerCase() ??
    // sourceの拡張子チェックはyargsのcheckで行っているのでここには来ない
    error`unreachable`;
  const svgUrl = dataUrl(
    `image/${{ svg: 'svg+xml', jpg: 'jpeg' }[sourceType] ?? sourceType}`,
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
 * @param {[TemplateStringsArray, ...unknown[]]} args
 * @returns {never}
 */
function error(...args) {
  throw new Error(args[0].reduce((r, e, i) => `${r}${args[i]}${e}`));
}

/**
 * @param {string} type
 * @param {string | Uint8Array} source
 * @returns
 */
function dataUrl(type, source) {
  return `data:${type};base64,${Buffer.from(source).toString('base64')}`;
}
