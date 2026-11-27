"use client";

import { useScriptureTranslations } from "@/components/music/app-config";
import { NativeSelect } from "@/components/music/ui/native-select";
import { useI18n } from "@/i18n/music/client";
import { cn } from "@/lib/music/utils";
import {
  fullTextTranslations,
  resolveTranslation,
  scriptureLanguages,
  translationsOf,
} from "@/lib/music/scripture/translations";

/**
 * The language and the translation of a scripture reading: two selects. A
 * change of the language selects its first translation. `title`: the
 * reference, for the accessible names. Only the translations that are on
 * (the Bible translations tab of Configuration). When all are off: a note that says so, or
 * nothing with `offNote={false}` (when the page shows it in another place).
 * `pasted`: with the translations of the shared cache (see `translations.ts`).
 */
export function ScriptureTranslationSelect({
  value,
  onChange,
  title,
  pasted = true,
  offNote = true,
  className,
}: {
  /** Null: the default translation. */
  value: string | null;
  onChange: (translation: string) => void;
  title: string;
  pasted?: boolean;
  offNote?: boolean;
  className?: string;
}) {
  const { m, format, locale } = useI18n();
  const t = m.components.scriptureTranslation;
  const enabled = useScriptureTranslations();
  const translations = pasted ? enabled : fullTextTranslations(enabled);
  const current = resolveTranslation(value, translations);
  if (!current)
    return offNote ? (
      <p className={cn("text-xs text-muted-foreground", className)}>{t.allOff}</p>
    ) : null;
  const languageNames = new Intl.DisplayNames([locale], { type: "language" });
  const languages = scriptureLanguages(translations);

  return (
    <div className={cn("flex min-w-0 gap-2", className)}>
      {/* Hungarian only (PLAN §11): the language select shows only if a church has a text in another language. */}
      {languages.length > 1 && (
        <NativeSelect
          aria-label={format(t.languageOf, { title })}
          title={t.language}
          value={current.language}
          onChange={(event) => onChange(translationsOf(translations, event.target.value)[0]!.id)}
          className="w-auto"
        >
          {languages.map((language) => (
            <option key={language} value={language}>
              {languageNames.of(language) ?? language}
            </option>
          ))}
        </NativeSelect>
      )}
      <NativeSelect
        aria-label={format(t.translationOf, { title })}
        title={current.name}
        value={current.id}
        onChange={(event) => onChange(event.target.value as string)}
        className="w-auto min-w-0"
      >
        {translationsOf(translations, current.language).map((translation) => (
          <option key={translation.id} value={translation.id}>
            {translation.shortName}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
