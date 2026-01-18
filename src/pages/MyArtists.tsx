import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Music, Search, Loader2, UserPlus, MoreHorizontal, Pencil, Trash2, KeyRound } from 'lucide-react';
import { AddUserDialog } from '@/components/users/AddUserDialog';
import { EditArtistDialog } from '@/components/users/EditArtistDialog';
import { DeleteArtistDialog } from '@/components/users/DeleteArtistDialog';
import { ChangePasswordDialog } from '@/components/users/ChangePasswordDialog';

interface ArtistProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  status: string;
  balance: number;
  address: string | null;
  created_at: string;
}

export default function MyArtists() {
  const navigate = useNavigate();
  const { user, isLabel, isWhitelabel, loading: authLoading } = useAuth();
  const [artists, setArtists] = useState<ArtistProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [addArtistDialogOpen, setAddArtistDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<ArtistProfile | null>(null);

  const canAccessMyArtists = isLabel || isWhitelabel;
  
  useEffect(() => {
    if (!authLoading && !canAccessMyArtists) {
      navigate('/dashboard');
    }
  }, [canAccessMyArtists, authLoading, navigate]);

  useEffect(() => {
    if (canAccessMyArtists && user) {
      fetchArtists();
    }
  }, [canAccessMyArtists, user]);

  const fetchArtists = async () => {
    if (!user) return;
    
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('parent_label_id', user.id)
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      setArtists(profiles || []);
    } catch (error) {
      console.error('Error fetching artists:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      active: 'default',
      inactive: 'secondary',
      suspended: 'destructive',
    };
    return variants[status] || 'secondary';
  };

  const handleEditClick = (artist: ArtistProfile) => {
    setSelectedArtist(artist);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (artist: ArtistProfile) => {
    setSelectedArtist(artist);
    setDeleteDialogOpen(true);
  };

  const handlePasswordClick = (artist: ArtistProfile) => {
    setSelectedArtist(artist);
    setPasswordDialogOpen(true);
  };

  const filteredArtists = artists.filter(
    (artist) =>
      artist.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      artist.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!canAccessMyArtists) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">My Artists</h1>
          <p className="text-muted-foreground">Kelola artist di bawah label Anda</p>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Daftar Artists</CardTitle>
                <CardDescription>{artists.length} total artists</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari artist..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button onClick={() => setAddArtistDialogOpen(true)} className="gradient-primary">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Tambah Artist
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredArtists.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Music className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada artist</p>
                <p className="text-sm mt-2">Klik "Tambah Artist" untuk menambahkan artist baru</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Telepon</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Bergabung</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredArtists.map((artist) => (
                      <TableRow key={artist.id}>
                        <TableCell className="font-medium">{artist.full_name}</TableCell>
                        <TableCell>{artist.email}</TableCell>
                        <TableCell>{artist.phone || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadge(artist.status)} className="capitalize">
                            {artist.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          Rp {Number(artist.balance).toLocaleString('id-ID')}
                        </TableCell>
                        <TableCell>
                          {new Date(artist.created_at).toLocaleDateString('id-ID')}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditClick(artist)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePasswordClick(artist)}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                Ubah Password
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleDeleteClick(artist)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Hapus dari Label
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AddUserDialog
        open={addArtistDialogOpen}
        onOpenChange={setAddArtistDialogOpen}
        onSuccess={fetchArtists}
        allowedRoles={['artist']}
      />

      <EditArtistDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        artist={selectedArtist}
        onSuccess={fetchArtists}
      />

      <DeleteArtistDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        artist={selectedArtist}
        onSuccess={fetchArtists}
      />

      <ChangePasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
        user={selectedArtist}
        onSuccess={fetchArtists}
      />
    </DashboardLayout>
  );
}
