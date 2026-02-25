
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/duplicates" | "/duplicates/review" | "/library" | "/player" | "/settings";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/duplicates": Record<string, never>;
			"/duplicates/review": Record<string, never>;
			"/library": Record<string, never>;
			"/player": Record<string, never>;
			"/settings": Record<string, never>
		};
		Pathname(): "/" | "/duplicates" | "/duplicates/review" | "/library" | "/player" | "/settings";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/bootstrap.bundle.min.js" | "/bootstrap.min.css" | "/favicon.png" | string & {};
	}
}