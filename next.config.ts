import type { NextConfig } from "next";

/** next-auth/react がクライアントで参照するため、ビルド時に確実に埋め込む */
const nextAuthUrl =
  process.env.NEXTAUTH_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const nextConfig: NextConfig = {
  env: {
    NEXTAUTH_URL: nextAuthUrl,
  },
};

export default nextConfig;
