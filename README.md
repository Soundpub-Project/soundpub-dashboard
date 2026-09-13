<div align="center">

# 🎵 Soundpub Dashboard

### Platform Distribusi Musik Digital Terpadu

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18.3-61dafb?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646cff?logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ecf8e?logo=supabase)](https://supabase.com/)

**Dashboard administratif enterprise-grade untuk ekosistem musik digital**  
Manajemen artis • Label • Konten • Distribusi • Analitik

[Dokumentasi](#dokumentasi) • [Quick Start](#quick-start) • [Fitur](#fitur-utama) • [Tech Stack](#teknologi-stack)

---

</div>

## 📖 Tentang Project

**Soundpub Dashboard** adalah aplikasi web modern yang dibangun untuk mengelola ekosistem distribusi musik digital secara komprehensif. Platform ini menyediakan interface yang intuitif untuk mengelola artis, label, konten musik, transaksi, dan analitik bisnis.

Project ini dimulai dengan [**Lovable**](https://lovable.dev) - AI-powered app builder, dan dikembangkan lebih lanjut menjadi platform enterprise-grade dengan integrasi backend Supabase, autentikasi Keycloak SSO, payment gateway Midtrans, dan sistem notifikasi email otomatis.

### 🎯 Tujuan Project

- Menyediakan platform terpusat untuk distribusi musik digital
- Manajemen multi-tenant untuk artis, label, dan admin
- Otomasi proses royalti dan pembayaran
- Real-time analytics dan reporting
- Integrasi dengan platform distribusi musik global

---

## 👨‍💻 Tim Pengembang

<table>
<tr>
<td align="center" width="50%">

**Kharisman (Mas Kharisman)**  
Lead Developer & Architect

📧 bimokharis1810@gmail.com  
📧 me@maskhar.com  
🌐 [maskhar.com](https://maskhar.com)  
📱 [@maskhar_2708](https://instagram.com/maskhar_2708)

</td>
<td align="center" width="50%">

**Utero Indonesia**  
Technology Partner

🏢 Perusahaan Teknologi  
🌐 [uteroindonesia.com](https://uteroindonesia.com)  
🌐 [carubra.com](https://carubra.com)

</td>
</tr>
</table>

---

## 💡 Fitur Utama

<table>
<tr>
<td width="50%">

**User Experience**
- Interface modern & responsif
- Dark mode support
- Mobile-first design
- Accessibility compliant
- Intuitive navigation

**User Management**
- SSO dengan Keycloak
- Multi-role system
- Multi-tenant architecture
- User analytics
- Row-level security

**Business Intelligence**
- Real-time dashboard
- Sales & royalty reports
- Trend analysis
- KPI tracking
- Custom reports

</td>
<td width="50%">

**Content Management**
- Upload & distribusi musik
- Metadata management
- Album artwork
- Genre & tagging
- Version control

**Payment & Finance**
- Integrasi Midtrans
- Multiple payment methods
- Invoice generation
- Automated royalties
- Financial reporting

**Communication**
- Email notifications
- Real-time alerts
- Transactional emails
- Newsletter system
- Targeted campaigns

</td>
</tr>
</table>

---

## 🛠️ Teknologi Stack

### Frontend Framework

<table>
<tr>
<td width="33%">

**Core Technologies**
- React 18.3
- TypeScript 5.8
- Vite 5.4

</td>
<td width="33%">

**State Management**
- TanStack Query 5.83
- React Router DOM 6.30
- React Hook Form 7.61
- Zod 3.25

</td>
<td width="33%">

**UI Libraries**
- Lucide React 0.462
- Date-fns 3.6
- Embla Carousel 8.6
- Recharts 2.15

</td>
</tr>
</table>

### UI Components & Styling

**Styling Framework**
- Tailwind CSS 3.4
- PostCSS 8.5 + Autoprefixer
- tailwind-merge - Class merging utility
- tailwindcss-animate - Animation utilities
- @tailwindcss/typography - Typography plugin
- class-variance-authority - CVA styling
- next-themes 0.3 - Dark mode support

**Component Library: shadcn/ui + Radix UI**

Accordion • Alert Dialog • Aspect Ratio • Avatar • Checkbox • Collapsible • Context Menu • Dialog • Dropdown Menu • Hover Card • Label • Menubar • Navigation Menu • Popover • Progress • Radio Group • Scroll Area • Select • Separator • Slider • Switch • Tabs • Toast • Toggle • Tooltip

**Additional Components**
- cmdk - Command menu
- sonner - Toast notifications
- vaul - Drawer component
- input-otp - OTP input
- react-resizable-panels - Resizable panels
- react-day-picker - Date picker

### Backend & Infrastructure

**Backend as a Service - Supabase 2.90**
- PostgreSQL Database
- Row Level Security (RLS)
- Edge Functions
- Real-time Subscriptions
- Storage & CDN
- RESTful API Auto-generated

**Authentication & Security - Keycloak 26.2**
- Single Sign-On (SSO)
- Identity Management
- OAuth 2.0 / OIDC
- Role-based Access Control
- @lovable.dev/cloud-auth-js

### Third-party Integrations

**Payment Gateway**
- Midtrans - Payment gateway Indonesia
- Snap Payment
- Core API
- Webhooks

**Email Service**
- Resend - Transactional email
- Email templates
- Analytics

**Infrastructure**
- Docker & Docker Compose
- Nginx
- Git

### Development Tools

```
Linting:        ESLint 9.32 + TypeScript ESLint
Build Tool:     Vite 5.4 + SWC
Bundler:        @vitejs/plugin-react-swc 3.11
Package Mgr:    npm / pnpm / bun
Type Checking:  TypeScript 5.8
CSS Processing: PostCSS 8.5 + Autoprefixer
```

---

## 📋 Prerequisites

Pastikan sistem Anda memiliki:

| Tool | Version | Link |
|------|---------|------|
| Node.js | >= 18.x | [Download](https://nodejs.org/) atau [nvm](https://github.com/nvm-sh/nvm) |
| npm | >= 9.x | Included with Node.js |
| Git | Latest | [Download](https://git-scm.com/) |
| Docker (optional) | Latest | [Download](https://www.docker.com/) |
| Supabase CLI (optional) | Latest | [Install](https://supabase.com/docs/guides/cli) |

**Alternatif Package Manager:**
- **pnpm** - `npm install -g pnpm`
- **bun** - [Install Bun](https://bun.sh/)

---

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone <YOUR_GIT_URL>
cd Soundpub-dashboard
```

### 2. Install Dependencies

```bash
# Menggunakan npm (recommended)
npm install

# Atau menggunakan pnpm (lebih cepat)
pnpm install

# Atau menggunakan bun (paling cepat)
bun install
```

### 3. Setup Environment Variables

Copy file example dan konfigurasi:

```bash
cp .env.example .env
```

Edit `.env` dan isi kredensial Anda:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# Keycloak SSO
VITE_KEYCLOAK_URL=https://your-keycloak.com
VITE_KEYCLOAK_REALM=your_realm
VITE_KEYCLOAK_CLIENT_ID=your_client_id

# Payment Gateway
VITE_MIDTRANS_CLIENT_KEY=your_midtrans_key
VITE_MIDTRANS_IS_PRODUCTION=false

# Email Service
VITE_RESEND_API_KEY=your_resend_key

# App Configuration
VITE_APP_URL=http://localhost:5173
```

> Lihat [ENV-DOCS.md](docs/ENV-DOCS.md) untuk dokumentasi lengkap environment variables

### 4. Run Development Server

```bash
npm run dev
```

Aplikasi berjalan di **http://localhost:5173**

---

## 📦 Build & Deployment

### Build Commands

```bash
# Production build (optimized)
npm run build

# Development build (with source maps)
npm run build:dev

# Preview production build locally
npm run preview

# Lint code
npm run lint
```

Build output tersimpan di folder `dist/`

### Docker Deployment

**Build & Run dengan Docker Compose:**

```bash
# Build image
docker-compose build

# Run container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop container
docker-compose down
```

**Manual Docker Build:**

```bash
# Build image
docker build -t Soundpub-dashboard:latest .

# Run container
docker run -p 80:80 -d Soundpub-dashboard:latest
```

> Panduan lengkap: [MANUAL_DEPLOY_GUIDE.md](docs/deployment/MANUAL_DEPLOY_GUIDE.md)

---

## 📚 Dokumentasi

### Struktur Dokumentasi

```
docs/
├── deployment/              # Panduan deployment
│   ├── ADMIN_DEPLOYMENT_CHECKLIST.md
│   ├── CUSTOM_SUPABASE_SETUP.md
│   ├── DEPLOY_EDGE_FUNCTIONS.md
│   └── MANUAL_DEPLOY_GUIDE.md
│
├── security/                # Dokumentasi keamanan
│   ├── ENV_SECURITY_AND_DOCKER.md
│   └── SECURITY_FIX_REPORT.md
│
├── project-management/      # Manajemen project
│   ├── START_HERE.md
│   ├── QUICK_REFERENCE.md
│   ├── FILE_INDEX.md
│   ├── TIMELINE_CHECKLIST.md
│   ├── TODO.md
│   └── TROUBLESHOOTING.md
│
├── database/                # Database schemas
│   └── migrations/
│
├── API-DOCS.md                 # REST API documentation
├── SSO-INTEGRATION-DOCS.md     # Keycloak SSO setup
├── PAYMENT-GATEWAY-DOCS.md     # Midtrans integration
├── EMAIL_AND_NOTIFICATION_SYSTEM.md
├── MIGRATION-GUIDE.md
├── UI_UX_RESPONSIVE_AUDIT.md
├── VPS-SETUP-GUIDE.md
├── PRD.md                      # Product Requirements
├── SDD.md                      # System Design
└── README.md                   # Dokumentasi index
```

### Quick Links Dokumentasi

| Kategori | Dokumen | Deskripsi |
|----------|---------|-----------|
| **Getting Started** | [START_HERE.md](docs/project-management/START_HERE.md) | Panduan awal untuk developer baru |
| **Quick Reference** | [QUICK_REFERENCE.md](docs/project-management/QUICK_REFERENCE.md) | Command dan referensi cepat |
| **API** | [API-DOCS.md](docs/API-DOCS.md) | Dokumentasi REST API endpoints |
| **SSO** | [SSO-INTEGRATION-DOCS.md](docs/SSO-INTEGRATION-DOCS.md) | Setup Keycloak authentication |
| **Payment** | [PAYMENT-GATEWAY-DOCS.md](docs/PAYMENT-GATEWAY-DOCS.md) | Integrasi Midtrans payment |
| **Email** | [EMAIL_AND_NOTIFICATION_SYSTEM.md](docs/EMAIL_AND_NOTIFICATION_SYSTEM.md) | Sistem email & notifikasi |
| **Database** | [MIGRATION-GUIDE.md](docs/MIGRATION-GUIDE.md) | Panduan migrasi database |
| **Deploy** | [MANUAL_DEPLOY_GUIDE.md](docs/deployment/MANUAL_DEPLOY_GUIDE.md) | Deployment ke production |
| **Security** | [ENV_SECURITY_AND_DOCKER.md](docs/security/ENV_SECURITY_AND_DOCKER.md) | Best practices security |
| **Troubleshoot** | [TROUBLESHOOTING.md](docs/project-management/TROUBLESHOOTING.md) | Solusi masalah umum |

> Index lengkap: [docs/README.md](docs/README.md)

---

## 🗂️ Struktur Project

```
Soundpub-dashboard/
│
├── src/                     # Source code
│   ├── components/          # React components
│   │   ├── ui/              # shadcn/ui components
│   │   ├── layout/          # Layout components
│   │   └── features/        # Feature components
│   │
│   ├── pages/               # Page components (routes)
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities & helpers
│   │   ├── supabase.ts      # Supabase client
│   │   ├── keycloak.ts      # Keycloak config
│   │   └── utils.ts         # Helper functions
│   │
│   ├── types/               # TypeScript types
│   ├── styles/              # Global styles
│   ├── App.tsx              # Main app component
│   └── main.tsx             # Entry point
│
├── public/                  # Static assets
│   ├── favicon.ico
│   └── images/
│
├── docs/                    # Dokumentasi
├── supabase/                # Supabase config & migrations
├── patches/                 # Package patches
├── dist/                    # Build output
│
├── .env.example             # Environment template
├── .gitignore               # Git ignore rules
├── .dockerignore            # Docker ignore rules
├── Dockerfile               # Docker configuration
├── docker-compose.yml       # Docker Compose
├── nginx.conf               # Nginx config
│
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript config
├── vite.config.ts           # Vite config
├── tailwind.config.ts       # Tailwind config
├── components.json          # shadcn/ui config
├── eslint.config.js         # ESLint config
│
├── README.md                # Project documentation
└── LICENSE                  # MIT License
```

---

## 🧪 Testing & Quality

### Code Quality

```bash
# Run linter
npm run lint

# Type checking
npx tsc --noEmit

# Build test
npm run build
```

### Pre-deployment Checklist

- [ ] All tests passing
- [ ] No linting errors
- [ ] TypeScript compilation successful
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Production build tested

---

## 🔒 Security

### Best Practices Implemented

- Row Level Security (RLS) di Supabase
- Environment variables tidak di-commit
- HTTPS enforced di production
- CORS properly configured
- Input validation dengan Zod
- XSS protection
- SQL injection prevention
- Rate limiting di edge functions

> Baca: [ENV_SECURITY_AND_DOCKER.md](docs/security/ENV_SECURITY_AND_DOCKER.md)

### Reporting Security Issues

Jika Anda menemukan vulnerability, silakan email ke:
- 📧 bimokharis1810@gmail.com
- 📧 me@maskhar.com

**Please do not** open public issues untuk security vulnerabilities.

---

## 🤝 Contributing

Kontribusi sangat diterima! Ikuti langkah berikut:

1. **Fork** repository ini
2. **Create** branch fitur (`git checkout -b feature/AmazingFeature`)
3. **Commit** perubahan (`git commit -m 'Add some AmazingFeature'`)
4. **Push** ke branch (`git push origin feature/AmazingFeature`)
5. **Open** Pull Request

### Contribution Guidelines

- Ikuti code style yang ada
- Tulis kode yang clean dan maintainable
- Tambahkan dokumentasi untuk fitur baru
- Update README jika diperlukan
- Test code sebelum submit PR

---

## 📄 License

Project ini dilisensikan di bawah **MIT License**.

```
MIT License

Copyright (c) 2026 Kharisman (Mas Kharisman)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

Lihat file [LICENSE](LICENSE) untuk detail lengkap.

---

## 🙏 Credits & Acknowledgments

### Built With

- **[Lovable](https://lovable.dev)** - AI-powered app builder (project origin)
- **[shadcn/ui](https://ui.shadcn.com)** - Beautiful UI components
- **[Supabase](https://supabase.com)** - Open source Firebase alternative
- **[Keycloak](https://www.keycloak.org)** - Open source identity management
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first CSS framework
- **[React](https://reactjs.org)** - UI library
- **[Vite](https://vitejs.dev)** - Next generation frontend tooling

### Special Thanks

- Tim **Lovable** untuk platform yang amazing
- Komunitas **React** dan **TypeScript**
- Contributors **shadcn/ui** dan **Radix UI**
- Tim **Supabase** untuk BaaS yang powerful
- Semua open source contributors

---

## 📞 Kontak & Support

<div align="center">

### Developer Contact

**Kharisman (Mas Kharisman)**

[![Email](https://img.shields.io/badge/Email-bimokharis1810%40gmail.com-red?logo=gmail)](mailto:bimokharis1810@gmail.com)
[![Email](https://img.shields.io/badge/Email-me%40maskhar.com-blue?logo=gmail)](mailto:me@maskhar.com)
[![Website](https://img.shields.io/badge/Website-maskhar.com-green?logo=google-chrome)](https://maskhar.com)
[![Instagram](https://img.shields.io/badge/Instagram-%40maskhar__2708-E4405F?logo=instagram)](https://instagram.com/maskhar_2708)

### Business Inquiries

**Utero Indonesia**

[![Website](https://img.shields.io/badge/Website-uteroindonesia.com-blue?logo=google-chrome)](https://uteroindonesia.com)
[![Website](https://img.shields.io/badge/Website-carubra.com-orange?logo=google-chrome)](https://carubra.com)

---

### Need Help?

- 📖 Cek [Dokumentasi](docs/README.md) terlebih dahulu
- 🐛 Report bugs via [Issues](../../issues)
- 💡 Request features via [Issues](../../issues)
- 📧 Email untuk pertanyaan private
- 📱 DM Instagram untuk pertanyaan cepat

---

**Made with ❤️ by Mas Kharisman & Utero Indonesia Team**

⭐ Star project ini jika bermanfaat!

</div>

---

<div align="center">
<sub>Last updated: July 2026</sub>
</div>
