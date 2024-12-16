import { type ExtensionContext } from 'vscode';
import { SvgPreviewOnCode } from './SvgPreviewOnCode';

/**
 * VSCode拡張のエントリポイント
 */
export function activate(context: ExtensionContext) {
  return new SvgPreviewOnCode(context);
}

/**
 * VSCode拡張の後始末
 */
export function deactivate() {}
