import { redirect } from "next/navigation";

/** Link target of booking notifications (`booking.requested` / `booking.decided`). */
export default async function BookingLinkRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/munkater/foglalas/${id}`);
}
