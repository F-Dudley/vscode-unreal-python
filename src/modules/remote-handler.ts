/**
 * A module handling the connection between Unreal and VSCode
 */

import * as vscode from 'vscode';

import { RemoteExecution, RemoteExecutionConfig } from "unreal-remote-execution";

import * as extensionWiki from "./extension-wiki";
import * as utils from "./utils";

let gCachedRemoteExecution: RemoteExecution | null = null;


/**
 * Get a `RemoteExecutionConfig` based on the extension user settings
 */
function getRemoteConfig() {
    const extensionConfig = utils.getExtensionConfig();

    const multicastTTL: number | undefined = extensionConfig.get("remote.multicastTTL");
    const multicastBindAddress: string | undefined = extensionConfig.get("remote.multicastBindAddress");

    let multicastGroupEndpoint: [string, number] | undefined = undefined;
    const multicastGroupEndpointStr: string | undefined = extensionConfig.get("remote.multicastGroupEndpoint");
    if (multicastGroupEndpointStr) {
        const [multicastGroupStr, portStr] = multicastGroupEndpointStr.split(":", 2);
        multicastGroupEndpoint = [multicastGroupStr, Number(portStr)];
    }

    let commandEndpoint: [string, number] | undefined = undefined;
    const commandEndpointStr: string | undefined = extensionConfig.get("remote.commandEndpoint");
    if (commandEndpointStr) {
        const [commandHost, commandPortStr] = commandEndpointStr.split(":", 2);
        commandEndpoint = [commandHost, Number(commandPortStr)];
    }

    return new RemoteExecutionConfig(multicastTTL, multicastGroupEndpoint, multicastBindAddress, commandEndpoint);
}


/**
 * Make sure the command port is avaliable, and if not it'll try to find a port that's free and modify the port in config to use this new port.
 * @param config The remote execution config
 * @returns A list with 2 elements, the first one is a boolean depending on if a free port was found/assigned to the config. Second element is a error message.
 */
async function ensureCommandPortAvaliable(config: RemoteExecutionConfig): Promise<boolean> {
    const extensionConfig = utils.getExtensionConfig();

    const host = config.commandEndpoint[0];
    const commandEndpointPort = config.commandEndpoint[1];

    // Check if user has enabled 'strictPort' 
    if (extensionConfig.get("strictPort")) {
        if (!await utils.isPortAvailable(commandEndpointPort, host)) {
            vscode.window.showErrorMessage(`Port ${commandEndpointPort} is currently busy. Consider changing the config: 'ue-python.remote.commandEndpoint'.`);
            return false;
        }
    }
    else {
        // Check the next 100 ports, one should hopefully be free
        const freePort = await utils.findFreePort(commandEndpointPort, 101, host);
        if (!freePort) {
            vscode.window.showErrorMessage(`All ports between ${commandEndpointPort} - ${commandEndpointPort + 100} are busy. Consider changing the config: 'ue-python.remote.commandEndpoint'.`);
            return false;
        }

        // If the first found free port wasn't the original port, update it
        if (commandEndpointPort !== freePort) {
            config.commandEndpoint[1] = freePort;
        }
    }

    return true;
}


/**
 * Get the global remote connection instance
 * @param bEnsureConnection If a connection doesn't exists yet, create one.
 */
export async function getRemoteExecutionInstance(bEnsureConnection = true, timeout = 3000) {
    if (bEnsureConnection) {
        if (!gCachedRemoteExecution) {
            const config = getRemoteConfig();
            gCachedRemoteExecution = new RemoteExecution(config);
            await gCachedRemoteExecution.start();
        }

        if (!gCachedRemoteExecution.hasCommandConnection()) {
            const config = getRemoteConfig();
            if (await ensureCommandPortAvaliable(config)) {
                try {
                    await gCachedRemoteExecution.getFirstRemoteNode(timeout);
                } catch (error: any) {
                    console.log(error);

                    const clickedItem = await vscode.window.showErrorMessage(error.message, "Help");
                    if (clickedItem === "Help") {
                        extensionWiki.openPageInBrowser(extensionWiki.FPages.failedToConnect);
                    }
                    // vscode.window.showErrorMessage(error.message);
                    return null;
                }

                const node = await gCachedRemoteExecution.getFirstRemoteNode(timeout);
                await gCachedRemoteExecution.openCommandConnection(node);
            }

        }
        // Make sure the config has a port that isn't taken by something else
    }

    return gCachedRemoteExecution;
}


/**
 * Send a command to the remote connection
 * @param command The python code as a string
 * @param callback The function to call with the response from Unreal
 */
export async function runCommand(command: string) {
    const remoteExec = await getRemoteExecutionInstance();
    if (!remoteExec) {
        return;
    }

    return remoteExec.runCommand(command);
}


/**
 * Execute a file in Unreal through the remote exection
 * @param filepath Absolute filepath to the python file to execute
 * @param variables Optional dict with global variables to set before executing the file
 * @param callback Function to call with the response from Unreal
 */
export function executeFile(filepath: string, variables = {}) {
    // Construct a string with all of the global variables, e.g: "x=1;y='Hello';"
    let variableString = `__file__=r'${filepath}';`;

    for (const [key, value] of Object.entries(variables)) {
        let safeValueStr = value;
        if (typeof value === "string") {
            // Append single quotes ' to the start & end of the value
            safeValueStr = `r'${value}'`;
        }

        variableString += `${key}=${safeValueStr};`;
    }

    // Put together one line of code for settings the global variables, then opening, reading & executing the given filepath
    const command = `${variableString}f=open(r'${filepath}','r');exec(f.read());f.close()`;
    return runCommand(command);
}


/**
 * Close the global remote connection, if there is one
 * @param callback Function to call once connection has fully closed
 */
export async function closeRemoteConnection() {
    const remoteConnection = await getRemoteExecutionInstance(false);
    if (remoteConnection) {
        remoteConnection.stop();
    }
}