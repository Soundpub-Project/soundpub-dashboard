import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  Cloud,
  Database,
  Check,
  X,
  RefreshCw,
  TestTube,
  BarChart3,
  Save,
  Wrench,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

interface StorageConfig {
  storage_provider: string;
  gcs_enabled: string;
  gcs_bucket_name: string | null;
  gcs_project_id: string | null;
  ga4_enabled: string;
  ga4_measurement_id: string | null;
}

export function StorageSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<'gcs' | 'ga4' | 'cors' | null>(null);
  const [applyingCors, setApplyingCors] = useState(false);
  const [corsStatus, setCorsStatus] = useState<{
    checked: boolean;
    configured: boolean | null;
    partiallyConfigured?: boolean;
    message?: string;
    lastApplied?: string;
  }>({ checked: false, configured: null });
  const [config, setConfig] = useState<StorageConfig>({
    storage_provider: 'supabase',
    gcs_enabled: 'false',
    gcs_bucket_name: null,
    gcs_project_id: null,
    ga4_enabled: 'false',
    ga4_measurement_id: null,
  });
  const [testResults, setTestResults] = useState<{
    gcs?: { success: boolean; message: string };
    ga4?: { success: boolean; message: string };
  }>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value');

      if (error) throw error;

      const settingsMap: Record<string, string | null> = {};
      data?.forEach((row: { key: string; value: string | null }) => {
        settingsMap[row.key] = row.value;
      });

      setConfig({
        storage_provider: settingsMap.storage_provider || 'supabase',
        gcs_enabled: settingsMap.gcs_enabled || 'false',
        gcs_bucket_name: settingsMap.gcs_bucket_name || null,
        gcs_project_id: settingsMap.gcs_project_id || null,
        ga4_enabled: settingsMap.ga4_enabled || 'false',
        ga4_measurement_id: settingsMap.ga4_measurement_id || null,
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: 'Error',
        description: 'Gagal memuat pengaturan',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updates: Partial<StorageConfig>) => {
    setSaving(true);
    try {
      const settingsToUpdate = Object.entries(updates).map(([key, value]) => ({
        key,
        value: value === null ? null : String(value),
      }));

      const { error } = await supabase.functions.invoke('update-app-settings', {
        body: { settings: settingsToUpdate },
      });

      if (error) throw error;

      setConfig(prev => ({ ...prev, ...updates }));
      
      toast({
        title: 'Berhasil',
        description: 'Pengaturan berhasil disimpan',
      });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal menyimpan pengaturan',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const testGCSConnection = async () => {
    setTesting('gcs');
    setTestResults(prev => ({ ...prev, gcs: undefined }));
    
    try {
      const { data, error } = await supabase.functions.invoke('test-gcs');

      if (error) throw error;

      if (data?.success) {
        setTestResults(prev => ({
          ...prev,
          gcs: { success: true, message: 'Koneksi GCS berhasil! Bucket dapat diakses.' }
        }));
        toast({
          title: 'Sukses',
          description: 'Koneksi ke Google Cloud Storage berhasil',
        });
        // Also check CORS status after successful connection
        checkCorsStatus();
      } else {
        throw new Error(data?.message || 'Gagal terhubung ke GCS');
      }
    } catch (error: any) {
      console.error('GCS test error:', error);
      setTestResults(prev => ({
        ...prev,
        gcs: { success: false, message: error.message || 'Gagal terhubung ke GCS' }
      }));
      toast({
        title: 'Error',
        description: 'Gagal terhubung ke Google Cloud Storage',
        variant: 'destructive',
      });
    } finally {
      setTesting(null);
    }
  };

  const checkCorsStatus = async () => {
    setTesting('cors');
    try {
      const { data, error } = await supabase.functions.invoke('gcs-manage', {
        body: { action: 'check_cors' },
      });

      if (error) throw error;

      setCorsStatus({
        checked: true,
        configured: data?.corsConfigured ?? false,
        partiallyConfigured: data?.partiallyConfigured ?? false,
        message: data?.message,
      });
    } catch (error: any) {
      console.error('CORS check error:', error);
      setCorsStatus({
        checked: true,
        configured: null,
        partiallyConfigured: false,
        message: error.message || 'Gagal memeriksa status CORS',
      });
    } finally {
      setTesting(null);
    }
  };

  const applyCors = async () => {
    setApplyingCors(true);
    try {
      const { data, error } = await supabase.functions.invoke('gcs-manage', {
        body: { action: 'apply_cors' },
      });

      if (error) throw error;

      const now = new Date().toLocaleString('id-ID');
      setCorsStatus({
        checked: true,
        configured: true,
        partiallyConfigured: false,
        message: data?.message || 'CORS berhasil dikonfigurasi',
        lastApplied: now,
      });

      toast({
        title: 'Sukses',
        description: 'CORS berhasil dikonfigurasi. Tunggu 1-2 menit agar perubahan berlaku sepenuhnya.',
      });
    } catch (error: any) {
      console.error('Apply CORS error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal mengonfigurasi CORS',
        variant: 'destructive',
      });
    } finally {
      setApplyingCors(false);
    }
  };

  const testGA4Connection = async () => {
    setTesting('ga4');
    setTestResults(prev => ({ ...prev, ga4: undefined }));
    
    try {
      // Test GA4 by checking if measurement ID is configured
      const { data, error } = await supabase.functions.invoke('get-ga4-config');

      if (error) throw error;

      if (data?.measurementId) {
        setTestResults(prev => ({
          ...prev,
          ga4: { success: true, message: `GA4 dikonfigurasi dengan Measurement ID: ${data.measurementId}` }
        }));
        toast({
          title: 'Sukses',
          description: 'Konfigurasi Google Analytics 4 valid',
        });
      } else {
        throw new Error('Measurement ID tidak ditemukan');
      }
    } catch (error: any) {
      console.error('GA4 test error:', error);
      setTestResults(prev => ({
        ...prev,
        ga4: { success: false, message: error.message || 'Gagal memverifikasi GA4' }
      }));
      toast({
        title: 'Error',
        description: 'Gagal memverifikasi konfigurasi GA4',
        variant: 'destructive',
      });
    } finally {
      setTesting(null);
    }
  };

  const handleStorageProviderChange = (useGCS: boolean) => {
    saveSettings({
      storage_provider: useGCS ? 'gcs' : 'supabase',
      gcs_enabled: useGCS ? 'true' : 'false',
    });
  };

  const handleGA4Toggle = (enabled: boolean) => {
    saveSettings({
      ga4_enabled: enabled ? 'true' : 'false',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isGCSEnabled = config.gcs_enabled === 'true' || config.storage_provider === 'gcs';
  const isGA4Enabled = config.ga4_enabled === 'true';

  return (
    <div className="space-y-6">
      {/* Storage Provider Settings */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Storage Provider
          </CardTitle>
          <CardDescription>
            Pilih penyimpanan utama untuk file upload (gambar, audio, video)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Supabase Storage Option */}
            <div
              className={`
                relative p-4 rounded-lg border-2 cursor-pointer transition-all
                ${!isGCSEnabled 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50'
                }
              `}
              onClick={() => handleStorageProviderChange(false)}
            >
              <div className="flex items-start gap-3">
                <Database className={`h-8 w-8 ${!isGCSEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">Lovable Cloud Storage</h4>
                    {!isGCSEnabled && (
                      <Badge variant="default" className="text-xs">Aktif</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Penyimpanan bawaan yang sudah terintegrasi. Tidak perlu konfigurasi tambahan.
                  </p>
                </div>
              </div>
            </div>

            {/* GCS Option */}
            <div
              className={`
                relative p-4 rounded-lg border-2 cursor-pointer transition-all
                ${isGCSEnabled 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border hover:border-primary/50'
                }
              `}
              onClick={() => handleStorageProviderChange(true)}
            >
              <div className="flex items-start gap-3">
                <Cloud className={`h-8 w-8 ${isGCSEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">Google Cloud Storage</h4>
                    {isGCSEnabled && (
                      <Badge variant="default" className="text-xs">Aktif</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Gunakan bucket GCS Anda sendiri untuk penyimpanan file.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* GCS Config Details */}
          {isGCSEnabled && (
            <div className="space-y-4 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-medium">Konfigurasi GCS</h5>
                  <p className="text-sm text-muted-foreground">
                    Credentials dikonfigurasi melalui secrets di backend
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testGCSConnection}
                  disabled={testing === 'gcs'}
                >
                  {testing === 'gcs' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <TestTube className="h-4 w-4 mr-2" />
                  )}
                  Test Koneksi
                </Button>
              </div>
              
              {testResults.gcs && (
                <div className={`p-3 rounded-lg ${testResults.gcs.success ? 'bg-chart-3/10 text-chart-3' : 'bg-destructive/10 text-destructive'}`}>
                  <div className="flex items-center gap-2">
                    {testResults.gcs.success ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    <span className="text-sm font-medium">{testResults.gcs.message}</span>
                  </div>
                </div>
              )}

              {/* CORS Status Section */}
              <div className="border-t border-border pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h5 className="font-medium flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      Status CORS Bucket
                    </h5>
                    <p className="text-sm text-muted-foreground">
                      CORS diperlukan agar browser dapat upload langsung ke GCS
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={checkCorsStatus}
                      disabled={testing === 'cors'}
                    >
                      {testing === 'cors' ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Cek Status
                    </Button>
                    <Button
                      variant={corsStatus.configured ? 'outline' : 'default'}
                      size="sm"
                      onClick={applyCors}
                      disabled={applyingCors}
                    >
                      {applyingCors ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Wrench className="h-4 w-4 mr-2" />
                      )}
                      Apply/Fix CORS
                    </Button>
                  </div>
                </div>

                {corsStatus.checked && (
                  <div className="space-y-2">
                    <div className={`p-3 rounded-lg ${
                      corsStatus.configured === true 
                        ? 'bg-chart-3/10 text-chart-3' 
                        : corsStatus.partiallyConfigured
                          ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                          : corsStatus.configured === false 
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-destructive/10 text-destructive'
                    }`}>
                      <div className="flex items-center gap-2">
                        {corsStatus.configured === true ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : corsStatus.partiallyConfigured ? (
                          <RefreshCw className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <span className="text-sm font-medium">
                          {corsStatus.message || 'Status tidak diketahui'}
                        </span>
                      </div>
                    </div>
                    
                    {corsStatus.lastApplied && (
                      <p className="text-xs text-muted-foreground">
                        Terakhir diapply: {corsStatus.lastApplied}
                      </p>
                    )}
                    
                    {(corsStatus.configured || corsStatus.partiallyConfigured) && !corsStatus.configured && (
                      <p className="text-xs text-muted-foreground">
                        ⚠️ CORS tidak lengkap. Klik "Apply/Fix CORS" untuk memperbarui dengan konfigurasi terbaru.
                      </p>
                    )}
                    
                    {corsStatus.configured && (
                      <p className="text-xs text-muted-foreground">
                        ✅ Jika upload masih gagal setelah Apply CORS, tunggu 1-2 menit agar perubahan terpropagasi di Google Cloud.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p>• <strong>GCS_PROJECT_ID</strong>: ID project Google Cloud</p>
                <p>• <strong>GCS_BUCKET_NAME</strong>: Nama bucket untuk penyimpanan</p>
                <p>• <strong>GCS_SERVICE_ACCOUNT_KEY</strong>: JSON service account key</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Analytics 4 Settings */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Google Analytics 4
          </CardTitle>
          <CardDescription>
            Aktifkan tracking analitik dengan Google Analytics 4
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Status GA4</Label>
              <p className="text-sm text-muted-foreground">
                {isGA4Enabled 
                  ? 'GA4 tracking aktif'
                  : 'GA4 tracking tidak aktif'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isGA4Enabled ? 'default' : 'secondary'}>
                {isGA4Enabled ? (
                  <><Check className="h-3 w-3 mr-1" /> Aktif</>
                ) : (
                  <><X className="h-3 w-3 mr-1" /> Nonaktif</>
                )}
              </Badge>
              <Switch
                checked={isGA4Enabled}
                onCheckedChange={handleGA4Toggle}
                disabled={saving}
              />
            </div>
          </div>

          {isGA4Enabled && (
            <div className="space-y-4 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-medium">Konfigurasi GA4</h5>
                  <p className="text-sm text-muted-foreground">
                    Measurement ID dikonfigurasi melalui secrets
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testGA4Connection}
                  disabled={testing === 'ga4'}
                >
                  {testing === 'ga4' ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <TestTube className="h-4 w-4 mr-2" />
                  )}
                  Verifikasi
                </Button>
              </div>

              {testResults.ga4 && (
                <div className={`p-3 rounded-lg ${testResults.ga4.success ? 'bg-chart-3/10 text-chart-3' : 'bg-destructive/10 text-destructive'}`}>
                  <div className="flex items-center gap-2">
                    {testResults.ga4.success ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    <span className="text-sm font-medium">{testResults.ga4.message}</span>
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                <p>• <strong>GA4_MEASUREMENT_ID</strong>: Measurement ID (G-XXXXXXXXXX)</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
