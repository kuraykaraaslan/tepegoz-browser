/**
 * Types for `eslint.native-i18n.config.mjs`, so the gate's own test can import the selectors without
 * a `@ts-expect-error` (which would make every value from this module `any` and defeat the strict
 * rules the repo holds test code to).
 */
export declare const NATIVE_I18N_MESSAGE: string;
export declare const nativeI18nSelectors: { selector: string; message: string }[];
