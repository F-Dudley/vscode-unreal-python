import "./docIndex.scss";
import { Component, Fragment } from 'react';
import * as vscode from '../../Modules/vscode';
import DocHeader from './Header/docHeader';

import { VSCodeProgressRing } from '@vscode/webview-ui-toolkit/react';
import DropDownArea from "../../Components/dropDownArea";


interface RawTableOfContents {
    [type: string]: {
        [name: string]: {
            ClassMethod?: string[],
            Constant?: string[],
            Method?: string[],
            Property?: string[],
        }
    };
}



// We should convert toc into this format on mounted
interface TableOfContents {
    [Type: string]: {
        [Name: string]: string[]
    };
}

interface FilteredTableOfContents {
    [Type: string]: string[]
}

interface DocIndexProps {
    onItemClicked: (name: string) => void;
}


export default class DocIndex extends Component<DocIndexProps> {
    state = { bLoading: true, tableOfContents: {}, filter: "" };


    async componentDidMount() {
        // Request the table of contents from the extension
        const tableOfContents: RawTableOfContents = await vscode.sendMessageAndWaitForResponse(vscode.EInOutCommands.getTableOfContents);

        this.setState({ tableOfContents: this.parseTableOfContents(tableOfContents) });

        // Hide the loading div
        this.setState({ bLoading: false });
    }

    parseTableOfContents(tableOfContents: RawTableOfContents) {
        let parsedTableOfContents: TableOfContents = {};

        Object.keys(tableOfContents).forEach((type) => {
            parsedTableOfContents[type] = {};

            Object.keys(tableOfContents[type]).forEach((name) => {
                parsedTableOfContents[type][name] = [];

                Object.keys(tableOfContents[type][name]).forEach((subType) => {
                    parsedTableOfContents[type][name].push(...tableOfContents[type][name][subType]);
                });
            });
        });

        return parsedTableOfContents;
    }

    renderProgressRing() {
        if (this.state.bLoading) {
            return (
                <div id="loading">
                    <VSCodeProgressRing />
                </div>
            );
        }
    }

    onSearchInput(searchText: string) {
        this.setState({ filter: searchText });
    }

    private passesFilter(itemName: string, includes: string[]) {
        for (let include of includes) {
            if (!itemName.toLowerCase().includes(include)) {
                return false;
            }
        }

        return true;
    }


    renderContent() {
        let content: FilteredTableOfContents = {};
        if (this.state.filter) {
            for (let [type, items] of Object.entries(this.state.tableOfContents)) {
                content[type] = [];
                const filterLower = this.state.filter.toLowerCase();
                const includes = filterLower.split(/[\s,]+/);

                for (let [className, memberName] of Object.entries(items)) {
                    if (this.passesFilter(className, includes)) {
                        content[type].push(className);
                    }

                    for (let member of memberName) {
                        if (this.passesFilter(member, includes)) {
                            content[type].push(`${className}.${member}`);
                        }
                    }
                }
                
                
            }
        } 
        else {
            for (let type in this.state.tableOfContents) {
                content[type] = Object.keys(this.state.tableOfContents[type]);
            }
        }


        return (
            <Fragment>
                {
                    Object.entries(content).map(([typeName, items], index) => {
                        return (
                            <DropDownArea key={index} title={typeName} badgeCount={items.length}>
                                <div className="doc-index-dd-content">
                                    {
                                        items.map((itemName, index) => {
                                            return (
                                                <span key={index} onClick={() => this.props.onItemClicked(itemName)}>
                                                    {itemName}
                                                </span>
                                            );
                                        })
                                    }
                                </div>
                            </DropDownArea>
                        );
                    })

                }
            </Fragment>
        );
    }


    render() {
        return (
            <div>
                <DocHeader handleSearchInput={(text: string) => this.onSearchInput(text)} />

                {this.renderProgressRing()}

                <div id="doc-index-content">
                    {this.renderContent()}
                </div>

            </div>
        );
    }
}