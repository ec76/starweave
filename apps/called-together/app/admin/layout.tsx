import type { Metadata } from "next";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin | Called Together",
  robots: { index: false, follow: false },
  // Native form POSTs need their Origin; no-referrer serializes it as "null".
  // Cross-origin destinations still receive no Referer under same-origin.
  referrer: "same-origin",
};
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
