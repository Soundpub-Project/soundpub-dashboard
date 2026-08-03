/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Atur ulang kata sandi {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Atur ulang kata sandi</Heading>
        <Text style={text}>
          Kami menerima permintaan untuk mengatur ulang kata sandi akun {siteName} Anda. Tekan tombol di bawah untuk membuat kata sandi baru.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Atur Ulang Kata Sandi
        </Button>
        <Text style={footer}>
          Jika Anda tidak meminta ini, abaikan email ini. Kata sandi Anda tidak akan berubah.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(240, 10%, 10%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: 'hsl(240, 5%, 45%)',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: 'hsl(20, 90%, 48%)',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '12px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
