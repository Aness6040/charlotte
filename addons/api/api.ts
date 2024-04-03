import type { GlobalCtx } from '../../src/core/loader/ctx';
import type { AddonCtx } from '../../src/core/loader/loader';
import type { CharlotteRedux } from './redux';
import { platformInfo } from '../../src/core/loader/match';

export interface GlobalCtxWithAPI extends GlobalCtx {
    api: CharlotteAPI;
    instances: {
        vm?: VM
        blockly?: ScratchBlocks.RealBlockly
    }
}

export interface AddonCtxWithAPI extends AddonCtx {
    addon: GlobalCtxWithAPI;
}

export interface CharlotteAPI {
    /**
     * Get current platform.
     * @returns platform alias, such as `cc`, `cocrea`
     */
    getPlatform (): string;
    /**
     * Get Scratch's VM instance asynchronously.
     * @returns a promise that returns VM instance
     */
    getVM (): Promise<VM>;
    /**
     * Get Scratch's Blockly instance asynchronously.
     * This won't available if you're in project page.
     * @returns a promise that returns Blockly instance
     */
    getBlockly (): Promise<ScratchBlocks.RealBlockly>;
    /**
     * Get Charlotte's redux instance asynchronously.
     * This won't available if current page doesn't have redux or hide it (Eg: Codingclip)
     * @returns a promise that returns Charlotte's redux instance
     */
    getRedux (): Promise<CharlotteRedux>;
    /**
     * Creates an item in the editor Blockly context menu by callback.
     * Available only when Blockly exists.
     * @param callback A function to modify context menu.
     * @param options Specify the callback's scope.
     * @example
     * Here's a example to modify context menu in Blockly:
     * ```ts
     * addon.api.createBlockContextMenu((items: ContextMenuItem[], block: Blockly.Block, event: Blockly.Event) => {
     *     items.push({
     *         {
     *             enabled: true, // Whether the option is available
     *             text: '🌠 Meteor shower begins', // The display text of the option
     *             callback: () => console.log('🌠🌠🌠🌠'), // Triggers when option clicked
     *             separator: false // Whether displays a separator at the bottom of current option
     *         }
     *     });
     * }, {blocks: true}); // Only display in block's context menu
     * ```
     */
    createBlockContextMenu (callback: ContextMenuCallback, options: ContextMenuOptions);
    /**
     * Escape a string to be safe to use in XML content.
     * CC-BY-SA: hgoebl
     * https://stackoverflow.com/questions/7918868/
     * how-to-escape-xml-entities-in-javascript
     * @param unsafe Unsafe string.
     * @returns XML-escaped string, for use within an XML tag.
     */
    xmlEscape (unsafe: string): string;
    /**
     * Waiting until redux state marches condition.
     * @param condition The function to judge whether current state matches condition.
     * @param scope Which actions will trigger condition function.
     * @example
     * await addon.api.pendingReduxState((state) => state.scratchGui?.mode?.isFullScreen);
     * console.log('The stage is full-screen!');
     */
    pendingReduxState (condition: StatePendingCondition, scope?: string[]): Promise<void>;
    /**
     * Waiting until selected element rendered.
     * @param selector Selector string, syntax is same as `querySelector`.
     * @returns a promise that resolves requested element.
     */
    waitForElement (selector: string, options?: WaitForElementOptions): Promise<Element>;
    /**
     * Append a element to a specific position in Scratch editor.
     * @param element The element you want to append to
     * @param space Where do you want to append
     * @param order The the order of the added element.
     * @returns Whether element is applied successfully.
     * @example
     * const button = document.createElement('button');
     * button.className = 'charlotteButton';
     * button.innerHTML = '🌠&nbsp;Charlotte';
     * button.addEventListener('click', () => {
     *     addon.app.openFrontend();
     * });
     *
     * addon.api.appendToSharedSpace(button, 'afterSoundTab');
     */
    appendToSharedSpace (element: HTMLElement, space: SharedSpace, order?: number): boolean;
    /**
     * Get hashed className from unhashed className.
     * @param possibleClassNames all possible classNames
     * @returns hashed className
     */
    hashedScratchClass (...possibleClassNames: string[]): string;
    /**
     * Get current page's most likely react internal key.
     * This method does not mean that react exists in this interface. This method is just a simple inference based on the platform.
     * @returns React's internal prefix
     */
    getReactInternalPrefix (): string;
}

export type SharedSpace = 'stageHeader' | 'fullscreenStageHeader' | 'afterGreenFlag' | 'afterStopButton' | 'afterSoundTab';

export interface BaseContextMenuOptions {
    workspace: boolean;
    blocks: boolean;
    flyout: boolean;
    comments: boolean;
}

export type ContextMenuOptions = Partial<BaseContextMenuOptions>;

export interface ContextMenuItem {
    enabled: boolean;
    text: string;
    callback: () => void;
    separator: boolean;
}

export interface StoredContextMenuCallback extends BaseContextMenuOptions {
    callback: ContextMenuCallback;
}

export type ContextMenuCallback = (items: ContextMenuItem[], block: unknown, event: unknown) => ContextMenuItem[];

export type StatePendingCondition = (state: unknown) => boolean;

export interface WaitForElementOptions {
  markAsSeen?: boolean;
  condition?: () => boolean;
  elementCondition?: (element: Element) => boolean;
  reduxCondition?: (state: any) => boolean;
  reduxEvents?: string[];
}

type ConditionFunction = () => boolean;
type ElementConditionFunction = (element: Element) => boolean;

interface PendingItem {
  resolve: (value: Element) => void;
  query: string;
  seen?: WeakSet<Element>;
  condition?: ConditionFunction;
  elementCondition?: ElementConditionFunction;
}

export default async function ({addon, console}) {
    addon.api = {};

    let cachedResult: keyof typeof platformInfo | 'unknown' | null = null;
    function getPlatform () {
        if (cachedResult) return cachedResult;
        for (const alias in platformInfo) {
            const platform = platformInfo[alias];
            if (platform.root.test(document.URL)) {
                cachedResult = alias as keyof typeof platformInfo;
                return cachedResult;
            }
        }
        cachedResult = 'unknown';
        return cachedResult;
    }

    function getReactInternalPrefix () {
        // Legacy ClipCC uses React 17.0.2, which has different internal prefix
        if (getPlatform() === 'cc') {
            return '__reactFiber$';
        }
        return '__reactInternalInstance$';
    }

    let vmFailed = false;
    function getVM () {
        if (typeof addon.instances.vm === 'object') {
            return Promise.resolve(addon.instances.vm);
        }
        if (vmFailed) {
            return Promise.reject();
        }
        return new Promise((resolve, reject) => {
            addon.once('API.instance.vm.initialized', () => resolve(addon.instances.vm));
            addon.once('API.instance.vm.error', () => {
                vmFailed = true;
                reject();
            });
        });
    }

    let blocklyFailed = false;
    function getBlockly () {
        if (typeof addon.instances.Blockly === 'object') {
            return Promise.resolve(addon.instances.Blockly);
        }
        if (blocklyFailed) {
            return Promise.reject();
        }
        return new Promise((resolve, reject) => {
            addon.once('API.instance.Blockly.initialized', () => resolve(addon.instances.Blockly));
            addon.once('API.instance.Blockly.error', () => {
                blocklyFailed = true;
                reject();
            });
        });
    }

    function getRedux () {
        if ('state' in addon.redux) {
            return Promise.resolve(addon.redux);
        }

        return new Promise((resolve) => {
            addon.once('API.redux.initialized', () => {
                resolve(addon.redux);
            });
        });
    }

    let createdAnyBlockContextMenus = false;
    const contextMenuCallbacks: StoredContextMenuCallback[] = [];
    function createBlockContextMenu (
        callback: ContextMenuCallback,
        { workspace = false, blocks = false, flyout = false, comments = false }: ContextMenuOptions = {}
    ) {
        contextMenuCallbacks.push({ callback, workspace, blocks, flyout, comments });

        if (createdAnyBlockContextMenus) return;
        const ScratchBlocks = addon.instances.Blockly;
        if (!ScratchBlocks?.ContextMenu) {
            return console.error('Blockly not ready');
        }
        createdAnyBlockContextMenus = true;

        const oldShow = ScratchBlocks.ContextMenu.show;
        ScratchBlocks.ContextMenu.show = function (event: any, items: ContextMenuItem[], rtl: boolean) {
            const gesture = ScratchBlocks.mainWorkspace.currentGesture_;
            const block = gesture.targetBlock_;

            for (const { callback, workspace, blocks, flyout, comments } of contextMenuCallbacks) {
                const injectMenu =
                // Workspace
                (workspace && !block && !gesture.flyout_ && !gesture.startBubble_) ||
                // Block in workspace
                (blocks && block && !gesture.flyout_) ||
                // Block in flyout
                (flyout && gesture.flyout_) ||
                // Comments
                (comments && gesture.startBubble_);
                if (injectMenu) {
                    try {
                        items = callback(items, block, event);
                    } catch (e) {
                        console.error('Error while calling context menu callback: ', e);
                    }
                }
            }

            oldShow.call(this, event, items, rtl);

            const blocklyContextMenu = ScratchBlocks.WidgetDiv.DIV.firstChild as HTMLElement;
            items.forEach((item, i) => {
                if (i !== 0 && item.separator) {
                    const itemElt = blocklyContextMenu.children[i] as HTMLElement;
                    itemElt.style.paddingTop = '2px';
                    itemElt.style.borderTop = '1px solid hsla(0, 0%, 0%, 0.15)';
                }
            });
        };
    }

    async function pendingReduxState (condition: StatePendingCondition, scope?: string[]) {
        const redux = await getRedux();

        if (condition(redux.state)) return Promise.resolve();
        return new Promise<void>(resolve => {
            const listener = ({detail}) => {
                if (scope && !scope.includes(detail.action.type)) return;
                if (!condition(detail.next)) return;
                redux.target.removeEventListener('statechanged', listener);
                setTimeout(resolve, 0);
            };
            redux.target.addEventListener('statechanged', listener);
        });
    }

    class SharedObserver {
        private inactive: boolean = true;
        private pending: Set<PendingItem> = new Set();
        private observer: MutationObserver;

        constructor () {
            this.observer = new MutationObserver((mutationsList, observer) => {
                for (const item of Array.from(this.pending)) {
                    if (item.condition && !item.condition()) continue;
                    const matches = document.querySelectorAll(item.query);
                    for (const match of Array.from(matches)) {
                        if (item.seen?.has(match)) continue;
                        if (item.elementCondition && !item.elementCondition(match)) continue;
                        item.seen?.add(match);
                        this.pending.delete(item);
                        item.resolve(match);
                        break;
                    }
                }
                if (this.pending.size === 0) {
                    this.inactive = true;
                    this.observer.disconnect();
                }
            });
        }

        watch (opts: Omit<PendingItem, 'resolve'>): Promise<Element> {
            if (this.inactive) {
                this.inactive = false;
                this.observer.observe(document.documentElement, {
                    subtree: true,
                    childList: true,
                });
            }
            return new Promise((resolve) => this.pending.add({ resolve, ...opts }));
        }
    }

    const sharedObserver = new SharedObserver();
    const _waitForElementSet = new Set<Element>();
    async function waitForElement (selector: string, options: WaitForElementOptions = {}) {
        const { markAsSeen = false, condition, elementCondition, reduxCondition, reduxEvents } = options;
        const redux = reduxEvents ? await getRedux() : null;

        if (!condition || condition()) {
            const firstQuery = document.querySelectorAll(selector);
            for (const element of Array.from(firstQuery)) {
                if (_waitForElementSet.has(element)) continue;
                if (elementCondition && !elementCondition(element)) continue;
                if (markAsSeen) _waitForElementSet.add(element);
                return element;
            }
        }

        let combinedCondition = () => {
            if (condition && !condition()) return false;
            if (reduxCondition) {
                if (!reduxCondition(redux.state)) return false;
            } 
            return true;
        };

        let listener: ((event: CustomEvent) => void) | undefined;

        if (reduxEvents) {
            const oldCondition = combinedCondition;
            let satisfied = false;
            combinedCondition = () => {
                if (oldCondition && !oldCondition()) return false;
                return satisfied;
            };

            listener = ({ detail }) => {
                if (reduxEvents.includes(detail.action.type)) {
                    satisfied = true;
                }
            };

            redux.target.addEventListener('statechanged', listener);
        }

        const promise = sharedObserver.watch({
            query: selector,
            seen: markAsSeen ? this._waitForElementSet : null,
            condition: combinedCondition,
            elementCondition: elementCondition || null,
        });

        if (listener) {
            const match = await promise;
            addon.redux.target.removeEventListener('statechanged', listener);
            return match;
        }

        return promise;
    }

    function appendToSharedSpace (element: HTMLElement, space: SharedSpace, order = 0) {
        const q = document.querySelector.bind(document);
        const sharedSpaces = {
            stageHeader: {
                // Non-fullscreen stage header only
                element: () => q("[class^='stage-header_stage-size-row']"),
                from: () => [],
                until: () => [
                    // Small/big stage buttons (for editor mode)
                    q("[class^='stage-header_stage-size-toggle-group']"),
                    // Full screen icon (for player mode)
                    q("[class^='stage-header_stage-size-row']").lastChild,
                ],
            },
            fullscreenStageHeader: {
                // Fullscreen stage header only
                element: () => q("[class^='stage-header_stage-menu-wrapper']"),
                from: function () {
                    let emptyDiv = this.element().querySelector('.charlotte-spacer');
                    if (!emptyDiv) {
                        emptyDiv = document.createElement('div');
                        emptyDiv.style.marginLeft = 'auto';
                        emptyDiv.className = 'charlotte-spacer';
                        this.element().insertBefore(emptyDiv, this.element().lastChild);
                    }
                    return [emptyDiv];
                },
                until: () => [q("[class^='stage-header_stage-menu-wrapper']").lastChild],
            },
            afterGreenFlag: {
                element: () => q("[class^='controls_controls-container']"),
                from: () => [],
                until: () => [q("[class^='stop-all_stop-all']")],
            },
            afterStopButton: {
                element: () => q("[class^='controls_controls-container']"),
                from: () => [q("[class^='stop-all_stop-all']")],
                until: () => [],
            },
            afterSoundTab: {
                element: () => q("[class^='react-tabs_react-tabs__tab-list']"),
                from: () => [q("[class^='react-tabs_react-tabs__tab-list']").children[2]],
                until: () => [],
            },
        };

        const spaceInfo = sharedSpaces[space];
        const spaceElement = spaceInfo.element();
        if (!spaceElement) return false;
        const from = spaceInfo.from();
        const until = spaceInfo.until();

        element.dataset.charlotteSharedSpaceOrder = String(order);

        let foundFrom = false;
        if (from.length === 0) foundFrom = true;

        // InsertAfter = element whose nextSibling will be the new element
        // -1 means append at beginning of space (prepend)
        // This will stay null if we need to append at the end of space
        let insertAfter: HTMLElement | number | null = null;

        const children = Array.from(spaceElement.children);
        for (const indexString of children.keys()) {
            const child = children[indexString] as HTMLElement;
            const i = Number(indexString);

            // Find either element from "from" before doing anything
            if (!foundFrom) {
                if (from.includes(child)) {
                    foundFrom = true;
                    // If this is the last child, insertAfter will stay null
                    // And the element will be appended at the end of space
                }
                continue;
            }

            if (until.includes(child)) {
                // This is the first Charlotte element appended to this space
                // If from = [] then prepend, otherwise append after
                // Previous child (likely a "from" element)
                if (i === 0) insertAfter = -1;
                else insertAfter = children[i - 1] as HTMLElement;
                break;
            }

            if (child.dataset.charlotteSharedSpaceOrder) {
                if (Number(child.dataset.charlotteSharedSpaceOrder) > order) {
                    // We found another element with higher order number
                    // If from = [] and this is the first child, prepend.
                    // Otherwise, append before this child.
                    if (i === 0) insertAfter = -1;
                    else insertAfter = children[i - 1] as HTMLElement;
                    break;
                }
            }
        }

        if (!foundFrom) return false;
        // It doesn't matter if we didn't find an "until"

        if (insertAfter === null) {
            // This might happen with until = []
            spaceElement.appendChild(element);
        } else if (insertAfter === -1) {
            // This might happen with from = []
            spaceElement.prepend(element);
        } else if (insertAfter instanceof HTMLElement) {
            // Works like insertAfter but using insertBefore API.
            // NextSibling cannot be null because insertAfter
            // Is always set to children[i-1], so it must exist
            spaceElement.insertBefore(element, insertAfter.nextSibling);
        }
        return true;
    }

    let scratchClsssNamesCache: string[] | null = null;
    function lookupScratchClassNames () {
        scratchClsssNamesCache = [
            ...new Set(
                [...document.styleSheets]
                    .filter(
                        (styleSheet) =>
                            !(
                                styleSheet.ownerNode.textContent.startsWith(
                                    '/* DO NOT EDIT\n@todo This file is copied from GUI and should be pulled out into a shared library.'
                                ) &&
                                    (styleSheet.ownerNode.textContent.includes('input_input-form') ||
                                    styleSheet.ownerNode.textContent.includes('label_input-group_'))
                            )
                    )
                    .map((e) => {
                        try {
                            return [...e.cssRules];
                        } catch (e) {
                            return [];
                        }
                    })
                    .flat()
                    .map((e: CSSStyleRule) => e.selectorText)
                    .filter((e) => e)
                    .map((e) => e.match(/(([\w-]+?)_([\w-]+)_([\w\d-]+))/g))
                    .filter((e) => e)
                    .flat()
            ),
        ];
    }

    function hashedScratchClass (...possibleClassNames: string[]) {
        let res = '';
        possibleClassNames
            .forEach((classNameToFind) => {
                if (!scratchClsssNamesCache) {
                    lookupScratchClassNames();
                }

                res +=
            scratchClsssNamesCache.find(
                (className) =>
                    className.startsWith(classNameToFind + '_') && className.length === classNameToFind.length + 6
            ) || '';
                res += ' ';
            });
        res = res.slice(0, -1);
        // Sanitize just in case
        res = res.replace(/"/g, '');
        return res;
    }

    function xmlEscape (unsafe: string) {
        return unsafe.replace(/[<>&'"]/g, (c: string) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
            return '';
        });
    }

    // Make charlotte track Scratch's locale
    const originalGetLocale = addon.getLocale;
    addon.getLocale = function () {
        if ('state' in addon.redux) {
            return addon.redux.state?.locales?.locale ?? originalGetLocale.call(addon);
        }
        const vm = addon.instances.vm;
        if (vm) {
            return vm.getLocale() ?? originalGetLocale.call(addon);
        }
        return originalGetLocale.call(this);
    };
    // Prefer listening redux state changes rather than modify functions.
    if (getPlatform() === 'cc') {
        // Codingclip removed their REDUX_DEVTOOLS
        getVM().then(vm => {
            const originalSetLocale = vm.setLocale;
            vm.setLocale = function (locale: string, messages: object, ...args: unknown[]) {
                const result = originalSetLocale.call(this);
                addon.settings.locale = locale;
                return result;
            };
        });
    } else {
        getRedux().then(redux => {
            // GUI does not exist, ignore it.
            if (!('scratchGui' in redux.state)) return;

            if (addon.settings.locale !== redux.state.locales.locale) {
                addon.settings.locale = redux.state.locales.locale;
            }

            redux.target.addEventListener('statechanged', ({ detail }) => {
                // ClipCC has different action type
                if (!detail.action || !detail.action.type.endsWith('-gui/locales/SELECT_LOCALE')) {
                    return;
                }
                if (addon.settings.locale !== detail.next.locales.locale) {
                    addon.settings.locale = detail.next.locales.locale;
                }
            });
        });
    }

    addon.api = {
        getPlatform,
        getVM,
        getBlockly,
        getRedux,
        createBlockContextMenu,
        pendingReduxState,
        waitForElement,
        appendToSharedSpace,
        hashedScratchClass,
        getReactInternalPrefix,
        xmlEscape
    } satisfies CharlotteAPI;
}
