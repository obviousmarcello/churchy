import Link from "next/link";
import { PlusIcon } from "lucide-react";

import { buttonVariants } from "@/components/music/ui/button";

// Only song admins and superadmins see the link (`canEditSongs`). This only
// hides it: `createSong` checks the song admin role again on save.
export function AddSongLink({
  variant,
  children,
}: {
  variant?: "outline";
  children: React.ReactNode;
}) {
  return (
    <Link href="/munkater/enektar/uj" className={buttonVariants({ variant })}>
      <PlusIcon />
      {children}
    </Link>
  );
}
