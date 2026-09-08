import type { Metadata } from "next";
import { APP_NAME } from "@hpc/shared";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: APP_NAME, template: "%s · " + APP_NAME },
  description: "University Beowulf cluster workspace",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
