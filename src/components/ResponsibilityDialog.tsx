import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Responsibility, Task } from '../types';

interface Props {
  responsibilities: Responsibility[];
  tasks: Task[];
  onAdd: (name: string) => void;
  onUpdate: (id: string, patch: Partial<Omit<Responsibility, 'id'>>) => void;
  onDelete: (r: Responsibility) => void;
  onClose: () => void;
}

/** Zuständigkeiten anlegen, umbenennen, umfärben und löschen. Änderungen gelten sofort. */
export function ResponsibilityDialog({ responsibilities, tasks, onAdd, onUpdate, onDelete, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onAdd(newName.trim());
    setNewName('');
  };

  const countOf = (id: string) => tasks.filter((t) => t.responsibility === id).length;

  return (
    <dialog ref={dialogRef} className="task-dialog resp-dialog" onClose={onClose} onCancel={onClose}>
      <div className="dialog-body">
        <h2>Zuständigkeiten</h2>
        <p className="muted small">Die Farbe gilt für alle Aufgaben mit dieser Zuständigkeit und erscheint so in der Legende.</p>
        <ul className="resp-list">
          {responsibilities.map((r) => (
            <li key={r.id}>
              <input type="color" value={r.color} onChange={(e) => onUpdate(r.id, { color: e.target.value })} aria-label={`Farbe für ${r.name}`} />
              <input
                className="resp-name"
                defaultValue={r.name}
                aria-label="Name"
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value.trim() !== r.name) onUpdate(r.id, { name: e.target.value });
                  else e.target.value = r.name;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
              <span className="muted small resp-count">{countOf(r.id) === 1 ? '1 Aufgabe' : `${countOf(r.id)} Aufgaben`}</span>
              <button type="button" className="icon danger" title={`„${r.name}“ löschen`} onClick={() => onDelete(r)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <form className="resp-add" onSubmit={add}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Weitere Zuständigkeit, z. B. Sanitär" aria-label="Neue Zuständigkeit" />
          <button type="submit" disabled={!newName.trim()}>
            Hinzufügen
          </button>
        </form>
        <div className="dialog-actions">
          <span className="spacer" />
          <button type="button" className="primary" onClick={onClose}>
            Fertig
          </button>
        </div>
      </div>
    </dialog>
  );
}
