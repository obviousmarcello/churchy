// D-05 [BE]: every server mutation goes through the policy wrapper (apps/web/server/policy.ts).
// The rule fails on any server action or mutating route handler that is not built with one of the
// wrappers imported from "@/server/policy". Kept in its own module (imported by eslint.config.mjs)
// so it is easy to find and test (apps/web/lint/policy-wrapper-rule.test.ts).

const WRAPPER_MODULE = "@/server/policy";

/** Server-action wrappers and the files each may be used in (`null` = anywhere). */
const ACTION_WRAPPERS = {
  withPolicy: null,
  // Anonymous public-site submissions only.
  publicAction: /\/apps\/web\/app\/\(public\)\//,
  // Demo switcher and developer tools only.
  demoAction: /\/apps\/web\/(server\/demo-actions\.ts$|app\/fejlesztes\/)/,
};

/** Route-handler wrappers for mutating methods. */
const ROUTE_WRAPPERS = { withPolicyRoute: null };

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ROUTE_FILE = /\/apps\/web\/app\/(.*\/)?route\.(ts|tsx|js|mjs)$/;

const isUseServer = (node) =>
  node.type === "ExpressionStatement" &&
  node.expression.type === "Literal" &&
  node.expression.value === "use server";

/** @type {import("eslint").Rule.RuleModule} */
const requirePolicyWrapper = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Server actions and mutating route handlers must be wrapped with withPolicy()/withPolicyRoute() from @/server/policy (D-05).",
    },
    schema: [],
    messages: {
      unwrapped:
        "Server action '{{name}}' is not wrapped. Export it as `const {{name}} = withPolicy(action, resolveResource, handler)` from @/server/policy so it goes through can() (D-05).",
      unwrappedRoute:
        "Route handler '{{name}}' mutates data but is not wrapped. Export it as `const {{name}} = withPolicyRoute(action, resolveResource, handler)` from @/server/policy (D-05).",
      wrapperNotAllowedHere:
        "'{{wrapper}}' is an exemption that is not allowed in this file; use withPolicy() (D-05).",
      inlineServerAction:
        "Inline 'use server' functions cannot be checked. Define server actions in a 'use server' module and wrap them with withPolicy() (D-05).",
      reexport:
        "Do not re-export server actions or route handlers; export the wrapped value where it is defined (D-05).",
    },
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    const isRouteFile = ROUTE_FILE.test(filename);
    /** Local name → imported wrapper name, for imports from WRAPPER_MODULE only. */
    const wrappers = new Map();
    let serverModule = false;

    /** Checks `init` is a call of an allowed wrapper; reports otherwise. */
    function checkWrapped(reportNode, init, name, allowed, unwrappedId) {
      const imported =
        init?.type === "CallExpression" && init.callee.type === "Identifier"
          ? wrappers.get(init.callee.name)
          : undefined;
      if (imported === undefined || !Object.hasOwn(allowed, imported)) {
        context.report({ node: reportNode, messageId: unwrappedId, data: { name } });
        return;
      }
      const where = allowed[imported];
      if (where !== null && !where.test(filename)) {
        context.report({
          node: init,
          messageId: "wrapperNotAllowedHere",
          data: { wrapper: imported },
        });
      }
    }

    function checkExport(reportNode, name, init) {
      if (serverModule) {
        checkWrapped(reportNode, init, name, ACTION_WRAPPERS, "unwrapped");
      } else if (isRouteFile && MUTATING_METHODS.has(name)) {
        checkWrapped(reportNode, init, name, ROUTE_WRAPPERS, "unwrappedRoute");
      }
    }

    return {
      Program(program) {
        for (const statement of program.body) {
          if (isUseServer(statement)) serverModule = true;
          if (statement.type !== "ExpressionStatement" || statement.directive === undefined) break;
        }
        for (const statement of program.body) {
          if (statement.type !== "ImportDeclaration" || statement.source.value !== WRAPPER_MODULE) {
            continue;
          }
          for (const spec of statement.specifiers) {
            if (spec.type === "ImportSpecifier" && spec.imported.type === "Identifier") {
              wrappers.set(spec.local.name, spec.imported.name);
            }
          }
        }
      },
      // A "use server" directive inside a function body (inline server action).
      "FunctionDeclaration > BlockStatement > ExpressionStatement, FunctionExpression > BlockStatement > ExpressionStatement, ArrowFunctionExpression > BlockStatement > ExpressionStatement"(
        node,
      ) {
        if (isUseServer(node)) context.report({ node, messageId: "inlineServerAction" });
      },
      ExportNamedDeclaration(node) {
        if (node.exportKind === "type") return;
        const decl = node.declaration;
        if (decl === null || decl === undefined) {
          if (!serverModule && !isRouteFile) return;
          for (const spec of node.specifiers) {
            if (spec.exportKind === "type") continue;
            const name = spec.exported.type === "Identifier" ? spec.exported.name : "";
            if (serverModule || MUTATING_METHODS.has(name)) {
              context.report({ node: spec, messageId: "reexport" });
            }
          }
          return;
        }
        if (decl.type === "FunctionDeclaration") {
          checkExport(decl, decl.id?.name ?? "default", null);
        } else if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            const name = d.id.type === "Identifier" ? d.id.name : "";
            checkExport(d, name, d.init);
          }
        }
        // Types, interfaces and enums are not runtime exports.
      },
      ExportDefaultDeclaration(node) {
        if (serverModule) {
          const d = node.declaration;
          const init = d.type === "CallExpression" ? d : null;
          checkWrapped(node, init, "default", ACTION_WRAPPERS, "unwrapped");
        }
      },
      ExportAllDeclaration(node) {
        if (serverModule || isRouteFile) context.report({ node, messageId: "reexport" });
      },
    };
  },
};

export const policyPlugin = { rules: { "require-policy-wrapper": requirePolicyWrapper } };

/** Flat-config block; imported by eslint.config.mjs. */
export const policyRulesConfig = [
  {
    files: ["apps/web/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    ignores: ["**/*.test.{ts,tsx}", "apps/web/e2e/**"],
    plugins: { policy: policyPlugin },
    rules: { "policy/require-policy-wrapper": "error" },
  },
];
