import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext"
import { ImageKitProvider } from "@imagekit/next"
import { SWRegister } from "./sw-register";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Zan Services",
    description: "Zan Services - leading web development, mobile app, AI & digital marketing company in Kolkata, India. 150+ projects delivered. Get a free consultation today.",
};

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#4A6FA5" },
        { media: "(prefers-color-scheme: dark)", color: "#183668" },
    ],
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} >
                <AuthProvider>
                    <ImageKitProvider urlEndpoint={process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT!}>
                    <Toaster position="top-center" theme="dark" richColors />
                    {children}
                    <SWRegister />
                    </ImageKitProvider>
                </AuthProvider>
            </body>
        </html>
    );
}
