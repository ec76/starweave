"use client";
import { usePathname } from "next/navigation";
import NextLink from "next/link";
import { SiteHeader } from "@repo/ui";
export function SiteNavigation() {
  const pathname = usePathname() ?? "/";
  return (
    <SiteHeader
      brand="Called Together"
      brandHref="/"
      LinkComponent={NextLink}
      links={[
        { label: "Home", href: "/", active: pathname === "/" },
        {
          label: "Articles",
          href: "/articles",
          active: pathname === "/articles" || pathname.startsWith("/articles/"),
        },
        { label: "Explore Scripture", href: "/#explore-scripture" },
        { label: "Practical Guidance", href: "/#practical-guidance" },
        { label: "Their Stories", href: "/#their-stories" },
      ]}
    />
  );
}
