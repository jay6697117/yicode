import path from 'node:path';
import { defineConfig } from 'vite';
import viteVue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import * as ComponentResolvers from 'unplugin-vue-components/resolvers';
import { visualizer as Visualizer } from 'rollup-plugin-visualizer';

// import { viteZip as ZipFile } from 'vite-plugin-zip-file';
import fs from 'fs-extra';
import portfinder from 'portfinder';

import { mergeAndConcat } from 'merge-anything';
import Unocss from 'unocss/vite';
import Icons from 'unplugin-icons/vite';
import IconsResolver from 'unplugin-icons/resolver';
import ReactivityTransform from '@vue-macros/reactivity-transform/vite';
import VueDevTools from 'vite-plugin-vue-devtools';
import { defineConfig as defineUnocssConfig } from 'unocss';
import Markdown from 'vite-plugin-md';
import { chunkSplitPlugin as ChunkSplit } from '@yicode-helper/yite-chunk';
// import { yiteQrcode as YiteQrcode } from '@yicode-helper/yite-qrcode';
import { yiteHtml as YiteHtml } from '@yicode-helper/yite-html';
import { yiteRouter as YiteRouter } from '@yicode-helper/yite-router';
import { yiteI18n as YiteI18n } from '@yicode-helper/yite-i18n';
import { yidashLibNames } from '@yicode/yidash/yidashLibNames.js';

import { cliDir, appDir, srcDir, yicodeDir, cacheDir } from './config.js';
import { fnFileProtocolPath, fnOmit, fnImport } from './utils.js';
import { unocssConfig } from './unocss.js';

export default defineConfig(async ({ command, mode }) => {
    // 没有则生成目录
    fs.ensureDirSync(cacheDir);
    fs.ensureDirSync(yicodeDir);

    const { yiteConfig } = await fnImport(fnFileProtocolPath(path.resolve(yicodeDir, 'yite.config.js')), 'yiteConfig', {});
    let pkg = fs.readJsonSync(path.resolve(appDir, 'package.json'), { throws: false }) || {};

    let findPort = await portfinder.getPortPromise({ port: 8000, stopPort: 9000 });

    // 每个项目依赖包进行分割
    let splitDependencies = {};
    let includeDeps = [];
    for (let prop in pkg.dependencies) {
        if (pkg.dependencies.hasOwnProperty(prop)) {
            splitDependencies[prop] = [prop];
            includeDeps.push(prop);
        }
    }

    // vue 插件
    let viteVueConfig = {
        include: [/\.vue$/, /\.md$/]
    };

    // 自动导入插件
    let autoImportConfig = mergeAndConcat(
        {
            include: [/\.[tj]sx?$/, /\.vue$/, /\.vue\?vue/, /\.md$/],
            imports: [
                'vue',
                {
                    'vue-router': [
                        //
                        'useRouter',
                        'useRoute',
                        'useLink',
                        'onBeforeRouteLeave',
                        'onBeforeRouteUpdate',
                        'createMemoryHistory',
                        'createRouter',
                        'createWebHashHistory',
                        'createWebHistory',
                        'isNavigationFailure',
                        'loadRouteLocation'
                    ],
                    'lodash-es': [
                        //
                        ['*', '_']
                    ],
                    pinia: [
                        //
                        ['*', 'Pinia']
                    ],
                    '@yicode/yite-cli': [
                        //
                        ['*', 'yite']
                    ],
                    'vue-i18n': [
                        //
                        'createI18n'
                    ],
                    '@yicode/yidash': yidashLibNames
                }
            ],
            dirs: [
                //
                path.resolve(srcDir, 'plugins'),
                path.resolve(srcDir, 'hooks'),
                path.resolve(srcDir, 'utils'),
                path.resolve(srcDir, 'stores'),
                path.resolve(srcDir, 'config')
            ],
            defaultExportByFilename: true,
            vueTemplate: true,
            dts: '.cache/auto-imports.d.ts',
            resolvers: []
        },
        fnOmit(yiteConfig?.autoImport || {}, ['resolvers']),
        {
            resolvers: yiteConfig?.autoImport?.resolvers?.map((item) => ComponentResolvers[item.name](item.options)) || []
        }
    );

    // 自动导入组件
    let componentsConfig = {
        dirs: [
            //
            path.resolve(srcDir, 'components')
        ],
        dts: '.cache/components.d.ts',
        version: 3,
        directoryAsNamespace: false,
        resolvers: [IconsResolver()]
    };

    // 代码分割
    let chunkSplitConfig = {
        strategy: 'default',
        // customChunk: (args) => {
        //     if (args.file.endsWith('.png')) {
        //         return 'png';
        //     }
        //     return null;
        // },
        customSplitting: Object.assign(splitDependencies, yiteConfig?.chunkSplit || {})
    };

    // zip 压缩
    // let zipPlugin = {
    //     folderPath: path.resolve(appDir, 'dist'),
    //     outPath: cacheDir,
    //     zipName: yiteConfig?.viteZip?.zipName || 'dist.zip',
    //     enabled: mode === 'production' ? true : false
    // };

    // 可视化报告
    let visualizerConfig = {
        open: false,
        brotliSize: true,
        filename: '.cache/buildReport.html'
    };

    // 打包入口配置
    let yiteHtmlConfig = {};

    // 正式环境下，才启用自动解析，避免页面重载
    if (mode === 'production') {
        // 自动导入方法，不需要按需，只要组件按需
        // autoImportConfig = mergeAndConcat(
        //     //
        //     autoImportConfig,
        //     fnOmit(yiteConfig?.autoImport || {}, ['resolvers']),
        //     {
        //         resolvers: yiteConfig?.autoImport?.resolvers?.map((item) => ComponentResolvers[item.name](item.options)) || []
        //     }
        // );

        // 自动导入组件
        componentsConfig = mergeAndConcat(
            //
            componentsConfig,
            fnOmit(yiteConfig?.autoComponent || {}, ['resolvers']),
            {
                resolvers:
                    yiteConfig?.autoComponent?.resolvers?.map((item) => {
                        return ComponentResolvers[item.name](item.options);
                    }) || []
            }
        );
    }

    let iconsConfig = {
        autoInstall: false
    };

    // vue devtool
    let vueDevtoolConfig = {};

    let yiteRouterConfig = {};
    let yiteI18nConfig = {};

    // 插件列表
    let allPlugins = [];
    allPlugins.push(YiteHtml(yiteHtmlConfig));
    allPlugins.push(Markdown());
    allPlugins.push(YiteRouter(yiteRouterConfig));
    allPlugins.push(YiteI18n(yiteI18nConfig));
    allPlugins.push(ReactivityTransform());
    allPlugins.push(Unocss(defineUnocssConfig(unocssConfig)));
    allPlugins.push(Icons(iconsConfig));
    if (yiteConfig?.devtool === true) {
        allPlugins.push(VueDevTools(vueDevtoolConfig));
    }

    allPlugins.push(Components(componentsConfig));
    allPlugins.push(AutoImport(autoImportConfig));
    allPlugins.push(ChunkSplit(chunkSplitConfig));
    // 默认不使用二维码，多个网卡情况下会很乱
    // allPlugins.push(YiteQrcode());
    // allPlugins.push(ZipFile(zipPlugin));
    allPlugins.push(Visualizer(visualizerConfig));
    allPlugins.push(viteVue(viteVueConfig));

    let viteConfig = mergeAndConcat(
        {
            plugins: allPlugins,
            css: {
                preprocessorOptions: {
                    scss: {
                        additionalData: `@use "@/styles/variable.scss" as *;`
                    }
                }
            },
            resolve: {
                alias: [
                    {
                        find: '@',
                        replacement: path.resolve(srcDir)
                    },
                    {
                        find: 'vue-i18n',
                        replacement: 'vue-i18n/dist/vue-i18n.cjs.js'
                    }
                ]
            },
            optimizeDeps: {
                include: []
            },
            root: appDir,
            base: './',
            envDir: path.resolve(srcDir, 'env'),
            logLevel: 'info',
            build: {
                reportCompressedSize: false,
                chunkSizeWarningLimit: 4096,
                target: ['es2022'],
                rollupOptions: {
                    plugins: [],
                    output: {
                        // TODO: 进一步研究22
                        // assetFileNames: ({ name }) => {
                        //     if (/\.(gif|jpe?g|png|svg)$/.test(name ?? '')) {
                        //         return 'assets/images/[name]-[hash][extname]';
                        //     }
                        //     if (/\.css$/.test(name ?? '')) {
                        //         return 'assets/css/[name]-[hash][extname]';
                        //     }
                        //     }
                        //     return 'assets/[name]-[hash][extname]';
                        // }
                    }
                }
            },
            server: {
                host: '0.0.0.0',
                port: findPort,
                watch: {
                    ignored: ['**/node_modules/**/*', '**/.git/**/*']
                }
            }
        },
        yiteConfig?.viteConfig || {}
    );

    return viteConfig;
});
