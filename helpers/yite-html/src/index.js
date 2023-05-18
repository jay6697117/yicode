import type { ResolvedConfig, PluginOption } from 'vite';
import type { InjectOptions, PageOption, Pages, UserOptions } from './typing';
import { render } from 'ejs';
import { isDirEmpty, loadEnv } from './utils.js';
import { normalizePath } from 'vite';
import { parse } from 'node-html-parser';
import fs from 'fs-extra';
import path from 'pathe';
import fg from 'fast-glob';
import consola from 'consola';
import history from 'connect-history-api-fallback';

const DEFAULT_TEMPLATE = 'index.html';
const ignoreDirs = ['.', '', '/'];

const bodyInjectRE = /<\/body>/;

export function yiteHtml(userOptions = {}) {
    const { entry, template = DEFAULT_TEMPLATE, pages = [], verbose = false } = userOptions;

    let viteConfig;
    let env = {};

    return {
        name: 'vite:html',
        enforce: 'pre',
        configResolved(resolvedConfig) {
            viteConfig = resolvedConfig;
            env = loadEnv(viteConfig.mode, viteConfig.root, '');
        },
        config(conf) {
            const input = createInput(userOptions, conf);

            if (input) {
                return {
                    build: {
                        rollupOptions: {
                            input
                        }
                    }
                };
            }
        },

        configureServer(server) {
            let _pages: { filename, template }[] = [];
            const rewrites: { from, to }[] = [];
            if (!isMpa(viteConfig)) {
                const template = userOptions.template || DEFAULT_TEMPLATE;
                const filename = DEFAULT_TEMPLATE;
                _pages.push({
                    filename,
                    template
                });
            } else {
                _pages = pages.map((page) => {
                    return {
                        filename: page.filename || DEFAULT_TEMPLATE,
                        template: page.template || DEFAULT_TEMPLATE
                    };
                });
            }
            const proxy = viteConfig.server?.proxy ?? {};
            const baseUrl = viteConfig.base ?? '/';
            const keys = Object.keys(proxy);

            let indexPage = null;
            for (const page of _pages) {
                if (page.filename !== 'index.html') {
                    rewrites.push(createRewire(page.template, page, baseUrl, keys));
                } else {
                    indexPage = page;
                }
            }

            // ensure order
            if (indexPage) {
                rewrites.push(createRewire('', indexPage, baseUrl, keys));
            }

            server.middlewares.use(
                history({
                    disableDotRule: undefined,
                    htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
                    rewrites: rewrites
                })
            );
        },

        transformIndexHtml: {
            enforce: 'pre',
            async transform(html, ctx) {
                const url = ctx.filename;
                const base = viteConfig.base;
                const excludeBaseUrl = url.replace(base, '/');
                const htmlName = path.relative(process.cwd(), excludeBaseUrl);

                const page = getPage(userOptions, htmlName, viteConfig);
                const { injectOptions = {} } = page;
                const _html = await renderHtml(html, {
                    injectOptions,
                    viteConfig,
                    env,
                    entry: page.entry || entry,
                    verbose
                });
                const { tags = [] } = injectOptions;
                return {
                    html: _html,
                    tags: tags
                };
            }
        },
        async closeBundle() {
            const outputDirs = [];

            if (isMpa(viteConfig) || pages.length) {
                for (const page of pages) {
                    const dir = path.dirname(page.template);
                    if (!ignoreDirs.includes(dir)) {
                        outputDirs.push(dir);
                    }
                }
            } else {
                const dir = path.dirname(template);
                if (!ignoreDirs.includes(dir)) {
                    outputDirs.push(dir);
                }
            }
            const cwd = path.resolve(viteConfig.root, viteConfig.build.outDir);
            const htmlFiles = await fg(
                outputDirs.map((dir) => `${dir}/*.html`),
                { cwd: path.resolve(cwd), absolute: true }
            );

            await Promise.all(
                htmlFiles.map((file) =>
                    fs.move(file, path.resolve(cwd, path.basename(file)), {
                        overwrite: true
                    })
                )
            );

            const htmlDirs = await fg(
                outputDirs.map((dir) => dir),
                { cwd: path.resolve(cwd), onlyDirectories: true, absolute: true }
            );
            await Promise.all(
                htmlDirs.map(async (item) => {
                    const isEmpty = await isDirEmpty(item);
                    if (isEmpty) {
                        return fs.remove(item);
                    }
                })
            );
        }
    };
}

export function createInput({ pages = [], template = DEFAULT_TEMPLATE }, viteConfig) {
    const input = {};
    if (isMpa(viteConfig) || pages?.length) {
        const templates = pages.map((page) => page.template);
        templates.forEach((temp) => {
            let dirName = path.dirname(temp);
            const file = path.basename(temp);

            dirName = dirName.replace(/\s+/g, '').replace(/\//g, '-');

            const key = dirName === '.' || dirName === 'public' || !dirName ? file.replace(/\.html/, '') : dirName;
            input[key] = path.resolve(viteConfig.root, temp);
        });

        return input;
    } else {
        const dir = path.dirname(template);
        if (ignoreDirs.includes(dir)) {
            return undefined;
        } else {
            const file = path.basename(template);
            const key = file.replace(/\.html/, '');
            return {
                [key]: path.resolve(viteConfig.root, template)
            };
        }
    }
}

export async function renderHtml(
    html,
    config: {
        injectOptions,
        viteConfig,
        env,
        entry,
        verbose
    }
) {
    const { injectOptions, viteConfig, env, entry, verbose } = config;
    const { data, ejsOptions } = injectOptions;

    const ejsData = {
        ...(viteConfig?.env ?? {}),
        ...(viteConfig?.define ?? {}),
        ...(env || {}),
        ...data
    };
    let result = await render(html, ejsData, ejsOptions);

    if (entry) {
        result = removeEntryScript(result, verbose);
        result = result.replace(bodyInjectRE, `<script type="module" src="${normalizePath(`${entry}`)}"></script>\n</body>`);
    }
    return result;
}

export function getPage({ pages = [], entry, template = DEFAULT_TEMPLATE, inject = {} }, name, viteConfig) {
    let page;
    if (isMpa(viteConfig) || pages?.length) {
        page = getPageConfig(name, pages, DEFAULT_TEMPLATE);
    } else {
        page = createSpaPage(entry, template, inject);
    }
    return page;
}

function isMpa(viteConfig) {
    const input = viteConfig?.build?.rollupOptions?.input ?? undefined;
    return typeof input !== 'string' && Object.keys(input || {}).length > 1;
}

export function removeEntryScript(html, verbose = false) {
    if (!html) {
        return html;
    }

    const root = parse(html);
    const scriptNodes = root.querySelectorAll('script[type=module]') || [];
    const removedNode = [];
    scriptNodes.forEach((item) => {
        removedNode.push(item.toString());
        item.parentNode.removeChild(item);
    });
    verbose &&
        removedNode.length &&
        consola.warn(`vite-plugin-html: Since you have already configured entry, ${removedNode.toString()} is deleted. You may also delete it from the index.html.
        `);
    return root.toString();
}

export function createSpaPage(entry, template, inject = {}) {
    return {
        entry,
        filename: 'index.html',
        template: template,
        injectOptions: inject
    };
}

export function getPageConfig(htmlName, pages, defaultPage) {
    const defaultPageOption = {
        filename: defaultPage,
        template: `./${defaultPage}`
    };

    const page = pages.filter((page) => {
        return path.resolve('/' + page.template) === path.resolve('/' + htmlName);
    })?.[0];
    return page ?? defaultPageOption ?? undefined;
}

export function getHtmlInPages(page, root) {
    const htmlPath = getHtmlPath(page, root);

    return readHtml(htmlPath);
}

export function getHtmlPath(page, root) {
    const { template } = page;
    const templatePath = template.startsWith('.') ? template : `./${template}`;
    return path.resolve(root, templatePath);
}

export async function readHtml(path) {
    if (!fs.pathExistsSync(path)) {
        throw new Error(`html is not exist in ${path}`);
    }
    return await fs.readFile(path).then((buffer) => buffer.toString());
}

function createRewire(reg, page, baseUrl, proxyUrlKeys) {
    return {
        from: new RegExp(`^/${reg}*`),
        to({ parsedUrl }) {
            const pathname = parsedUrl.pathname;

            const excludeBaseUrl = pathname.replace(baseUrl, '/');

            const template = path.resolve(baseUrl, page.template);

            if (excludeBaseUrl === '/') {
                return template;
            }
            const isApiUrl = proxyUrlKeys.some((item) => pathname.startsWith(path.resolve(baseUrl, item)));
            return isApiUrl ? excludeBaseUrl : template;
        }
    };
}
