// @ts-check
const { existsSync } = require('fs');
const { readFile, mkdir, writeFile } = require('fs/promises');
const { dirname } = require('path');
const { launch } = require('puppeteer');
const yargs = require('yargs');

/**
 *
 * @template {Record<string, Record<string, string>>} MAP
 * @param {import('./LocaleMap').ValidationLocaleMaps<MAP>} map
 * @param {string} [locale]
 * @returns {import('./LocaleMap').LocalizeFunction<MAP>}
 */
function localizer(map, locale) {
  localize.locale = locale;
  return localize;

  /**
   * @template {keyof MAP[keyof MAP] & string} KEY
   * @param {KEY} message
   * @param {import('./LocaleMap').LocalizeParameter<KEY>} _
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
    'Convert the SVG file to a specified type of image file.':
      'SVGファイルを指定されたタイプの画像ファイルに変換します。',
    'The source SVG file to be converted from.': '変換元のSVGファイル。',
    'The destination image file to be converted to.\nIf omitted, use the filename of source with the extension changed according to the image type.':
      '変換先の画像ファイル。\n省略時は拡張子を画像の種類に応じて変更したソースのファイル名を使用します。',
    'The size of the image': '画像のサイズ',
    'The type of the image': '画像の種類',
    'Invalid size(${size}): Please specify in WxH format':
      '不正なサイズです(${size}): WxH形式で指定してください。',
    'The source file is not SVG: ${source}':
      '変換元ファイルがSVGではありません: ${source}',
    'The destination file is not ${type}: ${destination}':
      '変換先ファイルが${type}ではありません: ${destination}',
    'loading the svg file: ${source}':
      'SVGファイルを読み込んでいます: ${source}',
    'converted the svg file to ${type}: ${destination}':
      'SVGファイルを${type}ファイルに変換しました: ${destination}',
    'The source file not found: ${source}':
      '変換元ファイルが見つかりません: ${source}',
    'Failed to create directory: ${directory}':
      'ディレクトリの作成に失敗しました: ${directory}',
    'Failed to load the SVG file: ${source}':
      'SVGファイルの読み込みに失敗しました: ${source}',
    'Failed to write the image file: ${destination}':
      '画像ファイルの書き込みに失敗しました: ${destination}',
    'Unsupported the image type: ${type}':
      'サポートされていない画像の種類です: ${type}',
  },
});
localize.locale = yargs.locale();

const args = yargs
  .command(
    '* <source> [<destination>]',
    localize('Convert the SVG file to a specified type of image file.'),
  )
  .positional('source', {
    type: 'string',
    describe: localize('The source SVG file to be converted from.'),
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
      default: '192x192',
      group: 'Images',
    },
    type: {
      type: 'string',
      describe: localize('The type of the image'),
      default: 'png',
      choices: ['webp', 'jpeg', 'png'],
      group: 'Images',
    },
  })
  .version(false)
  .strict()
  .check(({ size, type, source, destination }) => {
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
    if (
      destination &&
      !{ png: /\.png$/i, jpeg: /\.jpe?g$/i, webp: /\.webp$/i }[type].test(
        destination,
      )
    ) {
      throw new Error(
        localize('The destination file is not ${type}: ${destination}', {
          destination,
          type,
        }),
      );
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
  console.log();
  const {
    source,
    type,
    destination = source.replace(
      /\.svg$/i,
      { png: '.png', webp: '.webp', jpeg: '.jpg' }[type],
    ),
    size,
  } = args;
  const [, width, height = width] =
    /^(\d+)(?:x(\d+))?$/.exec(size) ??
    // 正規表現でのチェックはyargs内で行っているのでここには来ない
    error`unreachable`;
  // puppeteerの準備
  const browser = await launch();
  const page = await browser.newPage();
  console.log(localize('loading the svg file: ${source}', { source }));
  // SVGの読み込みとキャンバスのサイズ指定
  await page.goto(
    dataUrl(
      'text/html',
      /* html */ `
      <html>
        <body>
          <img src="${dataUrl(
            'image/svg+xml',
            await readFile(source).catch((cause) => {
              throw new Error(
                localize('Failed to load the SVG file: ${source}', { source }),
                { cause },
              );
            }),
          )}"/>
          <canvas width="${width}" height="${height}"></canvas>
        </body>
      </html>
    `,
    ),
  );
  console.log(
    localize('Convert the SVG file to a specified type of image file.'),
  );
  // svgをキャンバスに描画してDataURLに変換
  const pngUrl = await page.$eval(
    'canvas',
    (canvas, type) => {
      const context = canvas.getContext('2d') ?? error`unreachable`;
      context.clearRect(0, 0, canvas.width, canvas.height);
      const [image] = document.getElementsByTagName('img');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL(`image/${type}`);
    },
    type,
  );
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
    localize('converted the svg file to ${type}: ${destination}', {
      destination,
      type,
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
