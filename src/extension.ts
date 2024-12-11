import { type ExtensionContext } from 'vscode';
import { SvgPreviewOnCode } from './SvgPreviewOnCode';

/**
 * VSCode拡張のエントリポイント
 */
export function activate(context: ExtensionContext) {
  const extension = new SvgPreviewOnCode();
  extension.activate(context);
  return extension;
}

/**
 * VSCode拡張の後始末
 */
export function deactivate() {}
