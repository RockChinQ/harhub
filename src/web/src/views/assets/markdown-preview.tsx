import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { parseSkillDocument } from "./skill-frontmatter";
import { SkillMetadataCard } from "./skill-metadata-card";

export default function MarkdownPreview({
  content,
  showSkillMetadata = false
}: {
  content: string;
  showSkillMetadata?: boolean;
}) {
  const document = showSkillMetadata ? parseSkillDocument(content) : { body: content };

  return (
    <div className="mx-auto w-full max-w-4xl">
      {document.metadata ? <SkillMetadataCard metadata={document.metadata} /> : null}
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
          {document.body}
        </Markdown>
      </article>
    </div>
  );
}
