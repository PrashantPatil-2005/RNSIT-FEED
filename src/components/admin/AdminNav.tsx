import Link from "next/link";
import { ADMIN_SECTIONS } from "@/lib/admin/labels";

export function AdminNav({ current }: { current: (typeof ADMIN_SECTIONS)[number]["href"] }) {
  return (
    <nav aria-label="Admin sections" className="queue-tabs">
      {ADMIN_SECTIONS.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          className="queue-tab"
          aria-current={s.href === current ? "page" : undefined}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
