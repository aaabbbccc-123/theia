/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct } from 'inversify';
import * as showdown from 'showdown';
import * as sanitize from 'sanitize-html';
import { Emitter } from '@theia/core/lib/common/event';
import { VSXRegistryAPI } from './vsx-registry-api';
import { VSXRegistrySearchParam, VSCodeExtensionPart, VSCodeExtensionFull, VSCodeExtensionReviewList } from './vsx-registry-types';
import { OpenerService, open } from '@theia/core/lib/browser';
import { VSXRegistryUri, VSXRegistryDetailOpenerOptions } from './view/detail/vsx-registry-open-handler';
import { PluginServer } from '@theia/plugin-ext';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin';
import { VSXRegistryPreferences } from './vsx-registry-preferences';

@injectable()
export class VSXRegistryService {

    protected readonly onDidUpdateSearchResultEmitter = new Emitter<void>();
    readonly onDidSearch = this.onDidUpdateSearchResultEmitter.event;

    protected readonly onDidUpdateInstalledEmitter = new Emitter<void>();
    readonly onDidChangeInstalled = this.onDidUpdateInstalledEmitter.event;

    @inject(VSXRegistryAPI) protected readonly api: VSXRegistryAPI;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(HostedPluginSupport) protected readonly pluginSupport: HostedPluginSupport;
    @inject(PluginServer) protected readonly pluginServer: PluginServer;
    @inject(VSXRegistryPreferences) protected readonly preferences: VSXRegistryPreferences;

    @postConstruct()
    protected init(): void {
        this.update();
        this.preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'vsx-registry.api-url') {
                this.updateInstalled();
            }
        });
        this.pluginSupport.onDidChangePlugins(() => this.updateInstalled());
    }

    protected update(): void {
        this.find(this.searchParam);
        this.updateInstalled();
    }

    protected _installed: VSCodeExtensionPart[] = [];
    get installed(): VSCodeExtensionPart[] {
        return this._installed;
    }

    protected _searchResult: VSCodeExtensionPart[] = [];
    get searchResult(): VSCodeExtensionPart[] {
        return this._searchResult;
    }

    protected createEndpoint(arr: string[], queries?: { key: string, value: string | number }[]): string {
        const url = '/' + arr.reduce((acc, curr) => acc + (curr ? '/' + curr : ''));
        const queryString = queries ? '?' + queries.map<string>(obj => obj.key + '=' + obj.value).join('&') : '';
        // TODO replace with proper entrypoint
        return this.preferences['vsx-registry.api-url'] + url + queryString;
    }

    protected searchParam: VSXRegistrySearchParam | undefined;
    // TODO: cancellation support
    async find(param?: VSXRegistrySearchParam): Promise<void> {
        this.searchParam = param;
        const endpoint = this.createEndpoint(['-', 'search'], param && param.query ? [{ key: 'query', value: param.query }] : undefined);
        const result = await this.api.getExtensions(endpoint);
        this._searchResult = result;
        this.onDidUpdateSearchResultEmitter.fire(undefined);
    }

    async updateInstalled(): Promise<void> {
        const plugins = this.pluginSupport.plugins;
        const installed: VSCodeExtensionPart[] = [];
        await Promise.all(plugins.map(async plugin => {
            if (plugin.model.engine.type === 'vscode') {
                const url = this.createEndpoint([plugin.model.publisher, plugin.model.name]);
                const ext = await this.api.getExtension(url);
                installed.push({
                    ...ext,
                    url
                });
            }
        }));
        this._installed = installed;
        this.onDidUpdateInstalledEmitter.fire();
    }

    async install(extension: VSCodeExtensionPart): Promise<void> {
        await this.pluginServer.deploy(extension.downloadUrl);
    }

    async uninstall(extension: VSCodeExtensionPart): Promise<void> {
        const id = extension.publisher.toLowerCase() + '.' + extension.name.toLowerCase();
        await this.pluginServer.undeploy(id);
    }

    async getExtensionDetail(extensionURL: string): Promise<VSCodeExtensionFull> {
        return this.api.getExtension(extensionURL);
    }

    async getExtensionReadMe(readMeUrl: string): Promise<string> {
        const readMeRaw = await this.api.getExtensionReadMe(readMeUrl);
        return readMeRaw;
    }

    async getExtensionReviews(reviewsUrl: string): Promise<VSCodeExtensionReviewList> {
        return this.api.getExtensionReviews(reviewsUrl);
    }

    async openExtensionDetail(extensionRaw: VSCodeExtensionPart): Promise<void> {
        const options: VSXRegistryDetailOpenerOptions = {
            mode: 'reveal',
            url: extensionRaw.url
        };
        open(this.openerService, VSXRegistryUri.toUri(extensionRaw.name), options);
    }

    async compileDocumentation(extension: VSCodeExtensionFull): Promise<string> {
        if (extension.readmeUrl) {
            const markdownConverter = new showdown.Converter({
                noHeaderId: true,
                strikethrough: true,
                headerLevelStart: 2
            });
            const readme = await this.api.getExtensionReadMe(extension.readmeUrl);
            const readmeHtml = markdownConverter.makeHtml(readme);
            return sanitize(readmeHtml, {
                allowedTags: sanitize.defaults.allowedTags.concat(['h1', 'h2', 'img'])
            });
        }
        return '';
    }
}
