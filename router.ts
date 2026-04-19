import { patterns } from '/urls.ts';
import { writable } from 'svelte/store';
import { error as svelteError } from '@sveltejs/kit';

export interface File {
    (): object;
}

export interface Error {
    (): object;
}

export interface Layout {
    page: File,
    server?: File,
    universal?: File,
    error?: Error,
    [key: string]: unknown;
}

export interface Pattern {
    path: string,
    page: File,
    layouts?: Layout[],
    server?: File,
    universal?: File,
    error?: Error,
    [key: string]: unknown;

    // Controlled by router dynamically
    re?: RegExp,
}

export interface Route {
    pattern: Pattern,
    slugs: object,
    page: object,
    layouts: object[],
}

function formatSvelteError(e) {
    if (!e.frame) return e.message || e; // Fallback for non-compiler errors
    const [red, dim, reset, bold] = ['\x1b[31m', '\x1b[2m', '\x1b[0m', '\x1b[1m'];
    return [
        `${red}${bold}${e.code}${reset}: ${e.message || 'Compilation error'}`,
        `${dim}${e.id}:${e.loc.line}:${e.loc.column}${reset}`, '', e.frame, ''
    ].join('\n');
}

export const routeStore = writable();

export const Router: any = {}

Router.findPattern = function(pathname) {
    for (const pattern of patterns) {
        pattern.re = new RegExp('^\/' + pattern.path.replace(/<\w+>/g, '') + '\/?$');
        if (pattern.re.test(pathname)) {
            return pattern;
        }
    }
    svelteError(404, 'Not Found');
}

Router.buildRoute = async function(pattern, url) {
    function getSlugs(pattern, url) {
        const result = {}
        const slugs = pattern.path.match(/<\w+>/g)?.map(slug => slug.replace('<', '').replace('>', '')) || [];
        const matches = pattern.re.exec(url.pathname);
        for (const [index, match] of Object.entries(matches) as any) {
            const int_index = parseInt(index);
            if (int_index && int_index > 0) {
                result[slugs[index - 1]] = match
            }
        }
        return result;
    }
    const route: Route | any = {};
    route.pattern = pattern;
    route.slugs = getSlugs(pattern, url);
    try {
        route.page = (await pattern.page()).default;
        route.layouts = await Promise.all((pattern.layouts || []).map(async x => (await x.page()).default));
    } catch(e) {
        console.error(formatSvelteError(e));
        throw e;
    }
    return route;
}

Router.callLoads = async function(params, route, isServer) {
    for (const pattern of [...(route.pattern.layouts || []), route.pattern]) {
        let module;
        let load;
        if (isServer) {
            if (pattern.server) {
                module = await pattern.server();
                load = module.server || module.load;
            } else {
                module = await pattern.page();
                load = module.server;
            }
        } else {
            if (pattern.universal) {
                module = await pattern.universal();
                load = module.universal || module.load;
            } else {
                module = await pattern.page();
                load = module.universal || module.load;
            }
        }
        if (load) {
            const data = await load({...params, slugs: route.slugs || []});
            params.data = {...params.data, ...data};
        }
    }
    return params.data;
}

Router.error = async function(pathname) {
    async function findError(pattern) {
        for (const page of [...(pattern?.layouts || []), pattern].reverse()) {
            if (page.error) {
                return (await page.error()).default;
            }
        }
    }
    const pattern = Router.findPattern(pathname);
    const error = findError(pattern);
    return error;
}

Router.route = async function(params: any, isServer: boolean) {
    const pattern = Router.findPattern(params.url.pathname);
    const route = await Router.buildRoute(pattern, params.url);
    const data = await Router.callLoads(params, route, isServer);
    routeStore.update((x: any) => ({...x, ...route}));
    return data;
}
