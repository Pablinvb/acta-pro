import type { NextRequest } from 'next/server';
import { handle } from '@/app/api/_handler';
import { getRepositories } from '@/repositories';

/**
 * Repositorio de actas.
 *
 * Es el «Índice y búsqueda» del diagrama, y con almacenamiento de objetos deja
 * de ser una comodidad: si los archivos no están en un Drive que la docente
 * pueda abrir, esta es la única forma de llegar a un acta archivada.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  return handle(() =>
    getRepositories().documents.search({
      query: params.get('q') ?? undefined,
      studentId: params.get('estudiante') ?? undefined,
      from: params.get('desde') ?? undefined,
      to: params.get('hasta') ?? undefined,
    }),
  );
}
