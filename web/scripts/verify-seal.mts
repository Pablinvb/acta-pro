/**
 * Verificación del sello de tiempo de las firmas.
 *
 * Un sello que no detecta un cambio es peor que no tener sello: promete algo
 * que no cumple, y un docente que crea estar respaldado deja de guardar sus
 * propias pruebas. Así que aquí se comprueba exactamente eso — que cambiar
 * cualquier cosa cambia la huella, y que no cambiar nada la deja igual.
 *
 *   npm --prefix web run verify:seal
 */

import {
  canonicalPayload,
  computeSeal,
  formatSeal,
  formatSignedAt,
  SEAL_VERSION,
} from '../src/services/seal.ts';

let ok = 0;
let fallos = 0;

function comprobar(descripcion: string, condicion: boolean, detalle = '') {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${descripcion}`);
  } else {
    fallos++;
    console.log(`  ✗ ${descripcion}${detalle ? `\n      ${detalle}` : ''}`);
  }
}

const FIRMADO = '2026-08-20T18:22:31.500Z';

const base = {
  documentCode: 'ACTA-2026-JUAN-PEREZ-0001',
  sections: [
    {
      number: 1,
      title: 'Datos generales' as const,
      fields: [{ label: 'Estudiante', value: 'Juan Pérez López' }],
    },
    {
      number: 7,
      title: 'Acuerdos' as const,
      items: ['Plan de refuerzo los miércoles de 14:00 a 15:00.'],
    },
    { number: 8, title: 'Compromisos' as const, items: ['La representante revisará el cuaderno.'] },
  ],
  signatures: [
    {
      signer_role: 'teacher' as const,
      signer_name: 'Ana Pérez',
      signed_at: FIRMADO,
      image: 'data:image/png;base64,AAAA',
    },
    {
      signer_role: 'representative' as const,
      signer_name: 'María López',
      signed_at: FIRMADO,
      image: 'data:image/png;base64,BBBB',
    },
  ],
};

/** Copia profunda, para poder alterar un detalle sin tocar el original. */
const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

console.log('\nACTA PRO · sello de tiempo de las firmas\n');

const original = await computeSeal(base);

console.log('La huella');
comprobar('es un SHA-256 en hexadecimal', /^[0-9a-f]{64}$/.test(original), original);
comprobar('el mismo acta produce la misma huella', (await computeSeal(base)) === original);
comprobar(
  'y no depende del orden en que lleguen las firmas',
  (await computeSeal({ ...base, signatures: [...base.signatures].reverse() })) === original,
  'si dependiera del orden de la base de datos, sería irreproducible y por tanto inútil',
);
comprobar(
  'ni del orden en que lleguen las secciones',
  (await computeSeal({ ...base, sections: [...base.sections].reverse() })) === original,
);
comprobar('el texto sellado lleva la versión del formato', canonicalPayload(base).startsWith(SEAL_VERSION));

console.log('\nQué detecta');

{
  const alterada = clonar(base);
  alterada.sections[1].items[0] = 'Plan de refuerzo los miércoles de 14:00 a 16:00.';
  comprobar(
    'cambiar una hora dentro de un acuerdo cambia la huella',
    (await computeSeal(alterada)) !== original,
  );
}

{
  const alterada = clonar(base);
  alterada.sections[1].items.push('Acuerdo añadido después de firmar.');
  comprobar('añadir un acuerdo después cambia la huella', (await computeSeal(alterada)) !== original);
}

{
  const alterada = clonar(base);
  alterada.sections[1].items = [];
  comprobar('borrar un acuerdo cambia la huella', (await computeSeal(alterada)) !== original);
}

{
  const alterada = clonar(base);
  alterada.sections[0].fields[0].value = 'Otro Estudiante';
  comprobar('cambiar un dato general cambia la huella', (await computeSeal(alterada)) !== original);
}

{
  const alterada = clonar(base);
  alterada.signatures[0].signed_at = '2026-08-19T18:22:31.500Z';
  comprobar(
    'retrasar la fecha de firma cambia la huella',
    (await computeSeal(alterada)) !== original,
    'es la razón de ser del sello: que la fecha no se pueda mover a posteriori',
  );
}

{
  const alterada = clonar(base);
  alterada.signatures[1].image = 'data:image/png;base64,CCCC';
  comprobar('sustituir una firma cambia la huella', (await computeSeal(alterada)) !== original);
}

{
  const alterada = clonar(base);
  alterada.signatures[1].signer_name = 'Otra Persona';
  comprobar('cambiar quién firmó cambia la huella', (await computeSeal(alterada)) !== original);
}

{
  const alterada = clonar(base);
  alterada.documentCode = 'ACTA-2026-JUAN-PEREZ-0002';
  comprobar('cambiar el código del acta cambia la huella', (await computeSeal(alterada)) !== original);
}

{
  /*
   * Un texto que contenga el separador no puede hacerse pasar por dos campos
   * distintos: sin escaparlo, mover un «|» dentro de un acuerdo produciría la
   * misma huella que partirlo en dos, y el sello se podría burlar.
   */
  const a = clonar(base);
  a.sections[1].items = ['uno|dos'];
  const b = clonar(base);
  b.sections[1].items = ['uno', 'dos'];
  comprobar(
    'el separador va escapado: «uno|dos» no equivale a «uno», «dos»',
    (await computeSeal(a)) !== (await computeSeal(b)),
  );
}

console.log('\nPresentación');

comprobar(
  'la huella se agrupa de ocho en ocho para poder cotejarla',
  formatSeal('abcdef0123456789'.repeat(4)).split(' ').length === 8,
  formatSeal(original),
);
comprobar('y va en mayúsculas', formatSeal(original) === formatSeal(original).toUpperCase());

comprobar(
  'la hora de firma se imprime en la zona del centro, no en UTC',
  formatSignedAt(FIRMADO, 'America/Guayaquil') === '20/08/2026 a las 13:22',
  formatSignedAt(FIRMADO, 'America/Guayaquil'),
);
comprobar(
  'una fecha ilegible se devuelve tal cual en lugar de romper el acta',
  formatSignedAt('cuando sea', 'America/Guayaquil') === 'cuando sea',
);

console.log(`\n${ok} comprobaciones correctas, ${fallos} fallidas\n`);
process.exit(fallos === 0 ? 0 : 1);
