"use client";
import React, { useEffect, useRef, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { Box, Typography, IconButton } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useAppTheme } from "../styles/ThemeContext";
import { loadScript } from "../utils/fileParser";

const MONOSPACE_FONT = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

// ─── KaTeX loader (singleton promise) ───────────────────────────────────────
let katexLoadPromise = null;
const ensureKatex = () => {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.katex) return Promise.resolve(true);
  if (katexLoadPromise) return katexLoadPromise;
  katexLoadPromise = (async () => {
    try {
      if (!document.querySelector('link[href*="katex.min.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css";
        document.head.appendChild(link);
      }
      await loadScript("https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js");
      return !!window.katex;
    } catch (e) {
      console.error("Failed to load KaTeX:", e);
      return false;
    }
  })();
  return katexLoadPromise;
};

// ─── Prism loader (singleton promise) ───────────────────────────────────────
let prismLoadPromise = null;
const ensurePrism = (mode) => {
  if (typeof window === "undefined") return Promise.resolve(false);

  const themeUrl = mode === "light"
    ? "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css"
    : "https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css";

  let link = document.querySelector('link[id="prism-theme-link"]');
  if (!link) {
    link = document.createElement("link");
    link.id = "prism-theme-link";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== themeUrl) {
    link.href = themeUrl;
  }

  if (window.Prism) {
    return Promise.resolve(true);
  }
  if (prismLoadPromise) return prismLoadPromise;

  prismLoadPromise = (async () => {
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js");
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js");
      if (window.Prism && window.Prism.plugins && window.Prism.plugins.autoloader) {
        window.Prism.plugins.autoloader.languages_path = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/';
      }
      return !!window.Prism;
    } catch (e) {
      console.error("Failed to load Prism.js:", e);
      return false;
    }
  })();
  return prismLoadPromise;
};

// Whitelist of standard HTML tags that are safe for markdown-to-jsx to parse.
// Custom tags like <assistant>, <thought>, <system>, <user> are not in this list and will be escaped.
const ALLOWED_HTML_TAGS = new Set([
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi", "bdo", "blockquote",
  "body", "br", "button", "canvas", "caption", "cite", "code", "col", "colgroup", "data", "datalist",
  "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr",
  "html", "i", "iframe", "img", "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map",
  "mark", "menu", "meta", "meter", "nav", "noscript", "object", "ol", "optgroup", "option", "output",
  "p", "picture", "portal", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "script",
  "search", "section", "select", "slot", "small", "source", "span", "strong", "style", "sub",
  "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time",
  "title", "tr", "track", "u", "ul", "var", "video", "wbr"
]);

const escapeCustomTags = (text) => {
  if (typeof text !== "string") return text;
  return text.replace(/<\/?([a-zA-Z0-9:-]+)(?:\s[^>]*)?>/g, (match, tagName) => {
    const lowerTag = tagName.toLowerCase();
    if (ALLOWED_HTML_TAGS.has(lowerTag)) {
      return match;
    }
    return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  });
};

// ─── Math segment splitter ───────────────────────────────────────────────────
// Splits raw text into alternating segments: { type: "text"|"math", content, display }
// Supports: $$...$$, $...$, \[...\], \(...\), and ChatGPT-style [ \latex ] blocks
const isMath = (str) => {
  // If it doesn't start/end with spaces, it's a standard inline math block (strict Pandoc rules)
  if (!/^\s/.test(str) && !/\s$/.test(str)) {
    return true;
  }
  // If it is just a number
  if (/^\s*\d+(?:\.\d+)?\s*$/.test(str)) {
    return true;
  }
  // If the trimmed content is very short (e.g. single variable like x, y, n)
  if (str.trim().length <= 2) {
    return true;
  }
  // If it has spaces, check if it contains LaTeX-specific characters:
  // - backslash (e.g. \frac, \mathbf, \alpha)
  // - subscript/superscript/grouping: _, ^, {, }, [, ]
  if (/[\\[\]{}_^]/.test(str)) {
    return true;
  }
  // Math operators/relations: e.g., x = y, a + b, a < b
  // We check if it has =, +, *, /, <, > AND doesn't look like plain English sentences
  if (/[=<>+*/]/.test(str) && !/[a-zA-Z]{4,}/.test(str)) {
    return true;
  }
  return false;
};

// ─── Math segment splitter ───────────────────────────────────────────────────
// Splits raw text into alternating segments: { type: "text"|"math", content, display }
// Supports: $$...$$, $...$, \[...\], \(...\), and ChatGPT-style [ \latex ] blocks
const MATH_RE =
  /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^\$\n]+?\$|\[ ?\\[^\]]+\])/g;

const splitMathAndText = (raw) => {
  if (!raw || typeof raw !== "string") return [{ type: "text", content: raw || "" }];

  const placeholders = [];
  // 1. Extract and protect code blocks and inline code
  const CODE_RE = /(```[\s\S]*?(?:```|$)|`[^`\n]*?(?:`|$))/g;
  
  let tempRaw = raw.replace(CODE_RE, (match) => {
    const placeholder = `___CODE_PLACEHOLDER_${placeholders.length}___`;
    placeholders.push({ placeholder, original: match });
    return placeholder;
  });

  // Replace ▋ with HTML span outside code blocks
  tempRaw = tempRaw.replace(/▋/g, '<span className="streaming-cursor">▋</span>');

  const segments = [];
  let lastIndex = 0;
  let match;

  MATH_RE.lastIndex = 0;
  while ((match = MATH_RE.exec(tempRaw)) !== null) {
    const start = match.index;
    const full = match[0];

    // Determine display mode and strip delimiters
    let display = false;
    let inner = full;
    let isMathBlock = true;

    if (full.startsWith("$$")) {
      display = true;
      inner = full.slice(2, -2).trim();
    } else if (full.startsWith("\\[")) {
      display = true;
      inner = full.slice(2, -2).trim();
    } else if (full.startsWith("$")) {
      display = false;
      inner = full.slice(1, -1);
      
      // Check if it is valid single-dollar math
      if (!isMath(inner)) {
        isMathBlock = false;
      } else {
        inner = inner.trim();
      }
    } else if (full.startsWith("\\(")) {
      display = false;
      inner = full.slice(2, -2).trim();
    } else if (full.startsWith("[")) {
      // ChatGPT-style: [ \latex ] or [ \text{...} ]
      display = true;
      inner = full.slice(1, -1).trim();
    }

    if (isMathBlock) {
      // Push preceding text
      if (start > lastIndex) {
        segments.push({ type: "text", content: tempRaw.slice(lastIndex, start) });
      }
      segments.push({ type: "math", content: inner, display });
      lastIndex = start + full.length;
    } else {
      // If it is not a math block, we don't consume the whole thing!
      // We only treat the first character (the opening '$') as plain text,
      // and we reset the regex lastIndex to search from immediately after the opening '$'.
      if (start > lastIndex) {
        segments.push({ type: "text", content: tempRaw.slice(lastIndex, start) });
      }
      segments.push({ type: "text", content: "$" });
      lastIndex = start + 1;
      MATH_RE.lastIndex = start + 1;
    }
  }

  // Trailing text
  if (lastIndex < tempRaw.length) {
    segments.push({ type: "text", content: tempRaw.slice(lastIndex) });
  }

  const processedSegments = segments.length > 0 ? segments : [{ type: "text", content: tempRaw }];

  // Merge consecutive text segments
  const finalSegments = [];
  for (const seg of processedSegments) {
    if (finalSegments.length > 0 && finalSegments[finalSegments.length - 1].type === "text" && seg.type === "text") {
      finalSegments[finalSegments.length - 1].content += seg.content;
    } else {
      finalSegments.push(seg);
    }
  }

  // 3. Restore code blocks in the text segments
  const restorePlaceholders = (text) => {
    let result = text;
    for (const item of placeholders) {
      result = result.replace(item.placeholder, () => item.original);
    }
    return result;
  };

  for (const seg of finalSegments) {
    if (seg.type === "text") {
      seg.content = escapeCustomTags(seg.content);
      seg.content = restorePlaceholders(seg.content);
    }
  }

  return finalSegments;
};

// ─── Inline KaTeX renderer ───────────────────────────────────────────────────
const KatexMath = ({ latex, display }) => {
  const { colors } = useAppTheme();
  const ref = useRef(null);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureKatex().then((ok) => {
      if (ok) setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready || !ref.current || !window.katex) return;
    try {
      window.katex.render(latex, ref.current, {
        displayMode: display,
        throwOnError: false,
        trust: false,
        strict: false,
      });
      setError(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  }, [latex, display, ready]);

  if (!ready) {
    // Show raw latex while loading so it doesn't flash-disappear
    return (
      <Box
        component={display ? "div" : "span"}
        sx={{ fontFamily: MONOSPACE_FONT, opacity: 0.6, fontSize: "0.85em" }}
      >
        {display ? `\\[${latex}\\]` : `$${latex}$`}
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        component={display ? "div" : "span"}
        sx={{ color: colors.accent.orange, fontFamily: MONOSPACE_FONT, fontSize: "0.82em" }}
        title={error}
      >
        {display ? `\\[${latex}\\]` : `$${latex}$`}
      </Box>
    );
  }

  return (
    <Box
      ref={ref}
      component={display ? "div" : "span"}
      sx={{
        display: display ? "block" : "inline",
        textAlign: display ? "center" : "inherit",
        my: display ? 1.5 : 0,
        overflowX: display ? "auto" : "visible",
        overflowY: display ? "hidden" : "visible",
        py: display ? 0.5 : 0,
        "& .katex": { fontSize: display ? "1.1em" : "1em" },
        "& .katex-display": { my: 0 },
      }}
    />
  );
};

const Markdown = dynamic(() => import("markdown-to-jsx"), {
  ssr: false,
  loading: () => null,
});

const CitationAnchor = ({ href, children, ...props }) => {
  const { colors, radius } = useAppTheme();
  // If the text content is a number, style it as a Gemini-like citation pill
  const text = String(children || "");
  const isNumber = /^\d+$/.test(text);

  if (isNumber) {
    return (
      <Box
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(74, 158, 255, 0.12)",
          color: colors.accent.blue,
          fontSize: "0.68rem",
          fontWeight: 600,
          px: 0.6,
          py: 0.1,
          borderRadius: radius.sm,
          textDecoration: "none",
          verticalAlign: "super",
          ml: 0.25,
          mr: 0.25,
          border: `1px solid rgba(74, 158, 255, 0.25)`,
          transition: "all 0.2s ease",
          "&:hover": {
            backgroundColor: colors.accent.blue,
            color: "#ffffff",
            textDecoration: "none",
            transform: "scale(1.05)",
            boxShadow: "0 0 8px rgba(74, 158, 255, 0.4)",
          },
        }}
        {...props}
      >
        {text}
      </Box>
    );
  }

  // Standard link
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
};

const CustomCodeBlock = ({ language, code }) => {
  const { colors, components, mode, radius } = useAppTheme();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("code"); // "code" or "preview"
  const [mermaidSvg, setMermaidSvg] = useState("");
  const [mermaidError, setMermaidError] = useState(null);

  const isMermaid = language === "mermaid";
  const isSvg = language === "svg" || (language === "xml" && code.trim().startsWith("<svg"));
  const isHtml = language === "html";
  const hasPreview = isMermaid || isSvg || isHtml;

  const codeRef = useRef(null);
  const [highlighted, setHighlighted] = useState(false);

  // Clean code and check cursor
  const cleanCode = useMemo(() => {
    return code.endsWith("▋") ? code.slice(0, -1) : code;
  }, [code]);

  const showCursor = useMemo(() => {
    return code.endsWith("▋");
  }, [code]);

  // Auto-switch to preview/diagram tab by default for Mermaid and SVG
  useEffect(() => {
    if (hasPreview) {
      setActiveTab("preview");
    } else {
      setActiveTab("code");
    }
  }, [hasPreview]);

  // Mermaid rendering effect
  useEffect(() => {
    if (!isMermaid) return;
    let isMounted = true;

    const renderMermaid = async () => {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/mermaid@10.9.0/dist/mermaid.min.js");
        if (!window.mermaid) return;

        window.mermaid.initialize({
          startOnLoad: false,
          theme: mode === "light" ? "default" : "dark",
          securityLevel: "loose",
        });

        // Clean up code: remove any leading/trailing spaces
        const cleanedCode = code.trim();
        const uniqueId = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
        const { svg } = await window.mermaid.render(uniqueId, cleanedCode);

        if (isMounted) {
          setMermaidSvg(svg);
          setMermaidError(null);
        }
      } catch (err) {
        console.error("Mermaid error:", err);
        if (isMounted) {
          setMermaidError(err.message || "Failed to render diagram");
        }
      }
    };

    renderMermaid();

    return () => {
      isMounted = false;
    };
  }, [code, isMermaid]);

  // Prism highlighting effect
  useEffect(() => {
    setHighlighted(false);
  }, [cleanCode, language]);

  useEffect(() => {
    if (!codeRef.current || isMermaid || isSvg || isHtml) return;
    let isMounted = true;

    ensurePrism(mode).then((ok) => {
      if (ok && isMounted && codeRef.current) {
        const langClass = language ? `language-${language}` : "language-none";
        codeRef.current.className = langClass;
        window.Prism.highlightElement(codeRef.current);
        setHighlighted(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [cleanCode, language, mode, isMermaid, isSvg, isHtml]);

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      sx={{
        border: `1px solid ${colors.border.secondary}`,
        borderRadius: radius.md,
        overflow: "hidden",
        my: 2,
        backgroundColor: colors.bg.secondary,
        boxShadow: "none",
      }}
    >
      {/* Codeblock Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 0.75,
          backgroundColor: colors.bg.tertiary,
          borderBottom: `1px solid ${colors.border.secondary}`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              textTransform: "uppercase",
              color: colors.text.muted,
              fontSize: "0.68rem",
              letterSpacing: "0.05em",
            }}
          >
            {language || "code"}
          </Typography>
          
          {hasPreview && (
            <Box sx={{ display: "inline-flex", ml: 2, gap: 0.5 }}>
              <Box
                onClick={() => setActiveTab("code")}
                sx={{
                  cursor: "pointer",
                  fontSize: "0.68rem",
                  fontWeight: activeTab === "code" ? 600 : 500,
                  color: activeTab === "code" ? colors.accent.blue : colors.text.muted,
                  px: 1,
                  py: 0.25,
                  borderRadius: radius.sm,
                  backgroundColor: activeTab === "code" ? "rgba(74, 158, 255, 0.12)" : "transparent",
                  transition: "all 0.2s",
                }}
              >
                Code
              </Box>
              <Box
                onClick={() => setActiveTab("preview")}
                sx={{
                  cursor: "pointer",
                  fontSize: "0.68rem",
                  fontWeight: activeTab === "preview" ? 600 : 500,
                  color: activeTab === "preview" ? colors.accent.blue : colors.text.muted,
                  px: 1,
                  py: 0.25,
                  borderRadius: radius.sm,
                  backgroundColor: activeTab === "preview" ? "rgba(74, 158, 255, 0.12)" : "transparent",
                  transition: "all 0.2s",
                }}
              >
                {isMermaid ? "Diagram" : "Preview"}
              </Box>
            </Box>
          )}
        </Box>

        <IconButton
          size="small"
          onClick={handleCopy}
          sx={{
            ...components.iconButtonMuted,
            p: 0.5,
            borderRadius: radius.sm,
          }}
          title="Copy Code"
        >
          {copied ? (
            <Typography variant="caption" sx={{ color: colors.accent.green, fontWeight: 600, fontSize: "0.68rem" }}>
              Copied!
            </Typography>
          ) : (
            <ContentCopyIcon sx={{ fontSize: 13 }} />
          )}
        </IconButton>
      </Box>

      {/* Codeblock Content */}
      <Box sx={{ position: "relative" }}>
        {activeTab === "preview" && hasPreview ? (
          <Box sx={{ p: 2, overflow: "auto" }}>
            {isMermaid ? (
              mermaidError ? (
                <Box>
                  <Typography variant="caption" sx={{ color: colors.accent.error, display: "block", mb: 1 }}>
                    Error rendering Mermaid diagram: {mermaidError}
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      p: 1.5,
                      fontFamily: MONOSPACE_FONT,
                      fontSize: "0.8rem",
                      backgroundColor: colors.bg.tertiary,
                      borderRadius: radius.sm,
                      overflowX: "auto",
                      color: colors.text.primary,
                    }}
                  >
                    <code>{code}</code>
                  </Box>
                </Box>
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    minHeight: 180,
                    width: "100%",
                    "& svg": {
                      maxWidth: "100%",
                      height: "auto",
                    },
                  }}
                  dangerouslySetInnerHTML={{ __html: mermaidSvg || "Loading diagram..." }}
                />
              )
            ) : isSvg ? (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  minHeight: 180,
                  p: 2,
                  backgroundColor: "#ffffff",
                  borderRadius: radius.sm,
                  border: `1px solid ${colors.border.secondary}`,
                  "& svg": {
                    maxWidth: "100%",
                    maxHeight: 400,
                  },
                }}
                dangerouslySetInnerHTML={{ __html: code }}
              />
            ) : isHtml ? (
              <Box
                component="iframe"
                srcDoc={code}
                sandbox="allow-scripts"
                sx={{
                  width: "100%",
                  height: 350,
                  border: `1px solid ${colors.border.secondary}`,
                  borderRadius: radius.sm,
                  backgroundColor: "#ffffff",
                }}
              />
            ) : null}
          </Box>
        ) : (
          <Box
            component="pre"
            className={language ? `language-${language}` : "language-none"}
            sx={{
              m: 0,
              p: 2,
              fontFamily: MONOSPACE_FONT,
              fontSize: "0.85rem",
              overflowX: "auto",
              backgroundColor: mode === "light" ? "rgba(0, 0, 0, 0.03)" : "rgba(0, 0, 0, 0.15)",
              color: colors.text.primary,
              lineHeight: 1.5,
              border: "none !important",
              boxShadow: "none !important",
              margin: "0 !important",
              "& code": {
                backgroundColor: "transparent !important",
                p: "0 !important",
                color: "inherit",
                textShadow: "none !important",
              },
            }}
          >
            <code ref={codeRef} className={language ? `language-${language}` : "language-none"} style={{ display: "inline" }}>
              {cleanCode}
            </code>
            {showCursor && <span className="streaming-cursor">▋</span>}
          </Box>
        )}
      </Box>
    </Box>
  );
};

const PreBlock = ({ children }) => {
  if (children && children.type === "code") {
    const codeProps = children.props;
    const className = codeProps.className || "";
    const language = className.replace(/^(lang|language)-/, "");
    const codeString = String(codeProps.children || "");

    return <CustomCodeBlock language={language} code={codeString} />;
  }
  return <pre>{children}</pre>;
};

const MARKDOWN_OPTIONS = {
  overrides: {
    a: { component: CitationAnchor },
    pre: { component: PreBlock },
  },
};

// Renders one chunk of plain text through markdown-to-jsx
const MarkdownChunk = ({ text }) => (
  <Markdown options={MARKDOWN_OPTIONS}>{text || ""}</Markdown>
);

// Splits raw content at math delimiters, renders math and text separately.
// This prevents markdown-to-jsx from touching LaTeX syntax.
const MathAwareMarkdown = ({ content, isStreaming }) => {
  let displayContent = content || "";
  if (isStreaming) {
    displayContent += "▋";
  }
  const segments = useMemo(() => splitMathAndText(displayContent), [displayContent]);

  // If no math found, render the whole thing as markdown (no overhead)
  if (segments.length === 1 && segments[0].type === "text") {
    return <MarkdownChunk text={segments[0].content} />;
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "math" ? (
          <KatexMath key={i} latex={seg.content} display={seg.display} />
        ) : (
          <MarkdownChunk key={i} text={seg.content} />
        )
      )}
    </>
  );
};

const getBoxSx = ({ colors: c, radius: r }) => ({
  color: c.text.primary,
  wordBreak: "break-word",
  fontSize: "1.0625rem",
  lineHeight: 1.6,
  "& p": {
    my: 1,
    "&:first-of-type": { mt: 0 },
    "&:last-of-type": { mb: 0 },
  },
  "& h1, & h2, & h3, & h4, & h5, & h6": {
    fontWeight: 600,
    mt: 2,
    mb: 1,
    "&:first-of-type": { mt: 0 },
  },
  "& h1": { fontSize: "1.4em" },
  "& h2": { fontSize: "1.25em" },
  "& h3": { fontSize: "1.1em" },
  "& h4": { fontSize: "1em" },
  "& a": {
    color: c.accent.blue,
    textDecoration: "none",
    "&:hover": { textDecoration: "underline" },
  },
  "& ul, & ol": { pl: 3, my: 1 },
  "& li": { my: 0.5 },
  "& pre": {
    backgroundColor: c.bg.tertiary,
    p: 1.5,
    borderRadius: r.lg,
    overflowX: "auto",
    my: 1,
    "& code": { backgroundColor: "transparent", p: 0 },
  },
  "& code": {
    backgroundColor: c.bg.tertiary,
    px: 0.5,
    py: 0.25,
    borderRadius: r.xs,
    fontSize: "0.85em",
    fontFamily: MONOSPACE_FONT,
  },
  "& blockquote": {
    borderLeft: `3px solid ${c.border.primary}`,
    ml: 0,
    pl: 2,
    color: c.text.muted,
    my: 1,
  },
  "& table": { borderCollapse: "collapse", my: 1, width: "100%" },
  "& th, & td": { border: `1px solid ${c.border.primary}`, p: 1, textAlign: "left" },
  "& th": { backgroundColor: c.bg.tertiary },
  "& hr": { border: "none", borderTop: `1px solid ${c.border.primary}`, my: 2 },
  "& img": {
    maxWidth: "100%",
    maxHeight: 500,
    borderRadius: r.lg,
    border: `1px solid ${c.border.secondary}`,
    display: "block",
    my: 1.5,
  },
  "& .streaming-cursor": {
    display: "inline-block",
    animation: "blink-cursor 0.8s infinite",
    color: c.accent.blue,
    marginLeft: "2px",
    verticalAlign: "middle",
    fontWeight: "bold",
  },
  "@keyframes blink-cursor": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0 },
  },
});

const MarkdownContent = ({ children, className, sx = {}, isStreaming = false }) => {
  const theme = useAppTheme();
  return (
    <Box
      className={className}
      sx={{ ...getBoxSx(theme), ...sx }}
    >
      <MathAwareMarkdown content={typeof children === "string" ? children : ""} isStreaming={isStreaming} />
    </Box>
  );
};

export default MarkdownContent;

