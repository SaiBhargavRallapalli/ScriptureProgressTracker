"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/scriptures", label: "Scriptures" },
  { href: "/settings", label: "Settings" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-amber-900/10 bg-amber-50/80 backdrop-blur dark:border-amber-100/10 dark:bg-neutral-950/80">
      <nav className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-3">
        <span className="mr-4 text-sm font-semibold tracking-tight text-amber-900 dark:text-amber-200">
          Scripture Tracker
        </span>
        {links.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-amber-700 text-white"
                  : "text-amber-900/70 hover:bg-amber-900/5 dark:text-amber-100/70 dark:hover:bg-amber-100/10"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
