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

import * as React from 'react';
import { ReactWidget } from '@theia/core/lib/browser/widgets';
import { injectable, interfaces, Container, inject, postConstruct } from 'inversify';

import { VSXRegistryService } from '../../vsx-registry-service';
import { VSXRegistryList } from './vsx-registry-list-component';
import { ProgressLocationService } from '@theia/core/lib/browser/progress-location-service';
import { ProgressService } from '@theia/core/lib/common/progress-service';

export const VSXRegistryListOptions = Symbol('VSCodeExtensionsListOptions');

export interface VSXRegistryListOptions {
    id: 'installed' | 'search';
    label: string;
}

@injectable()
export class VSXRegistryListWidget extends ReactWidget {

    static createContainer(parent: interfaces.Container, options: VSXRegistryListOptions): Container {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = parent;
        child.bind(VSXRegistryListOptions).toConstantValue(options);
        child.bind(VSXRegistryListWidget).toSelf();
        return child;
    }
    static createWidget(parent: interfaces.Container, options: VSXRegistryListOptions): VSXRegistryListWidget {
        return VSXRegistryListWidget.createContainer(parent, options).get(VSXRegistryListWidget);
    }

    @inject(VSXRegistryListOptions) protected readonly options: VSXRegistryListOptions;
    @inject(VSXRegistryService) protected readonly service: VSXRegistryService;
    @inject(ProgressLocationService) protected readonly progressLocationService: ProgressLocationService;
    @inject(ProgressService) protected readonly progressService: ProgressService;

    @postConstruct()
    protected init(): void {
        this.id = 'vscode-extension-list:' + this.options.id;
        this.title.label = this.options.label;

        if (this.options.id === 'installed') {
            this.toDispose.push(this.service.onDidChangeInstalled(() => this.update()));
        } else {
            this.toDispose.push(this.service.onDidSearch(() => this.update()));
        }
    }

    protected render(): React.ReactNode {
        return <VSXRegistryList
            progressLocation='vsx-registry-list'
            progressService={this.progressService}
            extensions={this.options.id === 'installed' ? this.service.installed : this.service.searchResult}
            service={this.service} />;
    }

}
