/**
 * Narrow runtime boundary for the conditionally loaded browser SDK.
 *
 * Re-exporting only `init` lets the bundler tree-shake the asynchronous chunk;
 * importing the package namespace directly retained unrelated Next.js SDK code.
 */
export { init } from "@sentry/nextjs";
