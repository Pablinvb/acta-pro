/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /*
   * PDFKit carga sus métricas de fuente (.afm) leyendo del disco en tiempo de
   * ejecución. Si se empaqueta, esas rutas dejan de existir y falla con ENOENT
   * al crear el documento. Dejándolo fuera del bundle se resuelve desde
   * node_modules como espera.
   */
  serverExternalPackages: ['pdfkit'],
  // La app maneja datos de estudiantes: nada de este contenido debe cachearse
  // en intermediarios ni indexarse.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
