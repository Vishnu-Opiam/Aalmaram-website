import type { ReactNode } from "react";

/**
 * A deliberately small markdown renderer for product descriptions: paragraphs,
 * **bold**, *italic*. Everything becomes React elements, never
 * `dangerouslySetInnerHTML`, so a description typed into the admin can't inject
 * markup into the storefront.
 */
export default function Markdown({ source, className }: { source: string; className?: string }) {
  const paragraphs = source
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} className={i > 0 ? "mt-5" : undefined}>
          {inline(p)}
        </p>
      ))}
    </div>
  );
}

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g;

function inline(text: string): ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return (
        <em key={i} className="font-display italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
