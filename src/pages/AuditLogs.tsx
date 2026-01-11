import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { ScrollText, Search, Loader2, KeyRound, UserCog, Shield } from 'lucide-react';

interface AuditLogDetails {
  actor_role?: string;
  actor_name?: string;
  actor_email?: string;
  target_name?: string;
  target_email?: string;
  [key: string]: unknown;
}

interface AuditLog {
  id: string;
  action: string;
  actor_id: string;
  target_id: string | null;
  target_type: string | null;
  details: AuditLogDetails | null;
  ip_address: string | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  password_change: {
    label: 'Password Changed',
    icon: <KeyRound className="h-3 w-3" />,
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  role_change: {
    label: 'Role Changed',
    icon: <UserCog className="h-3 w-3" />,
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  },
  user_created: {
    label: 'User Created',
    icon: <Shield className="h-3 w-3" />,
    color: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
};

export default function AuditLogs() {
  const { isAdmin, loading: authLoading, user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user && isAdmin) {
      fetchLogs();
    }
  }, [isAdmin, user]);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      setLogs((data || []) as AuditLog[]);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    const config = ACTION_CONFIG[action] || {
      label: action,
      icon: <ScrollText className="h-3 w-3" />,
      color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    };

    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${config.color}`}>
        {config.icon}
        <span>{config.label}</span>
      </div>
    );
  };

  const filteredLogs = logs.filter((log) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(searchLower) ||
      log.details?.actor_name?.toLowerCase().includes(searchLower) ||
      log.details?.actor_email?.toLowerCase().includes(searchLower) ||
      log.details?.target_name?.toLowerCase().includes(searchLower) ||
      log.details?.target_email?.toLowerCase().includes(searchLower)
    );
  });

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">Riwayat aktivitas admin dan label</p>
        </div>

        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle>Activity Logs</CardTitle>
                <CardDescription>{logs.length} total logs</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari log..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ScrollText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada audit logs</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Aksi</TableHead>
                      <TableHead>Dilakukan Oleh</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="text-sm">
                            {new Date(log.created_at).toLocaleDateString('id-ID')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleTimeString('id-ID')}
                          </div>
                        </TableCell>
                        <TableCell>{getActionBadge(log.action)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{log.details?.actor_name || '-'}</div>
                          <div className="text-xs text-muted-foreground">
                            {log.details?.actor_email || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{log.details?.target_name || '-'}</div>
                          <div className="text-xs text-muted-foreground">
                            {log.details?.target_email || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {log.details?.actor_role || '-'}
                          </Badge>
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
    </DashboardLayout>
  );
}
