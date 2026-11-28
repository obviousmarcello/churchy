"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@base-ui/react/dialog";

import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_FORM_CLASS,
  DIALOG_POPUP_CLASS,
  DialogActions,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/music/dialog-parts";
import { Field } from "@/components/music/form-field";
import { Button } from "@/components/music/ui/button";
import { Input } from "@/components/music/ui/input";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { cn } from "@/lib/music/utils";
import {
  COURSE_LANGUAGES,
  COURSE_TITLE_MAX_LENGTH,
  type CourseLanguage,
} from "@/lib/music/courses";
import { createCourseAction } from "./actions-client";

/** "New course": a title and a language. Then the editor of the new draft opens. */
export function NewCourseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { m, locale } = useI18n();
  const t = m.courses.newCourse;
  const id = useId();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<CourseLanguage>(locale === "hu" ? "hu" : "en");
  const [error, setError] = useState<string | null>(null);
  const [pending, startCreate] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startCreate(async () => {
      const result = await createCourseAction({ title, language });
      if (result.status === "success") {
        router.push(`/munkater/kepzesek/${result.id}/edit`);
        onOpenChange(false);
        setTitle("");
      } else {
        setError(result.issues[0]?.message ?? result.message);
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP_CLASS} />
        <Dialog.Popup className={cn(DIALOG_POPUP_CLASS, "w-md")}>
          <DialogHeader>
            <Dialog.Title className="font-heading text-lg font-semibold tracking-tight">
              {t.title}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted">{t.description}</Dialog.Description>
          </DialogHeader>
          <form onSubmit={submit} className={DIALOG_FORM_CLASS}>
            <DialogBody>
              <Field
                name={`${id}-title`}
                label={t.courseTitle}
                errors={error ? [error] : undefined}
              >
                <Input
                  id={`${id}-title`}
                  required
                  autoFocus
                  maxLength={COURSE_TITLE_MAX_LENGTH}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  aria-invalid={error !== null || undefined}
                  aria-describedby={`${id}-title-description`}
                />
              </Field>
              <Field name={`${id}-language`} label={t.language} hint={t.languageHint}>
                <NativeSelect
                  id={`${id}-language`}
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as CourseLanguage)}
                  aria-describedby={`${id}-language-description`}
                >
                  {COURSE_LANGUAGES.map((code) => (
                    <option key={code} value={code}>
                      {m.courses.languages[code]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </DialogBody>
            <DialogFooter>
              <DialogActions>
                <Dialog.Close render={<Button type="button" variant="ghost" disabled={pending} />}>
                  {m.common.actions.cancel}
                </Dialog.Close>
                <Button type="submit" disabled={pending}>
                  {pending ? t.creating : t.create}
                </Button>
              </DialogActions>
            </DialogFooter>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
