import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Trash2, Copy, Eye, GripVertical, ExternalLink } from 'lucide-react';

export function IccnIntegrationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const endpointUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/info-soundpub`;

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['iccn_service_desc', 'iccn_service_photos']);

      const map: Record<string, string | null> = {};
      for (const row of data || []) map[row.key] = row.value;

      setDesc(map['iccn_service_desc'] || '');
      try {
        const parsed = JSON.parse(map['iccn_service_photos'] || '[]');
        setPhotos(Array.isArray(parsed) ? parsed : []);
      } catch { setPhotos([]); }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newDesc?: string, newPhotos?: string[]) => {
    setSaving(true);
    try {
      const settings = [
        { key: 'iccn_service_desc', value: newDesc ?? desc },
        { key: 'iccn_service_photos', value: JSON.stringify(newPhotos ?? photos) },
      ];
      const { data, error } = await supabase.functions.invoke('update-app-settings', {
        body: { settings },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Berhasil', description: 'Pengaturan ICCN berhasil disimpan' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Gagal menyimpan', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (photos.length + files.length > 20) {
      toast({ title: 'Error', description: 'Maksimal 20 foto', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const newPhotos = [...photos];
      for (const file of Array.from(files)) {
        if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/)) {
          toast({ title: 'Error', description: `${file.name}: Format tidak didukung`, variant: 'destructive' });
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast({ title: 'Error', description: `${file.name}: Maks 5MB`, variant: 'destructive' });
          continue;
        }
        const ext = file.name.split('.').pop();
        const path = `gallery/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('iccn-gallery').upload(path, file);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('iccn-gallery').getPublicUrl(path);
        newPhotos.push(publicUrl);
      }
      setPhotos(newPhotos);
      await saveSettings(undefined, newPhotos);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Gagal upload', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = async (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    await saveSettings(undefined, newPhotos);
  };

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newPhotos = [...photos];
    const [moved] = newPhotos.splice(dragIndex, 1);
    newPhotos.splice(index, 0, moved);
    setPhotos(newPhotos);
    setDragIndex(index);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    saveSettings(undefined, photos);
  };

  const testEndpoint = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(endpointUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setTestResult(JSON.stringify(json, null, 2));
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(endpointUrl);
    toast({ title: 'Berhasil', description: 'URL endpoint berhasil di-copy' });
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Endpoint URL */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ExternalLink className="h-5 w-5" /> API Endpoint</CardTitle>
          <CardDescription>URL endpoint yang bisa diberikan ke tim ICCN</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-3 rounded-lg bg-muted text-sm break-all">{endpointUrl}</code>
            <Button variant="outline" size="icon" onClick={copyUrl}><Copy className="h-4 w-4" /></Button>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={testEndpoint} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
              Test Endpoint
            </Button>
          </div>
          {testResult && (
            <pre className="mt-3 p-3 rounded-lg bg-muted text-xs overflow-auto max-h-64">{testResult}</pre>
          )}
        </CardContent>
      </Card>

      {/* Description */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle>Deskripsi Layanan</CardTitle>
          <CardDescription>Deskripsi layanan platform (maks 1000 karakter)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value.slice(0, 1000))}
            placeholder="Tuliskan deskripsi layanan platform Anda..."
            rows={5}
            maxLength={1000}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">{desc.length}/1000 karakter</span>
            <Button onClick={() => saveSettings()} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Simpan Deskripsi
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Photo Gallery */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle>Galeri Foto Layanan</CardTitle>
          <CardDescription>Upload 1-20 foto layanan (JPG, PNG, WebP, maks 5MB per foto). Drag untuk mengurutkan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photos.map((url, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnd={handleDragEnd}
                className={`relative group rounded-lg overflow-hidden border border-border aspect-square ${dragIndex === i ? 'opacity-50' : ''}`}
              >
                <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <GripVertical className="h-5 w-5 text-white cursor-grab" />
                  <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => removePhoto(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <span className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">{i + 1}</span>
              </div>
            ))}
          </div>

          {photos.length < 20 && (
            <div>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Upload Foto
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">{photos.length}/20 foto</p>
        </CardContent>
      </Card>
    </div>
  );
}
