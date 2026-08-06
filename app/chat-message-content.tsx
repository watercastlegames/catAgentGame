const CHAT_LINK_PATTERN =
  /(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<>"']+)/gi;
const TRAILING_URL_PUNCTUATION = /[),.;:!?\]}]+$/;

type ChatMessageContentProps = {
  content: string;
};

function splitRawUrl(token: string) {
  const trailing = token.match(TRAILING_URL_PUNCTUATION)?.[0] ?? "";
  return {
    href: trailing ? token.slice(0, -trailing.length) : token,
    trailing,
  };
}

export function ChatMessageContent({ content }: ChatMessageContentProps) {
  return content.split(CHAT_LINK_PATTERN).map((token, index) => {
    const markdown = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/i);
    if (markdown) {
      return (
        <a
          href={markdown[2]}
          key={`${index}-${markdown[2]}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {markdown[1]}
        </a>
      );
    }
    if (/^https?:\/\//i.test(token)) {
      const { href, trailing } = splitRawUrl(token);
      return (
        <span key={`${index}-${href}`}>
          <a href={href} target="_blank" rel="noopener noreferrer">
            {href}
          </a>
          {trailing}
        </span>
      );
    }
    return token;
  });
}
