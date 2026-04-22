import { memo, useMemo } from 'react'
import Markdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { Components } from 'react-markdown'
import { cn } from '@/lib/utils'

const CODE_SCROLL_WRAP =
  'my-1.5 overflow-x-auto rounded-md border border-border/50 bg-card/30 [&_.react-syntax-highlighter]:m-0 [&_.react-syntax-highlighter]:rounded-md'

export type RichTextVariant = 'message' | 'reply'

function buildComponents(variant: RichTextVariant): Components {
  return {
    pre: ({ children }) => <>{children}</>,
    code: ({ className, children, ...props }) => {
      const text = String(children).replace(/\n$/, '')
      const match = /language-(\w+)/.exec(className ?? '')
      if (match) {
        return (
          <div className={CODE_SCROLL_WRAP} role="group">
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              className="rounded-md text-sm leading-relaxed"
              customStyle={{
                margin: 0,
                padding: '0.75rem 1rem',
                borderRadius: 6,
                fontSize: variant === 'reply' ? '0.7rem' : '0.8125rem',
              }}
            >
              {text}
            </SyntaxHighlighter>
          </div>
        )
      }
      return (
        <code
          className={cn(
            'rounded border border-border/50 bg-muted/60 px-1 py-px text-[0.9em] font-mono text-foreground/95',
            variant === 'reply' && 'text-[0.75em]',
            className,
          )}
          {...props}
        >
          {children}
        </code>
      )
    },
    p: ({ className, children, ...rest }) => (
      <p
        className={cn(
          'my-1.5 first:mt-0 last:mb-0 break-words text-foreground/95',
          variant === 'reply' && 'my-0.5',
          className,
        )}
        {...rest}
      >
        {children}
      </p>
    ),
    a: ({ className, children, href, ...rest }) => (
      <a
        className={cn('text-primary underline decoration-primary/30 underline-offset-2 hover:opacity-90', className)}
        href={href}
        rel="noreferrer"
        target={href && /^https?:/i.test(href) ? '_blank' : undefined}
        {...rest}
      >
        {children}
      </a>
    ),
    ul: ({ className, ...rest }) => (
      <ul
        className={cn('my-1.5 list-disc pl-5 text-foreground/95 [li]:my-0.5', variant === 'reply' && 'my-1', className)}
        {...rest}
      />
    ),
    ol: ({ className, ...rest }) => (
      <ol
        className={cn('my-1.5 list-decimal pl-5 text-foreground/95 [li]:my-0.5', variant === 'reply' && 'my-1', className)}
        {...rest}
      />
    ),
    li: ({ className, ...rest }) => <li className={cn('break-words', className)} {...rest} />,
    blockquote: ({ className, ...rest }) => (
      <blockquote
        className={cn(
          'my-2 border-l-2 border-primary/35 pl-3 text-sm italic text-muted-foreground',
          variant === 'reply' && 'my-1 text-[0.75rem]',
          className,
        )}
        {...rest}
      />
    ),
    h1: ({ className, ...rest }) => (
      <h1 className={cn('text-foreground mt-2 mb-1 text-base font-semibold', variant === 'reply' && 'text-sm', className)} {...rest} />
    ),
    h2: ({ className, ...rest }) => (
      <h2 className={cn('text-foreground mt-2 mb-1 text-sm font-semibold', variant === 'reply' && 'text-xs', className)} {...rest} />
    ),
    h3: ({ className, ...rest }) => (
      <h3
        className={cn('text-foreground/95 mt-1.5 mb-0.5 text-sm font-semibold', variant === 'reply' && 'text-xs', className)}
        {...rest}
      />
    ),
    h4: ({ className, ...rest }) => (
      <h4 className={cn('text-foreground/95 mt-1.5 text-sm font-medium', className)} {...rest} />
    ),
    hr: ({ className, ...rest }) => <hr className={cn('my-2 border-border/60', className)} {...rest} />,
    table: ({ className, ...rest }) => (
      <div className="my-2 max-w-full overflow-x-auto">
        <table
          className={cn('w-full min-w-0 border-collapse text-left text-sm text-foreground/95', className)}
          {...rest}
        />
      </div>
    ),
    thead: ({ className, ...rest }) => <thead className={cn('bg-muted/40', className)} {...rest} />,
    th: ({ className, ...rest }) => (
      <th className={cn('border border-border/60 px-2 py-1.5 text-xs font-semibold', className)} {...rest} />
    ),
    td: ({ className, ...rest }) => <td className={cn('border border-border/50 px-2 py-1.5 text-xs', className)} {...rest} />,
    tr: ({ className, ...rest }) => <tr className={cn('even:bg-muted/20', className)} {...rest} />,
    del: ({ className, ...rest }) => <del className={cn('text-muted-foreground', className)} {...rest} />,
    input: ({ type, checked, disabled, ...rest }) => {
      if (type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={Boolean(checked)}
            readOnly
            disabled={disabled}
            className="mr-1 align-middle"
            tabIndex={-1}
            {...rest}
          />
        )
      }
      return null
    },
  }
}

export interface RichTextRendererProps {
  content: string
  variant?: RichTextVariant
  className?: string
}

/**
 * Renderiza cuerpos de mensaje con GFM; sin HTML crudo (sin `rehype-raw`).
 * Los bloques de código usan un tema fijo oscuro legible con cualquier tema de la app.
 */
export const RichTextRenderer = memo(function RichTextRenderer({
  content,
  variant = 'message',
  className,
}: RichTextRendererProps) {
  const components = useMemo(() => buildComponents(variant), [variant])

  return (
    <div
      className={cn(
        'min-w-0 max-w-full text-foreground',
        variant === 'message' && 'break-words text-[0.9375rem] leading-[1.64]',
        variant === 'reply' && 'text-[0.8rem] leading-snug',
        className,
      )}
    >
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components} skipHtml>
        {content}
      </Markdown>
    </div>
  )
})
