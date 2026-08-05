import { useState, type FormEvent } from 'react';

type Dialogue = {
  id: string;
  speaker: string;
  text: string;
};

const initialDialogues: Dialogue[] = [
  {
    id: crypto.randomUUID(),
    speaker: '旁白',
    text: '故事从这里开始。',
  },
];

export default function App() {
  const [dialogues, setDialogues] =
    useState<Dialogue[]>(initialDialogues);

  const [speaker, setSpeaker] = useState('');
  const [text, setText] = useState('');

  const latestDialogue = dialogues.at(-1);

  const previewSpeaker =
    speaker.trim() || latestDialogue?.speaker || '旁白';

  const previewText =
    text || latestDialogue?.text || '请在右侧输入一句对白。';

  function handleAddDialogue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedText = text.trim();

    if (!trimmedText) {
      return;
    }

    const newDialogue: Dialogue = {
      id: crypto.randomUUID(),
      speaker: speaker.trim() || '旁白',
      text: trimmedText,
    };

    setDialogues((currentDialogues) => [
      ...currentDialogues,
      newDialogue,
    ]);

    setText('');
  }

  return (
    <div className="editor">
      <header className="toolbar">
        <strong>VN Engine Editor</strong>
        <span>Project: Untitled</span>
      </header>

      <aside className="panel scene-panel">
        <div className="panel-heading">
          <h2>Scene 1</h2>
          <span>{dialogues.length} dialogues</span>
        </div>

        <ol className="dialogue-list">
          {dialogues.map((dialogue, index) => (
            <li key={dialogue.id}>
              <span className="dialogue-number">
                {String(index + 1).padStart(2, '0')}
              </span>

              <div>
                <strong>{dialogue.speaker}</strong>
                <p>{dialogue.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>

      <main className="preview-panel">
        <div className="preview-stage">
          <p className="preview-placeholder">
            Character and background preview
          </p>

          <div className="dialogue-box">
            <strong>{previewSpeaker}</strong>
            <p>{previewText}</p>
          </div>
        </div>
      </main>

      <aside className="panel inspector-panel">
        <div className="panel-heading">
          <h2>Add Dialogue</h2>
        </div>

        <form onSubmit={handleAddDialogue}>
          <label>
            Speaker
            <input
              value={speaker}
              onChange={(event) =>
                setSpeaker(event.target.value)
              }
              placeholder="例如：Alice"
            />
          </label>

          <label>
            Dialogue
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="输入对白内容……"
              rows={7}
            />
          </label>

          <button type="submit">Add Dialogue</button>
        </form>
      </aside>
    </div>
  );
}