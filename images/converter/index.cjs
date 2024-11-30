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
  /** @type {import('./LocaleMap').LocalizeFunction<MAP>} */
  const localize = (message, ...[params]) => {
    const locale = localize.locale ?? '';
    const language = locale.match(/^(\w+)(?=_)/)?.[0] ?? '';
    const localeMap = map[locale];
    const languageMap = map[language];
    const localized = localeMap?.[message] ?? languageMap?.[message] ?? message;
    return localized.replace(/\$(?:\$|\{([^${}]*)\})/g, (match, key) =>
      key ? (params?.[key] ?? '') : match === '$$' ? '$' : match,
    );
  };
  localize.locale = locale;
  return localize;
}

const localize = localizer({
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
    'loading svg file: ${source}': 'SVGファイルを読み込んでいます: ${source}',
    'converted svg file to png: ${destination}':
      'SVGファイルをPNGファイルに変換しました: ${destination}',
    'The source file not found: ${source}':
      '変換元ファイルが見つかりません: ${source}',
    'Failed to create directory: ${directory}':
      'ディレクトリの作成に失敗しました: ${directory}',
    'Failed to load SVG file: ${source}':
      'SVGファイルの読み込みに失敗しました: ${source}',
    'Failed to write PNG file: ${destination}':
      'PNGファイルの書き込みに失敗しました: ${destination}',
  },
});
localize.locale = yargs.locale();

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
  console.log(localize('loading svg file: ${source}', { source }));
  // SVGの読み込みとキャンバスのサイズ指定
  await page.goto(
    `data:text/html;base64,${Buffer.from(
      /* html */ `
      <html>
        <body>
          <img src="data:image/svg+xml;base64,${Buffer.from(
            await readFile(source).catch((cause) => {
              throw new Error(
                localize('Failed to load SVG file: ${source}', { source }),
                { cause },
              );
            }),
          ).toString('base64')}"/>
          <canvas width="${width}" height="${height}"></canvas>
        </body>
      </html>
    `,
    ).toString('base64')}`,
  );
  console.log(localize('convert svg file to png file'));
  // svgをキャンバスに描画してPNGのDataURLに変換
  const pngUrl = await page.$eval('canvas', (canvas) => {
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    const [image] = document.getElementsByTagName('img');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
  });
  assert(pngUrl);
  const [data] =
    /(?<=^data:image\/png;base64,)[A-Za-z0-9+/]+=*$/.exec(pngUrl) ?? [];
  assert(data);
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
      localize('Failed to write PNG file: ${destination}', { destination }),
      { cause },
    );
  }
  console.log(
    localize('converted svg file to png: ${destination}', { destination }),
  );
  // 後始末
  await page.close();
  await browser.close();
  process.exit(0);
})();

/**
 * @param {unknown} o
 * @returns {asserts o}
 */
function assert(o) {
  if (!o) {
    throw new Error();
  }
}
