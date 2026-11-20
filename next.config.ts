import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    /**
     * MJML stays out of the bundle.
     *
     * It is a Node library that loads its component packages at runtime and
     * reads their package.json files. A bundler that inlines it either
     * breaks that lookup or silently drops components, and the failure shows
     * up as a template compiling to the wrong HTML rather than as a build
     * error. Keeping it external means the server requires the real package.
     *
     * Only the server ever imports it. The editor compiles in the browser
     * with mjml-browser, which grapesjs-mjml brings in.
     */
    serverExternalPackages: ["mjml"],

    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "ik.imagekit.io"
            }
        ]
    }
};

export default nextConfig;
