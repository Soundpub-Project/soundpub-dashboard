import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Mail, CheckCircle2, AlertCircle } from 'lucide-react'

export default function VerifyEmailRequired() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  
  const [isResending, setIsResending] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [canResend, setCanResend] = useState(true)
  const [countdown, setCountdown] = useState(0)

  // If user is not logged in, redirect to auth
  if (!user) {
    navigate('/auth')
    return null
  }

  // If email is already verified, redirect to dashboard
  if (user.email_confirmed_at) {
    navigate('/dashboard')
    return null
  }

  const handleResendEmail = async () => {
    if (!canResend) {
      toast({
        title: 'Harap Tunggu',
        description: `Anda dapat mengirim ulang dalam ${countdown} detik`,
        variant: 'destructive'
      })
      return
    }

    setIsResending(true)

    try {
      if (!user.email) {
        throw new Error('Email akun tidak tersedia')
      }

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: {
          emailRedirectTo: `${window.location.origin}/verify-email`,
        },
      })

      if (error) {
        throw error
      }

      setIsSent(true)
      toast({
        title: 'Email Terkirim',
        description: 'Silakan cek inbox Anda untuk link verifikasi'
      })

      // Set cooldown for 60 seconds
      setCanResend(false)
      setCountdown(60)
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            setCanResend(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)

    } catch (err: any) {
      console.error('Resend email error:', err)
      toast({
        title: 'Gagal Mengirim Email',
        description: err.message || 'Terjadi kesalahan. Silakan coba lagi.',
        variant: 'destructive'
      })
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              isSent 
                ? 'bg-green-100 dark:bg-green-900/20' 
                : 'bg-amber-100 dark:bg-amber-900/20'
            }`}>
              {isSent ? (
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              ) : (
                <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              )}
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            {isSent ? 'Email Terkirim!' : 'Verifikasi Email Diperlukan'}
          </CardTitle>
          <CardDescription>
            {isSent ? (
              'Kami telah mengirim ulang link verifikasi ke email Anda'
            ) : (
              <>
                Silakan verifikasi email Anda untuk melanjutkan
                <br />
                <span className="font-medium text-foreground">{user?.email}</span>
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium">Langkah verifikasi:</p>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
              <li>Buka inbox email Anda</li>
              <li>Cari email dari SoundPub</li>
              <li>Klik link verifikasi dalam email</li>
              <li>Akun Anda akan aktif otomatis</li>
            </ol>
          </div>

          {isSent && (
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30 p-3 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-400">
                Email verifikasi telah dikirim. Cek folder spam jika tidak menemukannya di inbox.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Button 
              variant="default" 
              className="w-full"
              onClick={handleResendEmail}
              disabled={isResending || !canResend}
            >
              {isResending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mengirim...
                </>
              ) : !canResend ? (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Kirim Ulang ({countdown}s)
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Kirim Ulang Email Verifikasi
                </>
              )}
            </Button>

            <Button 
              variant="outline" 
              className="w-full" 
              asChild
            >
              <Link to="/dashboard">
                Lanjut ke Dashboard
              </Link>
            </Button>
          </div>

          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Link verifikasi berlaku selama <strong>7 hari</strong>
            </p>
            <p className="text-xs text-muted-foreground">
              Email salah?{' '}
              <Link to="/auth" className="text-primary hover:underline">
                Hubungi support
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
