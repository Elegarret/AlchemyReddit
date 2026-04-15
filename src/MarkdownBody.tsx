import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';

type MarkdownBodyProps = {
  className?: string;
  markdown: string;
};

const getClassName = (baseClassName: string, className?: string) =>
  className ? `${baseClassName} ${className}` : baseClassName;

export const MarkdownBody = ({ className, markdown }: MarkdownBodyProps) => (
  <div
    className={getClassName(
      'markdown-body break-words [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-black/15 [&_code]:px-1 [&_code]:py-0.5 [&_em]:italic [&_li]:ml-5 [&_li]:list-disc [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-0 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-black/15 [&_pre]:p-3 [&_pre]:text-left [&_strong]:font-black [&_ul]:ml-5 [&_ul]:list-disc',
      className
    )}
  >
    <ReactMarkdown
      remarkPlugins={[remarkBreaks]}
      skipHtml={true}
      components={{
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
      }}
    >
      {markdown}
    </ReactMarkdown>
  </div>
);
