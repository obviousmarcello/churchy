import { Label } from "@/components/music/ui/label";

export function SectionHeading({
  title,
  description,
  descriptionId,
  level = 2,
}: {
  title: string;
  description?: React.ReactNode;
  /** The id of the description, for the `aria-describedby` of the controls that it explains. */
  descriptionId?: string;
  /** 3 for a section under a heading of level 2, e.g. the name of the selected item. */
  level?: 2 | 3;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <div className="flex flex-col gap-1">
      <Heading className="font-heading text-fs-5 font-bold tracking-tight">{title}</Heading>
      {description && (
        <p id={descriptionId} className="text-sm text-muted">
          {description}
        </p>
      )}
    </div>
  );
}

export function Field({
  name,
  label,
  hint,
  errors,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      <FieldMessage id={`${name}-description`} hint={hint} errors={errors} />
    </div>
  );
}

/** Shows the errors, or else the hint. */
export function FieldMessage({
  id,
  hint,
  errors,
}: {
  id: string;
  hint?: string;
  errors?: string[];
}) {
  if (errors && errors.length > 0) {
    return (
      <p id={id} className="text-sm text-danger">
        {errors.join(" ")}
      </p>
    );
  }
  if (!hint) return null;
  return (
    <p id={id} className="text-sm text-muted">
      {hint}
    </p>
  );
}
