import * as vscode from 'vscode';

import * as uuid from 'uuid';
import * as path from 'path';
import * as fs from 'fs';

import * as remoteHandler from '../modules/remote-handler';
import * as utils from '../modules/utils';


import { RemoteExecutionMessage, FCommandOutputType } from "../modules/remote-execution";


/**
 *  
 */
function buildDocumentationTableOfContents(filepath: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const buildDocumentationTocScirpt = utils.FPythonScriptFiles.getAbsPath(utils.FPythonScriptFiles.buildDocumentationToC);

        const globals = {
            "outFilepath": filepath
        };

        remoteHandler.executeFile(buildDocumentationTocScirpt, globals, (message: RemoteExecutionMessage) => {
            const outputs = message.getCommandResultOutput();
            for (let output of outputs.reverse()) {
                if (output.type === FCommandOutputType.info) {
                    resolve(output.output.toLowerCase() === "true");
                    return;
                }
            }

            resolve(false);
        });
    });
}

/**
 *  
 */
function buildPageContent(filepath: string, module: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        const getDocPageContentScirpt = utils.FPythonScriptFiles.getAbsPath(utils.FPythonScriptFiles.getDocPageContent);

        const globals = {
            "object": module,
            "outFilepath": filepath
        };

        remoteHandler.executeFile(getDocPageContentScirpt, globals, (message: RemoteExecutionMessage) => {
            const outputs = message.getCommandResultOutput();
            for (let output of outputs.reverse()) {
                if (output.type === FCommandOutputType.info) {
                    resolve(output.output.toLowerCase() === "true");
                    return;
                }
            }

            resolve(false);
        });
    });
}



export class SidebarViewProvier implements vscode.WebviewViewProvider {

    readonly title = "Unreal Engine Python";

    private _view?: vscode.WebviewView;

    private readonly webviewDirectory;
    private readonly pannelName = "sidepanel";

    constructor(
        private readonly _extensionUri: vscode.Uri
    ) {
        this.webviewDirectory = vscode.Uri.joinPath(_extensionUri, 'webview-ui', "build");
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => { this.onDidReceiveMessage(data); });
    }


    public async sendTableOfContents() {
        const filepath = path.join(utils.getExtentionTempDir(), "documentation_toc.json");
        // Build table of content if it doesn't already exists
        if (!fs.existsSync(filepath)) {
            if (!await buildDocumentationTableOfContents(filepath)) {
                return;
            }
        }
        const tableOfContentsString = fs.readFileSync(filepath);
        const data = JSON.parse(tableOfContentsString.toString());

        if (this._view) {
            // this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
            this._view.webview.postMessage({ command: 'getTableOfContents', data: data });
        }

    }


    public async openPage(module: string, property?: string) {
        const filepath = path.join(utils.getExtentionTempDir(), `docpage_${module}.json`);
        if (!fs.existsSync(filepath)) {
            await buildPageContent(filepath, module);
        }
        
        const tableOfContentsString = fs.readFileSync(filepath);
        const data = JSON.parse(tableOfContentsString.toString());

        if (this._view) {
            this._view.webview.postMessage({ command: 'openDocPage', data: {pageData: data, property: property} });
        }
    }


    private onDidReceiveMessage(data: any) {
        switch (data.command) {
            case 'getTableOfContents':
                {
                    this.sendTableOfContents();
                    break;
                }
            case 'getDocPage':
                {
                    this.openPage(data.data.object, data.data.property);
                    break;
                }
            default:
                throw new Error(`Not implemented: ${this.pannelName} recived an unknown command: '${data.command}'`);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview) {
        // Use a nonce to only allow a specific script to be run.
        // const nonce = getNonce();
        const nonce = uuid.v4().replace(/-/g, "");

        const manifest = require(path.join(this.webviewDirectory.fsPath, 'asset-manifest.json'));
        const mainScript = manifest['files']['main.js'];
		const mainStyle = manifest['files']['main.css'];

        // Get default stylesheet
        let stylesheetUris = [];
        stylesheetUris.push(
            webview.asWebviewUri(vscode.Uri.joinPath(this.webviewDirectory, mainStyle))
        );

        let scritpUris = [];
        scritpUris.push(
            webview.asWebviewUri(vscode.Uri.joinPath(this.webviewDirectory, mainScript))
        );

        // Convert style & script Uri's to code
        let styleSheetString = "";
        for (const stylesheet of stylesheetUris) {
            styleSheetString += `<link href="${stylesheet}" rel="stylesheet">\n`;
        }

        let scriptsString = "";
        for (const scriptUri of scritpUris) {
            scriptsString += `<script nonce="${nonce}" src="${scriptUri}"></script>\n`;
        }

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
				${styleSheetString}
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}';style-src vscode-resource: 'unsafe-inline' http: https: data:;">
				<base href="${webview.asWebviewUri(this.webviewDirectory)}/">
			</head>
			<body>
				<noscript>You need to enable JavaScript to run this app.</noscript>
				<div id="root"></div>
				${scriptsString}
			</body>
			</html>`;
    }
}