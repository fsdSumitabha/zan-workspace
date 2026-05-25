import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext"
import { ImageKitProvider } from "@imagekit/next"

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
                    </ImageKitProvider>
                </AuthProvider>
            </body>
        </html>
    );
}
