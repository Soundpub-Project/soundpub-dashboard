import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Music2, ArrowRight, Disc3, DollarSign, Users } from 'lucide-react';

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-primary opacity-10" />
        
        <div className="container mx-auto px-4 py-20">
          {/* Header */}
          <nav className="flex items-center justify-between mb-16">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl gradient-primary">
                <Music2 className="h-6 w-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-gradient">SoundPub</span>
            </div>
            <Link to="/auth">
              <Button variant="outline">Login</Button>
            </Link>
          </nav>

          {/* Hero Content */}
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              Platform Distribusi Musik <span className="text-gradient">Profesional</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Distribusikan musik Anda ke seluruh platform streaming dunia. 
              Kelola royalti, pantau performa, dan kembangkan karir musik Anda.
            </p>
            <div className="flex gap-4 justify-center">
              <Link to="/auth">
                <Button size="lg" className="gradient-primary">
                  Mulai Sekarang
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-6 rounded-xl bg-card/50 border border-border/50">
            <Disc3 className="h-10 w-10 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Distribusi Global</h3>
            <p className="text-muted-foreground">
              Musik Anda tersedia di Spotify, Apple Music, dan 150+ platform lainnya.
            </p>
          </div>
          
          <div className="p-6 rounded-xl bg-card/50 border border-border/50">
            <DollarSign className="h-10 w-10 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Royalti Transparan</h3>
            <p className="text-muted-foreground">
              Pantau pendapatan real-time dari setiap stream dan download.
            </p>
          </div>
          
          <div className="p-6 rounded-xl bg-card/50 border border-border/50">
            <Users className="h-10 w-10 text-primary mb-4" />
            <h3 className="text-xl font-semibold mb-2">Multi-Role Access</h3>
            <p className="text-muted-foreground">
              Dashboard khusus untuk Admin, Label, dan Artist dengan akses sesuai role.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© 2024 SoundPub. Music Distribution Platform.</p>
        </div>
      </footer>
    </div>
  );
}
