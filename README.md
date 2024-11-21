# SVG Preview on code

An extension to preview SVG on the editor of VS Code.

VS Codeのエディター上でSVGをプレビューするための拡張です。

![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/sugoroku-y.svg-preview-on-code)
![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/sugoroku-y.svg-preview-on-code)
[![TypeScript](https://img.shields.io/badge/-TypeScript-404040.svg?logo=TypeScript)](https://www.typescriptlang.org/)
[![JavaScript](https://img.shields.io/badge/-JavaScript-404040.svg?logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](./LICENSE)
[![Coverage Status](https://coveralls.io/repos/github/sugoroku-y/svg-preview-on-code/badge.svg)](https://coveralls.io/github/sugoroku-y/svg-preview-on-code)
[![TEST](https://github.com/sugoroku-y/svg-preview-on-code/actions/workflows/test.yml/badge.svg)](https://github.com/sugoroku-y/svg-preview-on-code/actions/workflows/test.yml)
[![Deploy Extension](https://github.com/sugoroku-y/svg-preview-on-code/actions/workflows/deploy.yml/badge.svg)](https://github.com/sugoroku-y/svg-preview-on-code/actions/workflows/deploy.yml)

## Features

Bring the mouse cursor over the SVG present in the editor to see a preview.

エディターに存在するSVGの上にマウスカーソルを持っていくとプレビューを表示します。

![svg](images/svg.png)

In addition, data scheme URLs are also supported.

ついでにdataスキームURLにも対応しています。

![data scheme](images/data-scheme.png)

## Extension Settings

This extension contributes the following settings:

このエクステンションは以下の設定に対応しています。

- `svg-preview-on-code.disable`:

  Turn ON to disable this extension.

   You can also enable or disable this extension on a language-by-language basis. For example, to disable it for HTML, set the following

  この拡張を無効にするときにはONにします。

  言語ごとにこの拡張の有効無効を切り替えることもできます。たとえばHTMLのときには無効にする場合は以下のように設定します。

  ```json
  "[html]": {
    "svg-preview-on-code.disable": true
  },
  ```

- `svg-preview-on-code.preset`:

  Attributes that are set by default for svg elements.

  If there are properties that are reflected even if they are not specified in the attribute due to CSS or other reasons, they should be described.

  svg要素にデフォルトで設定される属性です。

  CSSなどにより属性に指定していなくても反映されるプロパティがあれば記述します。

  For example, if you specify the following in CSS:

  たとえばCSSで以下のように指定している場合:

  ```css
  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  ```

  If you specify the following in `svg-preview-on-code.preset`, it will be displayed almost like the actual one:

  `svg-preview-on-code.preset`に以下のように指定するとほぼ実際のものと同じように表示されます。

  ```json
  "svg-preview-on-code.preset": {
    "fill": "none",
    "stroke": "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  }
  ```

- `svg-preview-on-code.size`:

  Specifies the size of the preview. If omitted, the image will be displayed in its original size as much as possible.

  プレビューのサイズを指定します。省略時にはできるだけ元の画像のサイズで表示します。

- `svg-preview-on-code.currentColor`

  Specifies the color to draw the area in the svg where currentColor is specified.

  svg内でcurrentColorが指定された箇所を描画する色を指定します。

  省略した場合、ダークモードのときには白、ライトモードのときには黒を使用します。

Click on the ⚙ icon below the preview to open these settings screens.

プレビューの下にある⚙のアイコンをクリックするとこれらの設定画面が開きます。
