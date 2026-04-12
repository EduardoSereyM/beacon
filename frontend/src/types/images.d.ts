/**
 * BEACON PROTOCOL — Type declarations for static image imports.
 * Allows TypeScript to understand PNG/JPG/SVG imports used in Next.js
 * (e.g. `import logo from "@/asset/brand/logo.png"`).
 */

declare module "*.png" {
    const src: string;
    export default src;
}

declare module "*.jpg" {
    const src: string;
    export default src;
}

declare module "*.jpeg" {
    const src: string;
    export default src;
}

declare module "*.svg" {
    const src: string;
    export default src;
}

declare module "*.webp" {
    const src: string;
    export default src;
}
