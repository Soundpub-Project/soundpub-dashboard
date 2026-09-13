import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Loader2, CheckCircle2, AlertCircle, Mail } from 'lucide-react'

export default function VerifyEmail() {
  const navigate = useNavigate()
  const { toast } = useToast()
  
  const [isVerifying, setIsVerifying] = useState(true)
  const [isSuccess, setIsSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const verifyEmail = async () => {
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user?.email_confirmed_at) {
        setErrorMessage('Link verifikasi tidak valid atau sudah kadaluarsa')
        setIsVerifying(false)
        return
      }

      await supabase
        .from('profiles')
        .update({ email_verified: true })
        .eq('id', user.id)

      setIsSuccess(true)
      setIsVerifying(false)
      toast({
        title: 'Email Terverifikasi!',
        description: 'Akun Anda telah aktif'
      })
      setTimeout(() => navigate('/dashboard'), 3000)
    }

    verifyEmail()
  }, [navigate, toast])

  // Verifying state
  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-8 h-8 text-primary animate-pulse" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Memverifikasi Email</CardTitle>
            <CardDescription>
              Mohon tunggu sebentar...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Success state
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
            <CardTitle className="text-2xl font-bold">Email Terverifikasi!</CardTitle>
            <CardDescription>
              Akun Anda telah aktif dan siap digunakan
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">
                Anda akan diarahkan ke dashboard...
              </p>
            </div>

            <Button 
              variant="default" 
              className="w-full" 
              asChild
            >
              <Link to="/dashboard">
                Lanjut ke Dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Verifikasi Gagal</CardTitle>
          <CardDescription>
            {errorMessage || 'Link verifikasi tidak valid atau sudah kadaluarsa'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium">Kemungkinan penyebab:</p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Link sudah pernah digunakan</li>
              <li>Link sudah kadaluarsa (lebih dari 7 hari)</li>
              <li>Link tidak lengkap atau rusak</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Button 
              variant="default" 
              className="w-full" 
              asChild
            >
              <Link to="/verify-email-required">
                Kirim Ulang Email Verifikasi
              </Link>
            </Button>

            <Button 
              variant="outline" 
              className="w-full" 
              asChild
            >
              <Link to="/auth">
                Kembali ke Login
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
