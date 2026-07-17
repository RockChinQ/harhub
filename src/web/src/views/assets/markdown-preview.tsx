import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MarkdownPreview({ content }: { content: string }) {
  return (
    <article className="markdown-preview">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        }}
      >
        {content}
      </Markdown>
    </article>
  );
}
