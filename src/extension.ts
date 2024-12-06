import * as vscode from 'vscode';
import { SvgPreviewOnCode } from './SvgPreviewOnCode';

/**
 * VSCode拡張のエントリポイント
 */
export function activate(context: vscode.ExtensionContext) {
  const extension = new SvgPreviewOnCode();
  extension.activate(context);
  return extension;
}

/**
 * VSCode拡張の後始末
 */
export function deactivate() {}
