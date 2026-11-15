import { Check, Copy } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CodeBlockProps {
  language?: string;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-900 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-3.5 py-2 text-xs text-slate-400">
        <span className="font-mono">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 whitespace-nowrap shrink-0"
          aria-label="Copy code snippet"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[13px] leading-relaxed">
        <code className="font-mono text-slate-100">{code}</code>
      </pre>
    </div>
  );
}

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="prose-tutor max-w-none text-[15px] leading-[1.65] text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 text-lg font-semibold text-slate-900 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-base font-semibold text-slate-900 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1.5 text-[15px] font-semibold text-slate-900 first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1.5 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1.5 pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-slate-950">{children}</strong>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-700">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-50 text-slate-700">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-slate-200 px-3 py-2 font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-slate-100 px-3 py-2 text-slate-700">{children}</td>
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }: { className?: string; children?: ReactNode }) => {
            const match = /language-([\w-]+)/.exec(className || '');
            const text = String(children ?? '').replace(/\n$/, '');
            const isBlock = Boolean(match) || text.includes('\n');

            if (isBlock) {
              return <CodeBlock language={match?.[1]} code={text} />;
            }

            return (
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-slate-900">
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
