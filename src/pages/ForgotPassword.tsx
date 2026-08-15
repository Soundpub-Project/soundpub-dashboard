import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
import { z } from 'zod'

const emailSchema = z.string().email('Email tidak valid')

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate email
    try {
      emailSchema.parse(email)
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message)
        return
      }
    }

    setIsLoading(true)

    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (recoveryError) {
        throw recoveryError
      }

      setIsSuccess(true)
      toast({
        title: 'Email Terkirim',
        description: 'Silakan cek inbox Anda untuk link reset password'
      })

    } catch (err: any) {
      console.error('Error:', err)
      toast({
        title: 'Gagal Mengirim Email',
        description: err.message || 'Terjadi kesalahan. Silakan coba lagi.',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Email Terkirim!</CardTitle>
            <CardDescription className="text-base">
              Kami telah mengirim link reset password ke email Anda
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
              <p className="font-medium">Langkah selanjutnya:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Buka inbox email Anda</li>
                <li>Cari email dari SoundPub</li>
                <li>Klik link reset password</li>
                <li>Buat password baru</li>
              </ol>
            </div>

            <div className="text-sm text-muted-foreground text-center space-y-1">
              <p>Link berlaku selama <strong>24 jam</strong></p>
              <p>Tidak menerima email? Cek folder spam Anda</p>
            </div>

            <Button 
              variant="outline" 
              className="w-full" 
              asChild
            >
              <Link to="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Kembali ke Login
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Lupa Password?
          </CardTitle>
          <CardDescription className="text-center">
            Masukkan email Anda dan kami akan mengirim link untuk reset password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`pl-10 ${error ? 'border-destructive' : ''}`}
                  required
                  disabled={isLoading}
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mengirim...
                </>
              ) : (
                'Kirim Link Reset Password'
              )}
            </Button>

            <div className="text-center">
              <Link 
                to="/login" 
                className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center"
              >
                <ArrowLeft className="mr-1 h-3 w-3" />
                Kembali ke Login
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
