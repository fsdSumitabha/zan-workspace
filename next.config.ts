import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

const withSerwist = withSerwistInit({
    swSrc: "src/app/sw.ts",
    swDest: "public/sw.js",
    // Disable in dev so HMR isn't fighting the SW cache
    disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "ik.imagekit.io"
            }
        ]
    }
};

export default withSerwist(nextConfig);
