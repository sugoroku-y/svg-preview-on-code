/**
 * SVGのプレゼンテーション属性かどうかを判定するためのテーブル
 * @see {@link https://developer.mozilla.org/ja/docs/Web/SVG/Attribute#プレゼンテーション属性 プレゼンテーション属性}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute#presentation_attributes Presentation Attributes}
 */
const SVG_PRESENTATION_ATTRIBUTES = {
  'alignment-baseline': true,
  'baseline-shift': true,
  clip: true,
  'clip-path': true,
  'clip-rule': true,
  color: true,
  'color-interpolation': true,
  'color-interpolation-filters': true,
  'color-rendering': true,
  cursor: true,
  d: true,
  direction: true,
  display: true,
  'dominant-baseline': true,
  fill: true,
  'fill-opacity': true,
  'fill-rule': true,
  filter: true,
  'flood-color': true,
  'flood-opacity': true,
  'font-family': true,
  'font-size': true,
  'font-size-adjust': true,
  'font-stretch': true,
  'font-style': true,
  'font-variant': true,
  'font-weight': true,
  'glyph-orientation-horizontal': true,
  'glyph-orientation-vertical': true,
  'image-rendering': true,
  'letter-spacing': true,
  'lighting-color': true,
  'marker-end': true,
  'marker-mid': true,
  'marker-start': true,
  mask: true,
  opacity: true,
  overflow: true,
  'pointer-events': true,
  'shape-rendering': true,
  'stop-color': true,
  'stop-opacity': true,
  stroke: true,
  'stroke-dasharray': true,
  'stroke-dashoffset': true,
  'stroke-linecap': true,
  'stroke-linejoin': true,
  'stroke-miterlimit': true,
  'stroke-opacity': true,
  'stroke-width': true,
  'text-anchor': true,
  'text-decoration': true,
  'text-rendering': true,
  transform: true,
  'transform-origin': true,
  'unicode-bidi': true,
  'vector-effect': true,
  visibility: true,
  'word-spacing': true,
  'writing-mode': true,
} as const;
/** SVGのプレゼンテーション属性 */
export type SvgPresentationAttribute = keyof typeof SVG_PRESENTATION_ATTRIBUTES;
/**
 * SVGのプレゼンテーション属性かどうかを判定する
 * @param name 属性名
 * @returns `name`がSVGのプレゼンテーション属性であれば真を返す。
 */
export function isSvgPresentationAttribute(
  name: string,
): name is SvgPresentationAttribute {
  return name in SVG_PRESENTATION_ATTRIBUTES;
}
