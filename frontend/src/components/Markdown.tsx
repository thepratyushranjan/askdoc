import type { JSX } from 'react';

type Block =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; text: string }
  | { kind: 'hr' };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ kind: 'code', lang, text: buf.join('\n') });
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: 'h', level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('```') &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'p', text: buf.join(' ') });
  }

  return blocks;
}

function renderInline(text: string): (string | JSX.Element)[] {
  const tokens: (string | JSX.Element)[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const t = match[0];
    if (t.startsWith('**')) {
      tokens.push(<strong key={key++}>{t.slice(2, -2)}</strong>);
    } else if (t.startsWith('`')) {
      tokens.push(<code key={key++} className="md-code-inline">{t.slice(1, -1)}</code>);
    } else if (t.startsWith('[')) {
      const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(t);
      if (m) {
        tokens.push(
          <a key={key++} href={m[2]} target="_blank" rel="noopener noreferrer">
            {m[1]}
          </a>
        );
      }
    } else if (t.startsWith('*')) {
      tokens.push(<em key={key++}>{t.slice(1, -1)}</em>);
    }
    lastIndex = match.index + t.length;
  }
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
}

export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);

  return (
    <div className="markdown">
      {blocks.map((block, idx) => {
        switch (block.kind) {
          case 'h': {
            if (block.level === 1) return <h1 key={idx}>{renderInline(block.text)}</h1>;
            if (block.level === 2) return <h2 key={idx}>{renderInline(block.text)}</h2>;
            return <h3 key={idx}>{renderInline(block.text)}</h3>;
          }
          case 'code':
            return (
              <pre key={idx} className="md-code-block">
                <code>{block.text}</code>
              </pre>
            );
          case 'ul':
            return (
              <ul key={idx}>
                {block.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={idx}>
                {block.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            );
          case 'hr':
            return <hr key={idx} />;
          case 'p':
            return <p key={idx}>{renderInline(block.text)}</p>;
        }
      })}
    </div>
  );
}
