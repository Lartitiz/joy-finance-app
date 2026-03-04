import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

interface FileDropZoneProps {
  onFileSelect: (file: File) => void;
}

const ACCEPTED = '.csv,.xlsx,.xls';

export function FileDropZone({ onFileSelect }: FileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect]
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`bg-card rounded-[20px] shadow-soft p-12 flex flex-col items-center justify-center gap-4 border-2 border-dashed transition-colors cursor-pointer ${
        dragOver ? 'border-primary bg-primary/5' : 'border-[hsl(340_60%_90%)]'
      }`}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <Upload className="h-10 w-10 text-primary" />
      <p className="text-foreground text-lg">Dépose ton relevé bancaire ici</p>
      <p className="text-sm text-muted-foreground">
        CSV ou Excel. Les colonnes seront détectées automatiquement.
      </p>
      <label className="mt-2 inline-flex items-center gap-2 rounded-full border border-primary px-6 py-2 text-sm text-primary hover:bg-primary/5 transition-colors cursor-pointer">
        Choisir un fichier
        <input
          id="file-input"
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={handleChange}
        />
      </label>
    </div>
  );
}
