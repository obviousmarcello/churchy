import messages from "@messages/hu.json";

export default function HomePage() {
  const t = messages.public.home;
  return (
    <>
      <h1>{t.placeholderTitle}</h1>
      <p>{t.placeholderLead}</p>
    </>
  );
}
