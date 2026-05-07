export interface SeoBreadcrumb {
  name: string;
  path: string;
}

export interface SeoData {
  title: string;
  description: string;
  canonicalPath: string;
  keywords: readonly string[];
  imagePath?: string;
  imageAlt?: string;
  robots?: string;
  breadcrumbs?: readonly SeoBreadcrumb[];
  jsonLd?: readonly Record<string, unknown>[];
}

export const SEO_SITE = {
  name: 'PgStudio Gateway',
  defaultTitle: 'PgStudio Gateway | Administrador web para PostgreSQL',
  description:
    'Administra PostgreSQL desde el navegador con editor SQL, gateway seguro, auditoria, RBAC y despliegue Cloud o Self-Hosted.',
  url: 'https://pgstudio.dev',
  language: 'es',
  locale: 'es_ES',
  imagePath: '/assets/landing-gateway-preview.png',
  imageAlt: 'Interfaz web de PgStudio Gateway para administrar PostgreSQL',
  themeColor: '#0f766e',
  githubUrl: 'https://github.com/misaelvillegas97/postgres-web-manager',
} as const;

const appJsonLd = {
  '@type': 'SoftwareApplication',
  '@id': `${SEO_SITE.url}/#software`,
  name: SEO_SITE.name,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  url: `${SEO_SITE.url}/`,
  codeRepository: SEO_SITE.githubUrl,
  image: `${SEO_SITE.url}${SEO_SITE.imagePath}`,
  description: SEO_SITE.description,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

export const SEO_PAGES = {
  home: {
    title: SEO_SITE.defaultTitle,
    description: SEO_SITE.description,
    canonicalPath: '/',
    keywords: [
      'PostgreSQL web manager',
      'administrador PostgreSQL web',
      'editor SQL online',
      'database gateway',
      'PgStudio Gateway',
    ],
    breadcrumbs: [{ name: 'Inicio', path: '/' }],
    jsonLd: [appJsonLd],
  },
  cloud: {
    title: 'PgStudio Cloud | Gestion PostgreSQL instantanea',
    description:
      'Usa PgStudio Gateway en la nube para administrar PostgreSQL desde el navegador sin instalar clientes ni gestionar servidores.',
    canonicalPath: '/cloud',
    keywords: [
      'PostgreSQL cloud',
      'PgStudio Cloud',
      'editor SQL cloud',
      'PostgreSQL SaaS',
    ],
    breadcrumbs: [
      { name: 'Inicio', path: '/' },
      { name: 'Cloud', path: '/cloud' },
    ],
    jsonLd: [
      {
        '@type': 'Service',
        name: 'PgStudio Cloud',
        serviceType: 'Managed PostgreSQL web administration gateway',
        provider: { '@id': `${SEO_SITE.url}/#organization` },
        url: `${SEO_SITE.url}/cloud`,
        description:
          'Servicio gestionado para consultar, auditar y administrar bases PostgreSQL desde el navegador.',
      },
    ],
  },
  selfHosted: {
    title:
      'PgStudio Self-Hosted | PostgreSQL web manager en tu infraestructura',
    description:
      'Despliega PgStudio Gateway en tu VPC, servidor o Kubernetes para mantener PostgreSQL y credenciales dentro de tu red.',
    canonicalPath: '/self-hosted',
    keywords: [
      'PostgreSQL self hosted',
      'PostgreSQL Docker',
      'PostgreSQL Kubernetes',
      'database gateway self hosted',
    ],
    breadcrumbs: [
      { name: 'Inicio', path: '/' },
      { name: 'Self-Hosted', path: '/self-hosted' },
    ],
    jsonLd: [
      {
        '@type': 'TechArticle',
        headline: 'PgStudio Self-Hosted',
        url: `${SEO_SITE.url}/self-hosted`,
        about: ['PostgreSQL', 'Self-hosting', 'Docker Compose', 'Kubernetes'],
        inLanguage: SEO_SITE.language,
      },
    ],
  },
  deploy: {
    title:
      'Desplegar PgStudio Gateway | Docker, Railway, Fly.io, Vercel y Kubernetes',
    description:
      'Guia de despliegue de PgStudio Gateway con Docker Compose, Railway, Fly.io, Vercel frontend-only y Kubernetes Helm.',
    canonicalPath: '/deploy',
    keywords: [
      'deploy PostgreSQL manager',
      'Docker PostgreSQL web manager',
      'Railway PostgreSQL',
      'Kubernetes PostgreSQL admin',
    ],
    breadcrumbs: [
      { name: 'Inicio', path: '/' },
      { name: 'Deploy', path: '/deploy' },
    ],
    jsonLd: [
      {
        '@type': 'TechArticle',
        headline: 'Desplegar PgStudio Gateway',
        url: `${SEO_SITE.url}/deploy`,
        about: [
          'Docker',
          'Railway',
          'Fly.io',
          'Vercel',
          'Kubernetes',
          'PostgreSQL',
        ],
        inLanguage: SEO_SITE.language,
      },
    ],
  },
  docs: {
    title: 'Documentacion PgStudio Gateway | PostgreSQL web manager',
    description:
      'Documentacion para empezar con PgStudio Gateway: arquitectura, editor SQL, explorador de esquemas, EXPLAIN, RBAC y auditoria.',
    canonicalPath: '/docs',
    keywords: [
      'documentacion PostgreSQL manager',
      'PgStudio docs',
      'EXPLAIN ANALYZE web',
      'editor SQL Monaco',
    ],
    breadcrumbs: [
      { name: 'Inicio', path: '/' },
      { name: 'Docs', path: '/docs' },
    ],
    jsonLd: [
      {
        '@type': 'TechArticle',
        headline: 'Documentacion PgStudio Gateway',
        url: `${SEO_SITE.url}/docs`,
        about: [
          'PostgreSQL',
          'SQL editor',
          'RBAC',
          'audit logging',
          'database metadata',
        ],
        inLanguage: SEO_SITE.language,
      },
    ],
  },
  pricing: {
    title: 'Precios PgStudio Gateway | Cloud beta y Self-Hosted gratis',
    description:
      'Compara PgStudio Gateway Self-Hosted gratis, Cloud durante beta y opciones Enterprise para equipos con requisitos avanzados.',
    canonicalPath: '/pricing',
    keywords: [
      'precio PostgreSQL web manager',
      'PgStudio pricing',
      'PostgreSQL admin gratis',
      'PostgreSQL SaaS beta',
    ],
    breadcrumbs: [
      { name: 'Inicio', path: '/' },
      { name: 'Precios', path: '/pricing' },
    ],
    jsonLd: [
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Puedo usar PgStudio Self-Hosted en produccion?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Si. PgStudio Gateway puede desplegarse en tu propia infraestructura para mantener datos y credenciales dentro de tu red.',
            },
          },
          {
            '@type': 'Question',
            name: 'Que versiones de PostgreSQL son compatibles?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'PgStudio Gateway usa el protocolo estandar de PostgreSQL y es compatible con PostgreSQL 12+ y servicios compatibles como RDS, Neon y Supabase.',
            },
          },
        ],
      },
    ],
  },
  login: {
    title: 'Iniciar sesion | PgStudio Gateway',
    description: 'Accede a tu workspace de PgStudio Gateway.',
    canonicalPath: '/login',
    keywords: ['PgStudio login'],
    robots: 'noindex, nofollow',
  },
  register: {
    title: 'Crear cuenta | PgStudio Gateway',
    description: 'Crea una cuenta privada en PgStudio Gateway.',
    canonicalPath: '/register',
    keywords: ['PgStudio register'],
    robots: 'noindex, nofollow',
  },
  confirmEmail: {
    title: 'Confirmar email | PgStudio Gateway',
    description: 'Confirma tu email para acceder a PgStudio Gateway.',
    canonicalPath: '/confirm-email',
    keywords: ['PgStudio email confirmation'],
    robots: 'noindex, nofollow',
  },
  forgotPassword: {
    title: 'Recuperar password | PgStudio Gateway',
    description: 'Solicita la recuperacion de password de PgStudio Gateway.',
    canonicalPath: '/forgot-password',
    keywords: ['PgStudio password recovery'],
    robots: 'noindex, nofollow',
  },
  resetPassword: {
    title: 'Restablecer password | PgStudio Gateway',
    description: 'Restablece tu password de PgStudio Gateway.',
    canonicalPath: '/reset-password',
    keywords: ['PgStudio reset password'],
    robots: 'noindex, nofollow',
  },
  workspace: {
    title: 'Workspace | PgStudio Gateway',
    description: 'Workspace privado de PgStudio Gateway.',
    canonicalPath: '/workspace',
    keywords: ['PgStudio workspace'],
    robots: 'noindex, nofollow',
  },
  connections: {
    title: 'Conexiones | PgStudio Gateway',
    description:
      'Gestion privada de conexiones PostgreSQL en PgStudio Gateway.',
    canonicalPath: '/connections',
    keywords: ['PgStudio connections'],
    robots: 'noindex, nofollow',
  },
} satisfies Record<string, SeoData>;

export const PRERENDERED_PUBLIC_PATHS = [
  '',
  'cloud',
  'self-hosted',
  'deploy',
  'docs',
  'pricing',
] as const;
