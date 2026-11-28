import { LogOutIcon, buttonClasses } from "@churchy/ui";
import { signOut } from "@/server/demo-actions";

/**
 * *Kilépés*: a form button that ends the session (the visitor persona in the demo) and returns to
 * the landing page. Used in the admin frame and in the header of the workspace and the diocesan
 * portal; works without JavaScript.
 */
export function SignOutButton({ label }: { label: string }) {
  return (
    <form action={signOut} className="contents">
      <button
        type="submit"
        data-testid="sign-out"
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        <LogOutIcon />
        {label}
      </button>
    </form>
  );
}
