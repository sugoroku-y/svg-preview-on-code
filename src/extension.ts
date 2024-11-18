import * as vscode from 'vscode';
import { SvgPreviewOnCode } from './SvgPreviewOnCode';

export function activate(context: vscode.ExtensionContext) {
  const extension = new SvgPreviewOnCode();
  extension.activate(context);
  return extension;
}

export function deactivate() {}
