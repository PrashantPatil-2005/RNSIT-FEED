import Link from "next/link";
import { signOut } from "@/app/auth/actions";
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
  const staff = viewer.profile?.role === "moderator" || viewer.profile?.role === "admin";
  return (
    <div className={variant === "bar" ? "auth-bar" : "auth-menu"}>
      {staff && !needsSetup ? (
        <Link className={variant === "bar" ? "btn-link" : "nav-link"} href="/moderation">
          Moderation
        </Link>
      ) : null}
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
