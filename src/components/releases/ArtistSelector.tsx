import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ARTIST_TYPES = ['Main Artist', 'Featured Artist'] as const;

interface Artist {
  id: string;
  name: string;
  label_id: string;
  user_id?: string; // NEW: Link to profiles.id for artist users
}

interface ArtistSelectorProps {
  artistName: string;
  artistType: 'Main Artist' | 'Featured Artist';
  onNameChange: (name: string, userId?: string) => void;
  onTypeChange: (type: 'Main Artist' | 'Featured Artist') => void;
  onRemove: () => void;
  canRemove: boolean;
  isLabelMode: boolean;
  labelArtists: Artist[];
}

export function ArtistSelector({
  artistName,
  artistType,
  onNameChange,
  onTypeChange,
  onRemove,
  canRemove,
  isLabelMode,
  labelArtists,
}: ArtistSelectorProps) {
  const [artistOpen, setArtistOpen] = useState(false);
  // Use local state for the input to prevent focus loss
  const [localName, setLocalName] = useState(artistName);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local state when prop changes (from external updates)
  useEffect(() => {
    setLocalName(artistName);
  }, [artistName]);

  // Debounced update to parent
  const handleNameInputChange = useCallback((value: string, userId?: string) => {
    setLocalName(value);
    
    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Debounce the parent update to prevent re-render issues
    debounceRef.current = setTimeout(() => {
      onNameChange(value, userId);
    }, 150);
  }, [onNameChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Handle blur to ensure final value is committed
  const handleBlur = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onNameChange(localName);
  }, [localName, onNameChange]);

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border bg-background">
      <div className="flex-1 grid grid-cols-2 gap-2">
        {/* Artist Name - Dropdown for Label, Input for Admin */}
        {isLabelMode && labelArtists.length > 0 ? (
          <Popover open={artistOpen} onOpenChange={setArtistOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={artistOpen}
                className="justify-between h-9 text-sm"
              >
                {artistName || "Pilih artist..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0 z-50" align="start">
              <Command>
                <CommandInput placeholder="Cari artist..." />
                <CommandList>
                  <CommandEmpty>Tidak ada artist.</CommandEmpty>
                  <CommandGroup>
                    {labelArtists.map((artist) => (
                      <CommandItem
                        key={artist.id}
                        value={artist.name}
                        onSelect={() => {
                          // Pass user_id when selecting from dropdown
                          onNameChange(artist.name, artist.user_id);
                          setLocalName(artist.name);
                          setArtistOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            artistName === artist.name ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {artist.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        ) : (
          <Input
            ref={inputRef}
            placeholder="Nama artist"
            value={localName}
            onChange={(e) => handleNameInputChange(e.target.value)}
            onBlur={handleBlur}
            className="h-9"
          />
        )}

        {/* Artist Type */}
        <Select
          value={artistType}
          onValueChange={(value) => onTypeChange(value as 'Main Artist' | 'Featured Artist')}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Tipe" />
          </SelectTrigger>
          <SelectContent className="z-50">
            {ARTIST_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
