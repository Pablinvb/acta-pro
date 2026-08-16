import { AppShell } from '@/components/AppShell';
import { PageHead } from '@/components/ui';
import { ACTIVE_MEETING_ID } from '@/lib/mock/data';
import { getRepositories } from '@/repositories';
import { requireSession } from '@/lib/session';
import { describeStorage } from '@/services/storage/index';
import { RepositorioClient } from './RepositorioClient';

export const metadata = { title: 'Repositorio · ACTA PRO' };

export default async function RepositorioPage() {
  const session = await requireSession();
  const documents = await getRepositories().documents.search({});

  return (
    <AppShell
      meetingId={ACTIVE_MEETING_ID}
      title="Archivo de actas · todas las reuniones documentadas"
      teacherName={session.name}
      teacherId={session.teacherId}
    >
      <div className="flex flex-col gap-4 p-5.5">
        <PageHead
          title="Repositorio de actas"
          subtitle={describeStorage()}
          tag="ÍNDICE Y BÚSQUEDA"
        />
        <RepositorioClient initial={documents} />
      </div>
    </AppShell>
  );
}
