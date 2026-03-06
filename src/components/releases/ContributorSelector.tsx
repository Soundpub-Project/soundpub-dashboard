import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';

const CONTRIBUTOR_TYPES = ['Composer', 'Lyricist', 'Producer', 'Arranger', 'Mixer', 'Mastering Engineer', 'Session Musician', 'Other'] as const;
const CONTRIBUTOR_ROLES = ['Primary', 'Additional', 'Featured'] as const;

interface ContributorSelectorProps {
  name: string;
  type: string;
  role: string;
  onNameChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onRemove: () => void;
}

export function ContributorSelector({
  name,
  type,
  role,
  onNameChange,
  onTypeChange,
  onRoleChange,
  onRemove,
}: ContributorSelectorProps) {
  const [localName, setLocalName] = useState(name || '');

  const handleNameBlur = useCallback(() => {
    if (localName !== name) {
      onNameChange(localName);
    }
  }, [localName, name, onNameChange]);

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border bg-background">
      <div className="flex-1 grid grid-cols-3 gap-2">
        <Input
          placeholder="Nama"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={handleNameBlur}
          className="h-9"
        />

        <Select value={type || ''} onValueChange={onTypeChange}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Tipe" />
          </SelectTrigger>
          <SelectContent className="z-50">
            {CONTRIBUTOR_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={role || ''} onValueChange={onRoleChange}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Peran" />
          </SelectTrigger>
          <SelectContent className="z-50">
            {CONTRIBUTOR_ROLES.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-destructive hover:text-destructive"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
