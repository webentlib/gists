# MINIMAL EXAMPLE:

`urls.ts`:
```ts
const layout = {page: () => import('/src/base.svelte')};
export const patterns = [
    {path: '',                   page: () => import('/src/home.svelte'),        layouts: [layout]},
    {path: 'users',              page: () => import('/src/users/users.svelte'), layouts: [layout]},
    {path: 'users/(<id>[0-9]+)', page: () => import('/src/users/user.svelte'),  layouts: [layout]},
]
```

`users.svelte`
```sveltehtml
<script module>
    export async function load() {
        return {
            users: [...]
        }
    }
</script>
<script>
    let { data } = $props();
    ...
</script>
```

# INSTALLATION:

1. Download [router.ts](https://github.com/webentlib/gists/blob/main/router.ts) to some folder all external gists live, e.g.: /lab/.

2. Move `routes/` folder wherever you like, create `[...path]` folder inside.

3. Create 4 files:
`[...path]/+page.ts`:
```ts
import {Router} from '/lab/router.ts';
export async function load(params) {
    return await Router.route(params)
}
```

`[...path]/+page.server.ts`:
```ts
import {Router} from '/lab/router.ts';
export async function load(params) {
    return await Router.route(params, true)
}
```

`[...path]/+page.svelte`:
```sveltehtml
<script>
    import { routeStore } from '/lab/router.ts';
    const { data } = $props();
</script>
{#snippet draw(routeStore, index)}
    {@const Layout = routeStore.layouts[index]}
    {@const Page = routeStore.page}
    {#if routeStore.layouts.length && index < routeStore.layouts.length}
        <Layout {data}>
            {@render draw(routeStore, index + 1)}
        </Layout>
    {:else}
        <Page {data}/>
    {/if}
{/snippet}
{@render draw($routeStore, 0)}
```

`+error.svelte` (note — must be in `routes/`, not `[...path]`):
```sveltehtml
<script lang="ts">
	import { page } from '$app/state';
	import { Router } from '/lab/router.ts';
</script>
{#await Router.error(page.url.pathname) then Error}
    {#if !Error}
        <h1>{page.error.message}</h1>
    {:else}
        <Error/>
    {/if}
{/await}
```

4. Create urls in root (same level with `package.json`):
`urls.ts`:
```ts
const layout = {page: () => import('/src/base.svelte')};
export const patterns = [
    {path: '', page: () => import('/src/home.svelte'), layouts: [layout]},
    // {path: 'users/(<id>[0-9]+)', page: () => import('/src/users/user.svelte'), layouts: [layout]},
]
```

5. Create sample pages in `/src/`:
`base.svelte`:
```sveltehtml
<script>
    let { children } = $props();
</script>
{@render children?.()}
```
`home.svelte`:
```sveltehtml
Hello, world!
```

6. Point svelte to routes folder you want it to be in:
`svelte.config.ts`:
```ts
kit: {
    ...
    files: {
        routes: 'routes/',
    },
}
```

7. Allow vite look files in root:
`vite.config.ts`:
```ts
export default defineConfig({
	...
    server: {
        fs: {
            allow: ['..'],  // Allow serving files from one level up to the project root
        },
    }
});
```

# EXTENDED EXAMPLE:

`urls.ts`:
```ts
import type { Pattern, Layout, Error } from '/lab/router.ts';

const error: Error = {page: () => import('/src/error.svelte')};
const layout: Layout = {page: () => import('/src/base.svelte'), error: error};
const account: Layout = {page: () => import('/src/account.svelte')};

export const patterns: Pattern[] = [
    {path: '',                   page: () => import('/src/home.svelte'),          layouts: [layout], title: 'Home', h1: 'Welcome'},
    {path: 'users',              page: () => import('/src/users/users.svelte'),   layouts: [layout], name: 'users'},
    {path: 'users/(<id>[0-9]+)', page: () => import('/src/users/user.svelte'),    layouts: [layout]},
    {path: 'friends',            page: () => import('/src/users/users.svelte'),   layouts: [layout, account], name: 'friends'},
    {path: 'settings',           page: () => import('/src/users/account.svelte'), layouts: [layout, account]},
]
```

Yes. One can specify:
1. Layout array for any page.
2. For sure multiple patterns can point to same page like `users` and `friends` in example in case same template but different data. 
3. Custom error for any page or layout.
`error.svelte`:
```
<script lang="ts">
	import { page } from '$app/state';
</script>
<h1>{page.status}</h1>
<div>{page.error.message}</div>
```
4. `Pattern` and `Layout` has `universal` and `server` properties to point to `load` function in separate file: 
```js
    {path: '', universal: () => import('/src/home.server.js'), server: () => import('/src/home.js'), ...},
```
5. Add any custom attribute like `title`, `h1`, `name` to be used later in layout/page.
`base.svelte`:
```sveltehtml
<script>
    import { routeStore } from '/lab/router.ts';
    let { children } = $props();
</script>

{#if $routeStore.pattern.h1}
    <h1>{$routeStore.pattern.h1}</h1>
{/if}

{@render children?.()}
```

If one prefer both server and universal to be in `<script module>`:
`user.svelte`:
```sveltehtml
<script module>
    import { get } from 'svelte/store';
    import { routeStore } from '/lab/router.ts';
    export async function server() {  // in <script module> could be named only server
        const user_id = get(routeStore).slugs.id;
        ...
    }
    export async function universal() {  // could be named load
        const user_id = get(routeStore).slugs.id;
        ...
    }
</script>
```

# DOWNSIDES:

1. Both `+page.server.js` and `+page.js` runs on every rote. No way to say 'call only `+page.js`'.

2. `export const snapshow = {...}` not working.

3. No pragmatic way to specify options like `export let ssr = true;` probably one can do it like (not tested):
`urls.ts`:
```ts
    {path: '', options: { ssr: true }},
```
`+page.server.ts`:
```ts
import {Router} from '/lab/router.ts';

export let prerender = false;
export let entries = () => [];
export let ssr = true;
export let csr = true;
export let trailingSlash = 'never';
export let config = {};

export async function load(params) {
    const pattern = Router.findPattern(params.url.pathname);
    for (const [k, v] of Object.entries(pattern?.options || {})) {
        eval(`${k} = ${v}`);
    }
    return await Router.route(params, true)
}
```
Same for `+page.ts` but `return await Router.route(params, true)` must be `return await Router.route(params)` there.

# P.S.

That router is TS only, and was written with next tsconfig:
`tsconfig.json`:
```json
"rewriteRelativeImportExtensions": false,
"allowImportingTsExtensions": true,
"paths": {
    "/*": ["*"]
},
"noImplicitAny": false,
```