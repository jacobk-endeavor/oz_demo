import { memo } from 'react';
import { Streamdown } from 'streamdown';

interface MarkdownContentProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

export default memo(function MarkdownContent({ content, className, isStreaming }: MarkdownContentProps) {
  return (
    <Streamdown
      className={className}
      mode={isStreaming ? 'streaming' : 'static'}
      animated={isStreaming ? true : undefined}
      isAnimating={isStreaming}
    >
      {content}
    </Streamdown>
  );
});
