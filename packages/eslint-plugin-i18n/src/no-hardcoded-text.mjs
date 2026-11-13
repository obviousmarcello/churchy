/**
 * `i18n/no-hardcoded-text` — user-visible text must come from messages/hu.json (PRD L-01).
 *
 * Reports:
 *  - JSX text with at least one letter (`<p>Isten hozta!</p>`),
 *  - string / template literals rendered as JSX children (`{"Mentés"}`, `{ok ? "Igen" : "Nem"}`),
 *  - string literals in user-facing props (`title`, `aria-label`, `alt`, `placeholder`, `label`, …,
 *    and camelCase props ending in Label / Title / Text / Description / …),
 *  - the same keys inside object / array literals passed as props
 *    (`nav={[{ label: "Kezdőlap" }]}`) and in `export const metadata = { title: "…" }`.
 *
 * Allowlist (never reported): strings without a letter (punctuation, digits, symbols, `·`, `©`),
 * "technical" strings (CSS custom properties, URLs, paths, e-mail/tel links, lower-case kebab or
 * snake identifiers like `image-full`), every prop that is not user-facing (`className`, `id`,
 * `href`, `type`, `data-*`, …), and text inside `<code>`, `<kbd>`, `<samp>`, `<var>`, `<style>`,
 * `<script>`. Anything else needs `// eslint-disable-next-line i18n/no-hardcoded-text -- reason`.
 *
 * Options: { attributes?: string[], ignoreElements?: string[], allowedStrings?: string[] }
 * (each extends the defaults).
 */

const DEFAULT_ATTRIBUTES = [
  "title",
  "alt",
  "placeholder",
  "label",
  "labels",
  "description",
  "heading",
  "caption",
  "summary",
  "tooltip",
  "eyebrow",
  "lead",
  "help",
  "error",
  "message",
  "note",
  "text",
  "subtitle",
  "hint",
  "legend",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
];

/** camelCase props such as `skipLinkLabel`, `closeLabel`, `optionalLabel`, `dialogTitle`. */
const USER_FACING_SUFFIX =
  /(?:Label|Title|Text|Description|Placeholder|Heading|Caption|Alt|Tooltip|Hint|Message|Eyebrow)s?$/;

const DEFAULT_IGNORE_ELEMENTS = ["code", "kbd", "samp", "var", "style", "script"];

const LETTER = /\p{L}/u;

const TECHNICAL = [
  /^(?:--|#|\/|\.{1,2}\/|@|https?:|mailto:|tel:)\S*$/i, // css vars, anchors, paths, links
  /^[a-z0-9]+(?:[-_.:/][a-z0-9]+)+$/, // lower-case kebab / snake / dotted identifiers
];

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hard-coded user-visible text; it must live in messages/hu.json (PRD L-01).",
    },
    schema: [
      {
        type: "object",
        properties: {
          attributes: { type: "array", items: { type: "string" } },
          ignoreElements: { type: "array", items: { type: "string" } },
          allowedStrings: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      hardcodedText:
        'Hard-coded user-visible text "{{text}}". Move it to messages/hu.json and read it through next-intl (useTranslations / getTranslations); see CLAUDE.md "Language & locale".',
    },
  },

  create(context) {
    const options = context.options[0] ?? {};
    const attributes = new Set([...DEFAULT_ATTRIBUTES, ...(options.attributes ?? [])]);
    const ignoreElements = new Set([...DEFAULT_IGNORE_ELEMENTS, ...(options.ignoreElements ?? [])]);
    const allowedStrings = new Set(options.allowedStrings ?? []);

    const isUserFacingName = (name) => attributes.has(name) || USER_FACING_SUFFIX.test(name);

    function isUserText(raw) {
      const text = raw.replace(/\s+/g, " ").trim();
      if (!LETTER.test(text)) return false;
      if (allowedStrings.has(text)) return false;
      return !TECHNICAL.some((re) => re.test(text));
    }

    function report(node, raw) {
      const text = raw.replace(/\s+/g, " ").trim();
      context.report({
        node,
        messageId: "hardcodedText",
        data: { text: text.length > 40 ? `${text.slice(0, 37)}…` : text },
      });
    }

    function keyName(prop) {
      if (prop.type !== "Property" || prop.computed) return null;
      if (prop.key.type === "Identifier") return prop.key.name;
      if (prop.key.type === "Literal" && typeof prop.key.value === "string") return prop.key.value;
      return null;
    }

    /** `node` is rendered as text: report string leaves, descend into object/array literals. */
    function scanText(node) {
      if (!node) return;
      switch (node.type) {
        case "Literal":
          if (typeof node.value === "string" && isUserText(node.value)) report(node, node.value);
          break;
        case "TemplateLiteral": {
          const raw = node.quasis.map((q) => q.value.cooked ?? q.value.raw).join("");
          if (isUserText(raw)) report(node, raw);
          break;
        }
        case "ConditionalExpression":
          scanText(node.consequent);
          scanText(node.alternate);
          break;
        case "LogicalExpression":
          scanText(node.left);
          scanText(node.right);
          break;
        case "TSAsExpression":
        case "TSSatisfiesExpression":
        case "TSNonNullExpression":
          scanText(node.expression);
          break;
        case "ArrayExpression":
          for (const el of node.elements) scanText(el);
          break;
        case "ObjectExpression":
          // e.g. `labels={{ openMenu: "…", closeMenu: "…" }}`: every value is text.
          for (const prop of node.properties) if (prop.type === "Property") scanText(prop.value);
          break;
        default:
      }
    }

    /** `node` is data passed to a component: only user-facing keys are text. */
    function scanStructure(node) {
      if (!node) return;
      switch (node.type) {
        case "ArrayExpression":
          for (const el of node.elements) scanStructure(el);
          break;
        case "ObjectExpression":
          for (const prop of node.properties) {
            if (prop.type !== "Property") continue;
            const name = keyName(prop);
            if (name !== null && isUserFacingName(name)) scanText(prop.value);
            else scanStructure(prop.value);
          }
          break;
        case "TSAsExpression":
        case "TSSatisfiesExpression":
          scanStructure(node.expression);
          break;
        default:
      }
    }

    function insideIgnoredElement(node) {
      for (let n = node.parent; n; n = n.parent) {
        if (n.type === "JSXElement") {
          const id = n.openingElement.name;
          if (id.type === "JSXIdentifier" && ignoreElements.has(id.name)) return true;
        }
      }
      return false;
    }

    return {
      JSXText(node) {
        if (isUserText(node.value) && !insideIgnoredElement(node)) report(node, node.value);
      },

      JSXExpressionContainer(node) {
        // Only children; attribute values are handled in JSXAttribute.
        if (node.parent.type === "JSXAttribute") return;
        if (node.expression.type === "JSXEmptyExpression") return;
        if (insideIgnoredElement(node)) return;
        scanText(node.expression);
      },

      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier") return;
        const name = node.name.name;
        const value = node.value;
        if (!value) return;
        const expression = value.type === "JSXExpressionContainer" ? value.expression : value;
        if (isUserFacingName(name)) {
          scanText(expression);
        } else if (value.type === "JSXExpressionContainer") {
          // `nav={[{ label: "Kezdőlap" }]}`: look for user-facing keys inside data props.
          scanStructure(expression);
        }
      },

      VariableDeclarator(node) {
        // Next.js page metadata: `export const metadata = { title: "…", description: "…" }`.
        if (node.id.type === "Identifier" && node.id.name === "metadata") scanStructure(node.init);
      },
    };
  },
};
