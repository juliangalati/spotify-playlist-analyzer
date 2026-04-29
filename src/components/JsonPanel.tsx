import { useState } from 'react';

type Props = { data: unknown };

export default function JsonPanel({ data }: Props) {
  const [label, setLabel] = useState('Copy');
  const text = JSON.stringify(data, null, 2);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setLabel('Copied');
      setTimeout(() => setLabel('Copy'), 1200);
    } catch {
      setLabel('Copy failed');
      setTimeout(() => setLabel('Copy'), 1500);
    }
  }

  return (
    <section>
      <h3>JSON Data</h3>
      <div className="json-panel">
        <div className="json-header">
          <span>Output</span>
          <button className="secondary" onClick={onCopy}>
            {label}
          </button>
        </div>
        <pre className="json-body">{text}</pre>
      </div>
    </section>
  );
}
