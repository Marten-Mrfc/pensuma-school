"use client";

import { useEffect, useState } from "react";
import type { HighlighterCore, LanguageRegistration, ThemedToken } from "shiki/core";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/* ------------------------------------------------------------------ */
/* Lazy Shiki highlighter (JS regex engine, no wasm)                   */
/* ------------------------------------------------------------------ */

type LangModule = { default: LanguageRegistration[] };

const LANG_LOADERS: Record<string, () => Promise<LangModule>> = {
  python: () => import("shiki/langs/python.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
};

const LANG_ALIASES: Record<string, string> = {
  py: "python",
  python3: "python",
  js: "javascript",
  ts: "typescript",
  sh: "bash",
  shell: "bash",
  console: "bash",
};

const LANG_LABELS: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  html: "HTML",
  css: "CSS",
  sql: "SQL",
  json: "JSON",
  bash: "Terminal",
};

export function normalizeLanguage(lang: string | undefined | null): string | null {
  if (!lang) return null;
  const key = lang.toLowerCase();
  const resolved = LANG_ALIASES[key] ?? key;
  return LANG_LOADERS[resolved] ? resolved : null;
}

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<string>();

async function getHighlighter(lang: string): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore, createCssVariablesTheme }, { createJavaScriptRegexEngine }] =
        await Promise.all([import("shiki/core"), import("shiki/engine/javascript")]);
      return createHighlighterCore({
        themes: [
          createCssVariablesTheme({
            name: "pensuma",
            variablePrefix: "--shiki-",
            fontStyle: true,
          }),
        ],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      });
    })();
  }
  const highlighter = await highlighterPromise;
  if (!loadedLangs.has(lang)) {
    const loader = LANG_LOADERS[lang];
    if (loader) {
      const mod = await loader();
      await highlighter.loadLanguage(...mod.default);
      loadedLangs.add(lang);
    }
  }
  return highlighter;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export interface HighlightedCodeProps {
  code: string;
  /** e.g. "python" / "py". Unknown languages render as plain text. */
  language?: string | null;
  /** Show the language label + copy button. Default true. */
  showHeader?: boolean;
  /** Show line numbers. Default: when the code has more than 3 lines. */
  showLineNumbers?: boolean;
  className?: string;
}

/** Read-only, syntax-highlighted code block using the shared Pensuma code colours. */
export function HighlightedCode({
  code,
  language,
  showHeader = true,
  showLineNumbers,
  className,
}: HighlightedCodeProps) {
  const lang = normalizeLanguage(language);
  const source = code.replace(/\n$/, "");
  const [result, setResult] = useState<{ key: string; tokens: ThemedToken[][] } | null>(
    null,
  );
  const key = `${lang}::${source}`;

  useEffect(() => {
    if (!lang) return;
    let cancelled = false;
    getHighlighter(lang)
      .then((highlighter) => {
        if (cancelled) return;
        const { tokens } = highlighter.codeToTokens(source, { lang, theme: "pensuma" });
        setResult({ key: `${lang}::${source}`, tokens });
      })
      .catch(() => {
        // Plain text fallback is already on screen.
      });
    return () => {
      cancelled = true;
    };
  }, [lang, source]);

  const tokens = result?.key === key ? result.tokens : null;
  const lines = source.split("\n");
  const numbered = showLineNumbers ?? lines.length > 3;
  const label = lang ? LANG_LABELS[lang] : language || "Code";

  return (
    <div
      data-slot="highlighted-code"
      className={cn(
        "group/code overflow-hidden rounded-lg border bg-[var(--code-bg)] text-[var(--code-fg)]",
        className,
      )}
    >
      {showHeader ? (
        <div className="flex h-9 items-center justify-between gap-2 border-b bg-muted/40 pr-1.5 pl-3">
          <span className="font-mono text-[0.7rem] font-medium tracking-wider text-muted-foreground uppercase">
            {label}
          </span>
          <CopyButton value={source} size="icon-xs" successMessage={null} />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <pre className="m-0 flex min-w-max py-3 font-mono text-[0.84rem] leading-6">
          {numbered ? (
            <span
              aria-hidden="true"
              className="sticky left-0 flex flex-col bg-[var(--code-bg)] pr-3 pl-3 text-right text-[var(--code-gutter)] tabular-nums select-none"
            >
              {lines.map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: line numbers are positional
                <span key={i}>{i + 1}</span>
              ))}
            </span>
          ) : null}
          <code className={cn("block flex-1 pr-4", numbered ? "pl-1" : "pl-4")}>
            {tokens
              ? tokens.map((line, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                  <span key={i} className="block min-h-6">
                    {line.map((token, j) => (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional
                        key={j}
                        style={{
                          color: token.color,
                          // Shiki FontStyle bit flags: 1 = italic, 2 = bold.
                          fontStyle: (token.fontStyle ?? 0) & 1 ? "italic" : undefined,
                          fontWeight: (token.fontStyle ?? 0) & 2 ? 600 : undefined,
                        }}
                      >
                        {token.content}
                      </span>
                    ))}
                  </span>
                ))
              : lines.map((line, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                  <span key={i} className="block min-h-6">
                    {line}
                  </span>
                ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
