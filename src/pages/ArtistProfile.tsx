import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Loader2,
  Music,
  User,
  Save,
  Upload,
  BadgeCheck,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ArtistProfileData {
  id: string;
  user_id: string;
  artist_name: string;
  artist_type: string;
  legal_name: string | null;
  profile_image_url: string | null;
  country: string | null;
  city: string | null;
  language: string | null;
  gender: string | null;
  date_of_birth: string | null;
  genre: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  spotify_artist_id: string | null;
  spotify_artist_url: string | null;
  spotify_data: any;
  spotify_synced_at: string | null;
  verified: boolean;
}

type ArtistSummary = {
  totals: {
    totalRevenue: number;
    totalStreams: number;
    uniqueTracks: number;
    releaseCount: number;
    trackCount: number;
  };
  topTracks: Array<{
    title: string;
    isrc: string | null;
    total_revenue: number;
    artist_revenue: number;
    streams: number;
    platform_count: number;
  }>;
  recentReleases: Array<{
    id: string;
    title: string;
    status: string;
    release_type: string | null;
    cover_url: string | null;
    upc: string | null;
    created_at: string;
    release_date: string | null;
  }>;
  monthlyRevenue: Array<{
    period: string;
    total_revenue: number;
    artist_revenue: number;
    streams: number;
  }>;
};

const REQUIRED_FIELDS = [
  "artist_name",
  "artist_type",
  "genre",
  "country",
  "phone",
] as const;
const formatCurrency = (value: number) =>
  `Rp ${Number(value || 0).toLocaleString("id-ID")}`;

export default function ArtistProfile() {
  const { userId } = useParams<{ userId?: string }>();
  const { user, profile, isAdmin, isLabel, isWhitelabel, refreshProfile } =
    useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [artistProfile, setArtistProfile] = useState<ArtistProfileData | null>(
    null,
  );
  const [ownerName, setOwnerName] = useState("");
  const [artistSummary, setArtistSummary] = useState<ArtistSummary | null>(
    null,
  );

  const [formData, setFormData] = useState({
    artist_name: "",
    legal_name: "",
    artist_type: "solo",
    phone: profile?.phone || "",
    genre: "",
    country: "",
    city: "",
    language: "",
    gender: "",
    date_of_birth: "",
    bio: "",
    instagram: "",
    youtube: "",
    tiktok: "",
    twitter: "",
    website: "",
  });

  const [artistUserProfile, setArtistUserProfile] = useState<any>(null);
  const targetUserId = userId || user?.id;
  const isViewingOther = !!userId && userId !== user?.id;
  const isParentLabel = artistUserProfile?.parent_label_id === user?.id;
  const canEdit = !isViewingOther || isAdmin || isParentLabel;

  useEffect(() => {
    if (targetUserId) {
      fetchArtistProfile();
      fetchArtistSummary();
      fetchArtistSummary();
      if (isViewingOther) fetchOwnerName();
    }
  }, [targetUserId]);

  const fetchArtistSummary = async () => {
    if (!targetUserId) return;
    try {
      const { data, error } = await supabase.rpc(
        "get_artist_profile_summary" as any,
        {
          _artist_user_id: targetUserId,
        },
      );
      if (error) throw error;
      setArtistSummary((data || null) as ArtistSummary | null);
    } catch (error) {
      console.error("Error fetching artist summary:", error);
    }
  };

  const fetchOwnerName = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) {
      setOwnerName(data.full_name);
      setArtistUserProfile(data);
      setFormData((prev) => ({ ...prev, phone: data.phone || "" }));
    }
  };

  const fetchArtistProfile = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("artist_profiles")
        .select("*")
        .eq("user_id", targetUserId!)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setArtistProfile(data as ArtistProfileData);
        const social = (data.social_links as Record<string, string>) || {};
        setFormData({
          artist_name: data.artist_name || "",
          legal_name: data.legal_name || "",
          artist_type: data.artist_type || "solo",
          phone: isViewingOther
            ? artistUserProfile?.phone || ""
            : profile?.phone || "",
          genre: data.genre || "",
          country: data.country || "",
          city: data.city || "",
          language: data.language || "",
          gender: data.gender || "",
          date_of_birth: data.date_of_birth || "",
          bio: data.bio || "",
          instagram: social.instagram || "",
          youtube: social.youtube || "",
          tiktok: social.tiktok || "",
          twitter: social.twitter || "",
          website: social.website || "",
        });
      } else if (!isViewingOther) {
        setFormData((prev) => ({
          ...prev,
          artist_name: profile?.full_name || "",
        }));
      }
    } catch (error) {
      console.error("Error fetching artist profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetUserId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ukuran maksimal 5MB");
      return;
    }
    setUploadingPhoto(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      // RLS storage policy requires first folder = auth.uid()
      const path = `${targetUserId}/artist-photo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;

      const existingPayload = {
        user_id: targetUserId,
        artist_name:
          artistProfile?.artist_name ||
          formData.artist_name ||
          profile?.full_name ||
          "Artist",
        artist_type:
          artistProfile?.artist_type || formData.artist_type || "solo",
        profile_image_url: url,
      };

      const { data: existingRow, error: existingError } = await (
        supabase as any
      )
        .from("artist_profiles")
        .select("id")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (existingError) throw existingError;

      const mutation = existingRow
        ? (supabase as any)
            .from("artist_profiles")
            .update(existingPayload)
            .eq("user_id", targetUserId)
        : (supabase as any).from("artist_profiles").insert(existingPayload);

      const { error } = await mutation;
      if (error) throw error;

      setArtistProfile((prev) =>
        prev ? { ...prev, profile_image_url: url } : prev,
      );
      toast.success("Foto artis berhasil diupload");
      fetchArtistProfile();
    } catch (err: any) {
      toast.error(err.message || "Gagal upload foto");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    if (!targetUserId || !canEdit) return;
    if (!formData.artist_name.trim()) {
      toast.error("Nama artis wajib diisi");
      return;
    }
    if (!formData.phone.trim()) {
      toast.error("Nomor telepon wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const socialLinks: Record<string, string> = {};
      ["instagram", "youtube", "tiktok", "twitter", "website"].forEach((k) => {
        const v = (formData as any)[k];
        if (v) socialLinks[k] = v;
      });

      const profileData: any = {
        user_id: targetUserId,
        artist_name: formData.artist_name.trim(),
        artist_type: formData.artist_type,
        legal_name: formData.legal_name || null,
        genre: formData.genre || null,
        country: formData.country || null,
        city: formData.city || null,
        language: formData.language || null,
        gender: formData.gender || null,
        date_of_birth: formData.date_of_birth || null,
        bio: formData.bio || null,
        social_links: Object.keys(socialLinks).length > 0 ? socialLinks : null,
      };

      const { data: existingRow, error: existingError } = await (
        supabase as any
      )
        .from("artist_profiles")
        .select("id")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (existingError) throw existingError;

      const mutation = existingRow
        ? (supabase as any)
            .from("artist_profiles")
            .update(profileData)
            .eq("user_id", targetUserId)
        : (supabase as any).from("artist_profiles").insert(profileData);

      const { error } = await mutation;

      if (error) throw error;

      // Mark complete only if all required fields are filled
      const isComplete = REQUIRED_FIELDS.every((field) => {
        const value = field === "phone" ? formData.phone : profileData[field];
        return value && String(value).trim() !== "";
      });

      await supabase
        .from("profiles")
        .update({
          phone: formData.phone.trim(),
          artist_profile_completed: isComplete,
        })
        .eq("id", targetUserId);

      if (!isViewingOther) await refreshProfile();
      toast.success("Profil artis berhasil disimpan");
      fetchArtistProfile();
      fetchArtistSummary();
    } catch (error: any) {
      console.error("Error saving artist profile:", error);
      toast.error(error.message || "Gagal menyimpan profil artis");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const isComplete = REQUIRED_FIELDS.every((field) => {
    const value = formData[field];
    return value && String(value).trim() !== "";
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 w-full">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
            <Music className="h-7 w-7 text-primary" />
            {isViewingOther ? `Profil Artis — ${ownerName}` : "Profil Artis"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Profil ini jadi sumber data utama (nama, foto, dll) untuk semua
            release musik Anda.
          </p>
        </div>

        {/* Status */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg">Status Profil</CardTitle>
                <CardDescription>
                  {isComplete
                    ? "Profil sudah lengkap dan siap untuk release"
                    : "Lengkapi data wajib (nama, tipe, genre, negara) untuk membuat release"}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {artistProfile?.verified && (
                  <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 gap-1">
                    <BadgeCheck className="h-3 w-3" /> Verified
                  </Badge>
                )}
                <Badge variant={isComplete ? "default" : "secondary"}>
                  {isComplete ? "Lengkap" : "Belum Lengkap"}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Artist Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total Revenue Gross
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">
                {formatCurrency(artistSummary?.totals.totalRevenue || 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total Streams
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {Number(artistSummary?.totals.totalStreams || 0).toLocaleString(
                  "id-ID",
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Rilis / Track
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {artistSummary?.totals.releaseCount || 0} /{" "}
                {artistSummary?.totals.trackCount || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Tren Royalti
              Bulanan
            </CardTitle>
            <CardDescription>
              Total revenue berdasarkan periode royalty
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(artistSummary?.monthlyRevenue || []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-10 text-center">
                Belum ada data tren royalti.
              </div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={(artistSummary?.monthlyRevenue || []).map((row) => ({
                      period: row.period,
                      revenue: Number(row.total_revenue || 0),
                      streams: Number(row.streams || 0),
                    }))}
                    margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="artistProfileRevenue"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="hsl(var(--primary))"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="95%"
                          stopColor="hsl(var(--primary))"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="period"
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(value) => `${Number(value) / 1000}K`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                      }}
                      formatter={(value: any) => [
                        formatCurrency(Number(value || 0)),
                        "Total Revenue",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--primary))"
                      fill="url(#artistProfileRevenue)"
                      strokeWidth={2}
                      name="Total Revenue"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Top Lagu</CardTitle>
              <CardDescription>
                Ringkasan royalti singkat per lagu
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(artistSummary?.topTracks || []).length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Belum ada data royalti lagu.
                </div>
              ) : (
                (artistSummary?.topTracks || []).slice(0, 6).map((track) => (
                  <div
                    key={`${track.isrc || track.title}`}
                    className="rounded-xl border border-border/60 p-3 flex items-start justify-between gap-4"
                  >
                    <div>
                      <div className="font-medium">{track.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {track.isrc || "-"} ·{" "}
                        {Number(track.streams || 0).toLocaleString("id-ID")}{" "}
                        streams
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-green-400 font-medium">
                        {formatCurrency(track.total_revenue || 0)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Rilis Terbaru</CardTitle>
              <CardDescription>Rilis artist ini</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(artistSummary?.recentReleases || []).length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Belum ada rilis.
                </div>
              ) : (
                (artistSummary?.recentReleases || []).map((rel) => (
                  <div
                    key={rel.id}
                    className="rounded-xl border border-border/60 p-3 flex items-start justify-between gap-4"
                  >
                    <div>
                      <div className="font-medium">{rel.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {rel.release_type || "-"} ·{" "}
                        {rel.release_date ||
                          rel.created_at?.slice(0, 10) ||
                          "-"}
                      </div>
                    </div>
                    <Badge
                      variant={
                        rel.status === "active" ? "default" : "secondary"
                      }
                    >
                      {rel.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Foto Artis */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Foto Artis</CardTitle>
            <CardDescription>
              Foto resmi yang dipakai untuk metadata DSP. Maks 5MB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24 border-2 border-border">
                <AvatarImage
                  src={artistProfile?.profile_image_url || undefined}
                />
                <AvatarFallback className="text-xl">
                  {formData.artist_name?.[0]?.toUpperCase() || <User />}
                </AvatarFallback>
              </Avatar>
              {canEdit && (
                <div>
                  <input
                    type="file"
                    id="artist-photo"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhoto}
                  />
                  <label htmlFor="artist-photo">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      disabled={uploadingPhoto}
                    >
                      <span className="cursor-pointer">
                        {uploadingPhoto ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Foto
                          </>
                        )}
                      </span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Profile Form */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Informasi Artis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nama Artis / Stage Name *</Label>
                <Input
                  value={formData.artist_name}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      artist_name: e.target.value,
                    }))
                  }
                  placeholder="Nama panggung"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Nama Legal / Asli</Label>
                <Input
                  value={formData.legal_name}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      legal_name: e.target.value,
                    }))
                  }
                  placeholder="Untuk kontrak (opsional)"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipe Artis</Label>
                <Select
                  value={formData.artist_type}
                  onValueChange={(v) =>
                    setFormData((prev) => ({ ...prev, artist_type: v }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solo">Solo</SelectItem>
                    <SelectItem value="band">Band</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nomor Telepon *</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="Masukkan nomor telepon aktif"
                  disabled={!canEdit}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Genre Utama *</Label>
                <Input
                  value={formData.genre}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, genre: e.target.value }))
                  }
                  placeholder="Pop, Rock, Hip-Hop, dll."
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Negara *</Label>
                <Input
                  value={formData.country}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      country: e.target.value,
                    }))
                  }
                  placeholder="Indonesia"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Kota</Label>
                <Input
                  value={formData.city}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, city: e.target.value }))
                  }
                  placeholder="Jakarta"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Bahasa Utama</Label>
                <Input
                  value={formData.language}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      language: e.target.value,
                    }))
                  }
                  placeholder="Indonesia, English, dll."
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Gender</Label>
                <Select
                  value={formData.gender || "unspecified"}
                  onValueChange={(v) =>
                    setFormData((prev) => ({
                      ...prev,
                      gender: v === "unspecified" ? "" : v,
                    }))
                  }
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unspecified">
                      Tidak ditentukan
                    </SelectItem>
                    <SelectItem value="male">Laki-laki</SelectItem>
                    <SelectItem value="female">Perempuan</SelectItem>
                    <SelectItem value="other">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Tanggal Lahir / Berdiri</Label>
                <Input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      date_of_birth: e.target.value,
                    }))
                  }
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                value={formData.bio}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, bio: e.target.value }))
                }
                placeholder="Ceritakan tentang artis ini..."
                className="min-h-[100px]"
                disabled={!canEdit}
              />
            </div>

            <Separator />

            <h3 className="text-sm font-medium">Tautan Sosial Media</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input
                  value={formData.instagram}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      instagram: e.target.value,
                    }))
                  }
                  placeholder="@username"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>YouTube</Label>
                <Input
                  value={formData.youtube}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      youtube: e.target.value,
                    }))
                  }
                  placeholder="https://youtube.com/@channel"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>TikTok</Label>
                <Input
                  value={formData.tiktok}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, tiktok: e.target.value }))
                  }
                  placeholder="@username"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label>Twitter / X</Label>
                <Input
                  value={formData.twitter}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      twitter: e.target.value,
                    }))
                  }
                  placeholder="@username"
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Website</Label>
                <Input
                  value={formData.website}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      website: e.target.value,
                    }))
                  }
                  placeholder="https://yourwebsite.com"
                  disabled={!canEdit}
                />
              </div>
            </div>

            {canEdit && (
              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="gradient-primary"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Simpan Profil
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Music className="h-5 w-5 text-[#1DB954]" aria-hidden="true" />
                Spotify Artist
              </CardTitle>
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                Dalam Perbaikan
              </Badge>
            </div>
            <CardDescription>
              Hubungkan Spotify Artist untuk auto-sync data publik (foto, follower, top tracks).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div role="status" className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Fitur Spotify sementara dinonaktifkan selama pemeliharaan. Data profil Spotify yang sudah tersimpan tetap aman.
              </p>
            </div>
          </CardContent>
        </Card>

        {!isViewingOther && (
          <Card className="bg-muted/30 border-border/50">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Penting:</strong> Nama artis di sini akan dipakai
                sebagai Main Artist untuk semua release baru. Featured artist
                tetap bisa ditambahkan bebas saat membuat release.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
