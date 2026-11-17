import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { StaffMenu } from "@/components/layout/StaffMenu";
import { staffLinksFor } from "@/lib/auth/permissions";
import { getViewer } from "@/lib/auth/session";

/** Header account area. `variant="menu"` renders the same controls as mobile-menu items. */
export async function AuthControls({ variant = "bar" }: { variant?: "bar" | "menu" }) {
  const viewer = await getViewer();
  const linkClass = variant === "bar" ? "btn btn--secondary btn--small" : "nav-link";

  if (!viewer) {
    return (
      <Link className={linkClass} href="/sign-in">
        Sign in
      </Link>
    );
  }
  const needsSetup = !viewer.profile?.onboarded;
  const firstName = viewer.profile?.fullName.split(/\s+/)[0] ?? "Account";
  // Staff links come from one place (permissions.ts); pages and the database enforce the role.
  const staffLinks = needsSetup
    ? []
    : staffLinksFor(viewer.profile?.role).map(({ href, label }) => ({ href, label }));
  return (
    <div className={variant === "bar" ? "auth-bar" : "auth-menu"}>
      {staffLinks.length === 0 ? null : variant === "bar" ? (
        <StaffMenu links={staffLinks} />
      ) : (
        <nav className="auth-menu__staff" aria-label="Staff pages">
          <p className="auth-menu__heading">Staff</p>
          {staffLinks.map((l) => (
            <Link key={l.href} className="nav-link" href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
      <Link className={linkClass} href={needsSetup ? "/onboarding" : "/account"}>
        {needsSetup ? "Finish setup" : firstName}
        <span className="visually-hidden">{needsSetup ? "" : ", your account"}</span>
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className={variant === "bar" ? "btn-link" : "nav-link nav-link--button"}
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
